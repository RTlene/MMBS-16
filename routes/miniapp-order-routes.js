const express = require('express');
const { Op } = require('sequelize');
const { Order, OrderItem, Member, Product, ProductSKU, ProductMemberPrice, OrderOperationLog, VerificationCode, RefundRecord, ReturnRequest, Store, Coupon, MemberCoupon, sequelize } = require('../db');
const CommissionService = require('../services/commissionService');
const configStore = require('../services/configStore');
const { authenticateMiniappUser } = require('../middleware/miniapp-auth');

// 尝试加载 PromotionService，如果失败则设为 null
let PromotionService = null;
try {
    PromotionService = require('../services/promotionService');
    if (!PromotionService || typeof PromotionService.applyPromotionsToOrder !== 'function') {
        console.warn('[OrderRoutes] PromotionService 加载失败或方法不存在，将使用原价计算');
        PromotionService = null;
    }
} catch (error) {
    console.warn('[OrderRoutes] PromotionService 加载失败:', error.message);
    PromotionService = null;
}

const router = express.Router();

// 生成核销码（格式：日期6位+随机6位，唯一性由业务层保证）
function generateVerificationCode() {
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const randomStr = Math.floor(100000 + Math.random() * 900000).toString();
    return dateStr + randomStr;
}

// 生成在库中不重复的核销码（无 DB unique 索引时由业务层保证唯一）
async function generateUniqueVerificationCode(maxRetries = 10) {
    for (let i = 0; i < maxRetries; i++) {
        const code = generateVerificationCode();
        const exists = await VerificationCode.findOne({ where: { code }, attributes: ['id'] });
        if (!exists) return code;
    }
    throw new Error('生成唯一核销码重试次数超限');
}


// 创建订单（小程序端）- 修改版本
router.post('/orders', authenticateMiniappUser, async (req, res) => {
    try {
        let {
            items = [],
            productId,
            skuId,
            quantity = 1,
            shippingAddress,
            receiverName,
            receiverPhone,
            deliveryType = 'delivery',  // delivery-配送上门, pickup-门店自提
            storeId = null,             // 门店自提时的门店ID
            remark = '',
            paymentMethod = 'wechat',
            appliedCoupons = [],
            appliedPromotions = [],
            pointUsage = null,
            commissionUsage = null,
            pointsUsage = null
        } = req.body;

        const member = req.member;
        
        // 重新加载会员信息以获取最新的佣金和积分余额
        const freshMember = await Member.findByPk(member.id);
        if (!freshMember) {
            return res.status(404).json({
                code: 1,
                message: '会员不存在'
            });
        }

        // 检查订单中是否包含服务商品
        let hasServiceProduct = false;
        for (const rawItem of items) {
            const { productId } = rawItem;
            if (productId) {
                const product = await Product.findByPk(productId);
                if (product && product.productType === 'service') {
                    hasServiceProduct = true;
                    break;
                }
            }
        }

        const isPickup = deliveryType === 'pickup';
        if (!hasServiceProduct) {
            if (isPickup) {
                if (!storeId) {
                    return res.status(400).json({ code: 1, message: '请选择自提门店' });
                }
                const store = await Store.findByPk(storeId);
                if (!store || store.status !== 'active') {
                    return res.status(400).json({ code: 1, message: '所选门店不存在或已停用' });
                }
            } else {
                if (!shippingAddress || !receiverName || !receiverPhone) {
                    return res.status(400).json({ code: 1, message: '请填写收货信息' });
                }
            }
        }

        // 兼容旧参数，自动转换为单商品结算
        if ((!items || items.length === 0) && productId && skuId) {
            items = [{ productId, skuId, quantity }];
        }

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                code: 1,
                message: '请至少选择一个商品'
            });
        }

        const normalizedItems = [];
        let orderTotalAmount = 0;
        let totalQuantity = 0;

        for (const rawItem of items) {
            const { productId, skuId, quantity = 1 } = rawItem;

            if (!productId || !skuId || !quantity) {
                return res.status(400).json({
                    code: 1,
                    message: '商品信息不完整'
                });
            }

            const product = await Product.findByPk(productId);
            if (!product || product.status !== 'active') {
                return res.status(400).json({
                    code: 1,
                    message: '商品不存在或已下架'
                });
            }

            const sku = await ProductSKU.findByPk(skuId);
            if (!sku || sku.status !== 'active') {
                return res.status(400).json({
                    code: 1,
                    message: '商品规格不存在或已下架'
                });
            }

            // 计算价格：优先会员价（会员价不参与任何优惠）
            let unitPrice = parseFloat(sku.price || 0);
            let itemTotal = unitPrice * quantity;
            let itemDiscounts = [];
            let itemAppliedCoupons = [];
            let itemAppliedPromotions = [];

            const memberLevelId = freshMember.memberLevelId ? parseInt(freshMember.memberLevelId, 10) : null;
            const memberPriceRow = memberLevelId
                ? await ProductMemberPrice.findOne({ where: { productId, memberLevelId } })
                : null;

            if (memberPriceRow) {
                unitPrice = parseFloat(memberPriceRow.price || 0);
                itemTotal = unitPrice * quantity;
                // 会员价不参与优惠，不再走促销
            } else {
                // 如果 PromotionService 可用，尝试应用促销
                try {
                    if (PromotionService && typeof PromotionService.applyPromotionsToOrder === 'function') {
                        const promoResult = await PromotionService.applyPromotionsToOrder(
                            { productId, skuId, quantity },
                            member.id,
                            appliedCoupons,
                            appliedPromotions,
                            pointUsage
                        );
                        
                        if (promoResult) {
                            unitPrice = parseFloat(promoResult.unitPrice || sku.price || 0);
                            itemTotal = parseFloat(promoResult.totalAmount || (unitPrice * quantity));
                            itemDiscounts = promoResult.discounts || [];
                            itemAppliedCoupons = promoResult.appliedCoupons || [];
                            itemAppliedPromotions = promoResult.appliedPromotions || [];
                        }
                    }
                } catch (promoError) {
                    console.error('[Order] 应用促销失败，使用原价:', promoError);
                }
            }

            orderTotalAmount += itemTotal;
            totalQuantity += quantity;

            // 订单快照：只保留必要的业务信息，不存储图片
            normalizedItems.push({
                productId,
                skuId,
                quantity,
                unitPrice,
                totalAmount: itemTotal,
                productName: product.name,
                skuName: sku.name,
                productImage: null, // 不存储图片，需要时通过 productId 查询
                productSnapshot: {
                    id: product.id,
                    name: product.name,
                    brand: product.brand || null
                },
                skuSnapshot: {
                    id: sku.id,
                    name: sku.name,
                    sku: sku.sku || null,
                    price: sku.price,
                    attributes: sku.attributes || null
                },
                appliedCoupons: itemAppliedCoupons,
                appliedPromotions: itemAppliedPromotions,
                discounts: itemDiscounts
            });
        }

        // 计算抵扣金额
        let commissionDeduction = 0;
        let pointsDeduction = 0;
        let finalAmount = orderTotalAmount;

        // 处理佣金抵扣（1元佣金 = 1元）
        if (commissionUsage && commissionUsage > 0) {
            const availableCommission = parseFloat(freshMember.availableCommission || 0);
            const usedCommission = Math.min(commissionUsage, availableCommission, finalAmount);
            commissionDeduction = usedCommission;
            finalAmount -= usedCommission;
        }

        // 处理积分抵扣（假设100积分 = 1元，可根据实际业务调整）
        const POINTS_TO_MONEY_RATE = 100; // 积分兑换比例
        if (pointsUsage && pointsUsage > 0) {
            const availablePoints = parseInt(freshMember.availablePoints || 0);
            const usedPoints = Math.min(pointsUsage, availablePoints);
            const pointsMoneyValue = usedPoints / POINTS_TO_MONEY_RATE;
            pointsDeduction = Math.min(pointsMoneyValue, finalAmount);
            finalAmount -= pointsDeduction;
        }

        // 确保最终金额不为负数
        finalAmount = Math.max(0, finalAmount);

        const orderNo = `MINI${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
        const primaryItem = normalizedItems[0];

        // 如果最终金额为0，自动设置为已支付状态
        const orderStatus = finalAmount <= 0 ? 'paid' : 'pending';
        const actualPaymentMethod = finalAmount <= 0 ? 
            (commissionDeduction > 0 && pointsDeduction > 0 ? 'mixed' : 
             commissionDeduction > 0 ? 'commission' : 'points') : 
            paymentMethod;

        const orderPayload = {
            orderNo,
            memberId: member.id,
            productId: primaryItem.productId,
            quantity: totalQuantity,
            unitPrice: primaryItem.unitPrice,
            totalAmount: finalAmount,
            status: orderStatus,
            paymentMethod: actualPaymentMethod,
            paymentTime: orderStatus === 'paid' ? new Date() : null,
            shippingAddress: isPickup ? null : shippingAddress,
            receiverName: isPickup ? null : receiverName,
            receiverPhone: isPickup ? null : receiverPhone,
            remark,
            isTest: false,
            createdBy: member.id
        };
        // 若数据库尚未执行 deliveryType/storeId 迁移，则不带这两字段插入
        let order;
        try {
            order = await Order.create({
                ...orderPayload,
                deliveryType: isPickup ? 'pickup' : 'delivery',
                storeId: isPickup ? parseInt(storeId, 10) : null
            });
        } catch (createErr) {
            const isStoreIdError = createErr.name === 'SequelizeDatabaseError' && createErr.original && (String(createErr.original.message || '').includes('storeId') || String(createErr.original.message || '').includes('deliveryType'));
            if (isStoreIdError) {
                order = await Order.create(orderPayload);
            } else {
                throw createErr;
            }
        }

        // 如果使用了佣金或积分，扣除相应的余额
        if (commissionDeduction > 0 || pointsDeduction > 0) {
            const updateData = {};
            if (commissionDeduction > 0) {
                updateData.availableCommission = parseFloat(freshMember.availableCommission || 0) - commissionDeduction;
                updateData.totalCommission = parseFloat(freshMember.totalCommission || 0) - commissionDeduction;
            }
            if (pointsDeduction > 0) {
                const usedPoints = Math.ceil(pointsDeduction * POINTS_TO_MONEY_RATE);
                updateData.availablePoints = parseInt(freshMember.availablePoints || 0) - usedPoints;
                updateData.totalPoints = parseInt(freshMember.totalPoints || 0) - usedPoints;
            }
            await freshMember.update(updateData);
        }

        const orderItemPayloads = normalizedItems.map(item => ({
            orderId: order.id,
            productId: item.productId,
            skuId: item.skuId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalAmount: item.totalAmount,
            productName: item.productName,
            skuName: item.skuName,
            productImage: item.productImage,
            productSnapshot: item.productSnapshot,
            skuSnapshot: item.skuSnapshot,
            appliedCoupons: item.appliedCoupons,
            appliedPromotions: item.appliedPromotions,
            discounts: item.discounts
        }));

        const createdOrderItems = await OrderItem.bulkCreate(orderItemPayloads);

        // 系统发放券：订单使用后标记 MemberCoupon 为已用并增加 Coupon.usedCount
        const appliedCodes = new Set();
        normalizedItems.forEach(item => {
            (item.appliedCoupons || []).forEach(c => { if (c && c.code) appliedCodes.add(c.code); });
        });
        for (const code of appliedCodes) {
            const coupon = await Coupon.findOne({ where: { code } });
            if (!coupon || (coupon.distributionMode || 'user_claim') !== 'system') continue;
            const grant = await MemberCoupon.findOne({
                where: { memberId: member.id, couponId: coupon.id, usedAt: null }
            });
            if (grant) {
                await grant.update({ usedAt: new Date(), orderId: order.id });
                await coupon.increment('usedCount', { by: 1 });
            }
        }

        // 如果是服务商品且订单已支付，立即生成核销码
        if (orderStatus === 'paid') {
            const verificationCodes = [];
            for (let i = 0; i < normalizedItems.length; i++) {
                const item = normalizedItems[i];
                const orderItem = createdOrderItems[i];
                const product = await Product.findByPk(item.productId);
                
                if (product && product.productType === 'service') {
                    // 为每个服务商品生成核销码（业务层保证唯一）
                    for (let qty = 0; qty < item.quantity; qty++) {
                        const code = await generateUniqueVerificationCode();
                        // 设置过期时间（默认30天后）
                        const expiredAt = new Date();
                        expiredAt.setDate(expiredAt.getDate() + 30);
                        
                        verificationCodes.push({
                            orderId: order.id,
                            orderItemId: orderItem.id,
                            memberId: member.id,
                            productId: item.productId,
                            skuId: item.skuId,
                            code: code,
                            status: 'unused',
                            expiredAt: expiredAt
                        });
                    }
                }
            }
            
            if (verificationCodes.length > 0) {
                await VerificationCode.bulkCreate(verificationCodes);
            }
        }

        await OrderOperationLog.create({
            orderId: order.id,
            operation: orderStatus === 'paid' ? 'pay' : 'create',
            operatorId: null, // 小程序用户不在 users 表中，设为 null
            operatorType: 'member',
            description: orderStatus === 'paid' 
                ? `小程序用户创建订单并完成支付（会员ID: ${member.id}，使用${commissionDeduction > 0 ? '佣金' : ''}${pointsDeduction > 0 ? '积分' : ''}抵扣）`
                : `小程序用户创建订单（会员ID: ${member.id}）`,
            data: {
                memberId: member.id, // 在 data 中记录会员ID
                items: normalizedItems,
                originalAmount: orderTotalAmount,
                commissionDeduction,
                pointsDeduction,
                finalAmount: finalAmount
            }
        });

        // 如果订单已支付，仅触发核销码生成与销售额累加；佣金在订单完成（确认收货/核销）时再计算
        if (orderStatus === 'paid') {
            try {
                // 如果是服务商品订单，确保核销码已生成
                const orderItems = await OrderItem.findAll({
                    where: { orderId: order.id },
                    include: [{
                        model: Product,
                        as: 'product',
                        attributes: ['id', 'productType']
                    }]
                });
                
                const verificationCodes = [];
                for (const orderItem of orderItems) {
                    if (orderItem.product && orderItem.product.productType === 'service') {
                        // 检查是否已有核销码
                        const existingCodes = await VerificationCode.count({
                            where: {
                                orderId: order.id,
                                orderItemId: orderItem.id
                            }
                        });
                        
                        // 如果核销码数量不足，补充生成
                        const needCodes = orderItem.quantity - existingCodes;
                        if (needCodes > 0) {
                            for (let i = 0; i < needCodes; i++) {
                                const code = await generateUniqueVerificationCode();
                                const expiredAt = new Date();
                                expiredAt.setDate(expiredAt.getDate() + 30);
                                
                                verificationCodes.push({
                                    orderId: order.id,
                                    orderItemId: orderItem.id,
                                    memberId: order.memberId,
                                    productId: orderItem.productId,
                                    skuId: orderItem.skuId,
                                    code: code,
                                    status: 'unused',
                                    expiredAt: expiredAt
                                });
                            }
                        }
                    }
                }
                
                if (verificationCodes.length > 0) {
                    await VerificationCode.bulkCreate(verificationCodes);
                }
            } catch (error) {
                console.error('自动计算佣金或生成核销码失败:', error);
            }
            try {
                await CommissionService.updateSalesOnOrderPaid(order.id);
            } catch (e) {
                console.error('销售额累加失败:', e);
            }
            try {
                const LevelUpgradeService = require('../services/levelUpgradeService');
                await LevelUpgradeService.tryUpgradeMember(order.memberId);
            } catch (e) {
                console.error('等级自动升级检查失败:', e);
            }
            try {
                const { grantPointsForOrderPaid } = require('../services/orderPointsService');
                await grantPointsForOrderPaid(order.id);
            } catch (e) {
                console.error('订单积分发放失败:', e);
            }
        }

        res.json({
            code: 0,
            message: orderStatus === 'paid' ? '订单创建成功并已完成支付' : '订单创建成功',
            data: {
                order: {
                    id: order.id,
                    orderNo: order.orderNo,
                    totalAmount: order.totalAmount,
                    originalAmount: orderTotalAmount,
                    commissionDeduction,
                    pointsDeduction,
                    status: order.status,
                    paymentMethod: order.paymentMethod,
                    shippingAddress: order.shippingAddress,
                    receiverName: order.receiverName,
                    receiverPhone: order.receiverPhone,
                    deliveryType: order.deliveryType,
                    storeId: order.storeId,
                    remark: order.remark,
                    createdAt: order.createdAt,
                    items: normalizedItems.map(item => ({
                        productId: item.productId,
                        skuId: item.skuId,
                        name: item.productName,
                        skuName: item.skuName,
                        image: item.productImage,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        totalAmount: item.totalAmount
                    }))
                }
            }
        });
    } catch (error) {
        console.error('创建订单失败:', error);
        res.status(500).json({
            code: 1,
            message: '创建订单失败',
            error: error.message
        });
    }
});

// 获取用户订单列表（小程序端）
router.get('/orders', authenticateMiniappUser, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status = '',
            startDate = '',
            endDate = ''
        } = req.query;

        const member = req.member;
        const offset = (page - 1) * limit;

        const where = { memberId: member.id };

        // 状态筛选
        if (status) {
            if (status === 'aftersale') {
                // 售后：有退货或退款记录的订单
                where[Op.or] = [
                    { returnStatus: { [Op.ne]: 'none' } },
                    { refundStatus: { [Op.ne]: 'none' } }
                ];
            } else if (status === 'unused') {
                // 待使用：已支付的服务商品订单，且有未使用的核销码
                where.status = 'paid';
                // 这个筛选会在后续处理中进一步过滤
            } else if (status === 'completed') {
                // 已完成：包含已收货(delivered)与已完成(completed)，用户端「已完成」tab 应看到这两类
                where.status = { [Op.in]: ['delivered', 'completed'] };
            } else if (status === 'paid') {
                // 待发货：仅需发货的订单（至少包含一件实物商品），纯服务订单只出现在「待使用」
                const [paidPhysicalRows] = await sequelize.query(
                    `SELECT DISTINCT o.id FROM orders o INNER JOIN order_items oi ON o.id = oi.orderId INNER JOIN Products p ON oi.productId = p.id WHERE o.memberId = :memberId AND o.status = 'paid' AND p.productType = 'physical'`,
                    { replacements: { memberId: member.id } }
                );
                const orderIds = (paidPhysicalRows || []).map(r => r.id);
                if (orderIds.length === 0) {
                    return res.json({
                        code: 0,
                        message: '获取成功',
                        data: { orders: [], total: 0, totalPages: 0, currentPage: parseInt(page), hasMore: false }
                    });
                }
                where.id = { [Op.in]: orderIds };
                where.status = 'paid';
            } else {
                where.status = status;
            }
        }

        // 日期筛选
        if (startDate && endDate) {
            where.createdAt = {
                [Op.between]: [new Date(startDate), new Date(endDate)]
            };
        }

        const { count, rows } = await Order.findAndCountAll({
            where,
            include: [
                { 
                    model: OrderItem,
                    as: 'items',
                    attributes: ['id', 'orderId', 'productId', 'skuId', 'productName', 'skuName', 'quantity', 'unitPrice', 'totalAmount'],
                    include: [{
                        model: Product,
                        as: 'product',
                        attributes: ['id', 'productType']
                    }]
                }
            ],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset),
            distinct: true
        });

        // 处理订单数据
        const orders = await Promise.all(rows.map(async (order) => {
            const items = formatOrderItems(order.items);
            // 从 items 中获取主商品信息，不再依赖 order.product
            const primaryItem = items && items.length > 0 ? {
                id: items[0].productId,
                productId: items[0].productId,
                name: items[0].productName || items[0].name || '商品',
                image: '' // 图片通过 productId 动态加载
            } : null;

            // 检查订单是否包含服务商品（从关联的product中获取）
            let hasServiceProduct = false;
            if (order.items && order.items.length > 0) {
                for (const orderItem of order.items) {
                    if (orderItem.product && orderItem.product.productType === 'service') {
                        hasServiceProduct = true;
                        break;
                    }
                }
            }

            // 对于已支付的服务商品订单，检查是否有未使用的核销码
            let hasUnusedCodes = false;
            if (hasServiceProduct && order.status === 'paid') {
                const unusedCount = await VerificationCode.count({
                    where: {
                        orderId: order.id,
                        status: 'unused'
                    }
                });
                hasUnusedCodes = unusedCount > 0;
            }

            return {
                id: order.id,
                orderNo: order.orderNo,
                product: primaryItem,
                quantity: order.quantity,
                unitPrice: order.unitPrice,
                totalAmount: order.totalAmount,
                status: order.status,
                statusText: hasServiceProduct && order.status === 'paid' && hasUnusedCodes ? '待使用' : getOrderStatusText(order.status),
                isServiceOrder: hasServiceProduct,
                hasUnusedCodes: hasUnusedCodes,
                paymentMethod: order.paymentMethod,
                paymentMethodText: getPaymentMethodText(order.paymentMethod),
                shippingAddress: order.shippingAddress,
                receiverName: order.receiverName,
                receiverPhone: order.receiverPhone,
                remark: order.remark,
                paymentTime: order.paymentTime,
                shippedAt: order.shippedAt,
                deliveredAt: order.deliveredAt,
                createdAt: order.createdAt,
                returnStatus: order.returnStatus,
                returnStatusText: getReturnStatusText(order.returnStatus),
                refundStatus: order.refundStatus,
                refundStatusText: getRefundStatusText(order.refundStatus),
                items
            };
        }));

        // 如果筛选的是"待使用"状态，只返回符合条件的订单
        let filteredOrders = orders;
        if (status === 'unused') {
            filteredOrders = orders.filter(order => order.isServiceOrder && order.status === 'paid' && order.hasUnusedCodes);
        }

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                orders: filteredOrders,
                total: status === 'unused' ? filteredOrders.length : count,
                totalPages: status === 'unused' ? Math.ceil(filteredOrders.length / limit) : Math.ceil(count / limit),
                currentPage: parseInt(page),
                hasMore: status === 'unused' ? parseInt(page) < Math.ceil(filteredOrders.length / limit) : parseInt(page) < Math.ceil(count / limit)
            }
        });
    } catch (error) {
        console.error('获取订单列表失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取订单列表失败',
            error: error.message
        });
    }
});

// 获取订单统计（小程序端）- 必须在 /orders/:id 之前定义
router.get('/orders/stats', authenticateMiniappUser, async (req, res) => {
    try {
        const member = req.member;

        // 使用 count 方法分别统计各状态订单数量
        const statusCounts = {
            pending: 0,
            paid: 0,
            shipped: 0,
            delivered: 0,
            completed: 0,
            cancelled: 0,
            returned: 0,
            refunded: 0
        };

        // 分别统计各状态的订单数量
        const statuses = Object.keys(statusCounts);
        for (const status of statuses) {
            try {
                const count = await Order.count({
                    where: { 
                        memberId: member.id,
                        status: status
                    }
                });
                statusCounts[status] = count || 0;
            } catch (err) {
                console.error(`统计订单状态 ${status} 失败:`, err);
                statusCounts[status] = 0;
            }
        }

        // 待发货（仅需发货的 paid 订单，排除纯服务订单），与订单列表「待发货」tab 一致（表名与 db.js 一致：Products）
        try {
            const [paidShipRows] = await sequelize.query(
                `SELECT COUNT(DISTINCT o.id) AS cnt FROM orders o INNER JOIN order_items oi ON o.id = oi.orderId INNER JOIN Products p ON oi.productId = p.id WHERE o.memberId = :memberId AND o.status = 'paid' AND p.productType = 'physical'`,
                { replacements: { memberId: member.id } }
            );
            statusCounts.paidNeedShip = (paidShipRows && paidShipRows[0] && parseInt(paidShipRows[0].cnt, 10)) || 0;
        } catch (err) {
            console.error('统计待发货(需发货)失败:', err.message || err);
            statusCounts.paidNeedShip = 0;
        }

        res.json({
            code: 0,
            message: '获取成功',
            data: { stats: statusCounts }
        });
    } catch (error) {
        console.error('获取订单统计失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取订单统计失败',
            error: error.message
        });
    }
});

// 获取订单详情（小程序端）
router.get('/orders/:id', authenticateMiniappUser, async (req, res) => {
    try {
        const { id } = req.params;
        const member = req.member;

        const order = await Order.findByPk(id, {
            include: [
                { 
                    model: Product, 
                    as: 'product', 
                    attributes: ['id', 'name', 'description', 'images', 'detailImages', 'brand']
                },
                {
                    model: OrderItem,
                    as: 'items'
                },
                {
                    model: OrderOperationLog,
                    as: 'operationLogs',
                    order: [['createdAt', 'DESC']],
                    limit: 10
                },
                { model: Store, as: 'store', required: false, attributes: ['id', 'name', 'address', 'region', 'latitude', 'longitude', 'phone', 'businessHours'] }
            ]
        });

        if (!order) {
            return res.status(404).json({
                code: 1,
                message: '订单不存在'
            });
        }

        // 检查订单是否属于当前用户
        if (order.memberId !== member.id) {
            return res.status(403).json({
                code: 1,
                message: '无权访问此订单'
            });
        }

        const items = formatOrderItems(order.items);
        const primaryItem = getPrimaryItem(items, order.product);

        // 检查订单是否包含服务商品，如果是，获取核销码
        let verificationCodes = [];
        let hasServiceProduct = false;
        if (items && items.length > 0) {
            for (const item of items) {
                if (item.productId) {
                    const product = await Product.findByPk(item.productId);
                    if (product && product.productType === 'service') {
                        hasServiceProduct = true;
                        break;
                    }
                }
            }
        }

        // 如果是服务商品订单且已支付，获取核销码
        if (hasServiceProduct && order.status === 'paid') {
            const codes = await VerificationCode.findAll({
                where: {
                    orderId: order.id,
                    memberId: member.id
                },
                include: [{
                    model: Product,
                    as: 'product',
                    attributes: ['id', 'name', 'productType']
                }, {
                    model: ProductSKU,
                    as: 'sku',
                    attributes: ['id', 'name'],
                    required: false
                }],
                order: [['createdAt', 'ASC']]
            });

            verificationCodes = codes.map(code => ({
                id: code.id,
                code: code.code,
                status: code.status,
                statusText: code.status === 'unused' ? '未使用' : code.status === 'used' ? '已使用' : code.status === 'expired' ? '已过期' : '已取消',
                productName: code.product?.name || '',
                skuName: code.sku?.name || '',
                expiredAt: code.expiredAt,
                usedAt: code.usedAt,
                createdAt: code.createdAt,
                isExpired: code.expiredAt ? new Date(code.expiredAt) < new Date() : false
            }));
        }

        const orderDetail = {
            id: order.id,
            orderNo: order.orderNo,
            product: primaryItem,
            quantity: order.quantity,
            unitPrice: order.unitPrice,
            totalAmount: order.totalAmount,
            status: order.status,
            statusText: getOrderStatusText(order.status),
            paymentMethod: order.paymentMethod,
            paymentMethodText: getPaymentMethodText(order.paymentMethod),
            paymentTime: order.paymentTime,
            deliveryType: order.deliveryType || 'delivery',
            storeId: order.storeId,
            store: order.store ? {
                id: order.store.id,
                name: order.store.name,
                address: order.store.address,
                region: order.store.region,
                latitude: order.store.latitude,
                longitude: order.store.longitude,
                phone: order.store.phone,
                businessHours: order.store.businessHours
            } : null,
            shippingAddress: order.shippingAddress,
            receiverName: order.receiverName,
            receiverPhone: order.receiverPhone,
            remark: order.remark,
            adminRemark: order.adminRemark,
            shippingCompany: order.shippingCompany,
            trackingNumber: order.trackingNumber,
            shippingMethod: order.shippingMethod,
            shippedAt: order.shippedAt,
            deliveredAt: order.deliveredAt,
            returnStatus: order.returnStatus,
            returnStatusText: getReturnStatusText(order.returnStatus),
            returnReason: order.returnReason,
            returnAmount: order.returnAmount,
            returnShippingCompany: order.returnShippingCompany,
            returnTrackingNumber: order.returnTrackingNumber,
            refundStatus: order.refundStatus,
            refundStatusText: getRefundStatusText(order.refundStatus),
            refundAmount: order.refundAmount,
            refundMethod: order.refundMethod,
            refundedAt: order.refundedAt,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            items,
            verificationCodes,
            isServiceOrder: hasServiceProduct,
            operationLogs: order.operationLogs.map(log => ({
                id: log.id,
                operation: log.operation,
                operationText: getOperationText(log.operation),
                description: log.description,
                createdAt: log.createdAt,
                data: log.data
            }))
        };

        // 退货已通过时返回平台退货地址，供用户邮寄
        if (order.returnStatus === 'approved') {
            const systemSettings = configStore.getSection('system') || {};
            orderDetail.returnAddress = systemSettings.returnAddress || '';
        }

        res.json({
            code: 0,
            message: '获取成功',
            data: { order: orderDetail }
        });
    } catch (error) {
        console.error('获取订单详情失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取订单详情失败',
            error: error.message
        });
    }
});

// 修改订单状态（小程序端）
router.put('/orders/:id/status', authenticateMiniappUser, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, remark = '' } = req.body;
        const member = req.member;

        // 验证状态
        const validStatuses = ['cancelled', 'delivered'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                code: 1,
                message: '无效的状态操作'
            });
        }

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({
                code: 1,
                message: '订单不存在'
            });
        }

        // 检查订单是否属于当前用户
        if (order.memberId !== member.id) {
            return res.status(403).json({
                code: 1,
                message: '无权操作此订单'
            });
        }

        // 状态变更验证
        if (status === 'cancelled') {
            if (!['pending', 'paid'].includes(order.status)) {
                return res.status(400).json({
                    code: 1,
                    message: '当前状态不允许取消'
                });
            }
        } else if (status === 'delivered') {
            if (order.status !== 'shipped') {
                return res.status(400).json({
                    code: 1,
                    message: '只有已发货的订单才能确认收货'
                });
            }
        }

        const oldStatus = order.status;
        const updateData = { status, updatedBy: member.id };

        if (status === 'delivered') {
            updateData.deliveredAt = new Date();
        }

        await order.update(updateData);

        // 记录操作日志
        await OrderOperationLog.create({
            orderId: order.id,
            operation: status === 'cancelled' ? 'cancel' : 'deliver',
            operatorId: null, // 小程序用户不在 users 表中，设为 null
            operatorType: 'member',
            oldStatus,
            newStatus: status,
            description: status === 'cancelled' ? `用户取消订单（会员ID: ${member.id}）` : `用户确认收货（会员ID: ${member.id}）`,
            data: { 
                memberId: member.id, // 在 data 中记录会员ID
                remark 
            }
        });

        // 订单完成（确认收货）时触发佣金计算
        if (status === 'delivered') {
            try {
                await CommissionService.calculateOrderCommission(order.id);
            } catch (e) {
                console.error('订单完成佣金计算失败:', e);
            }
        }

        // 如果订单状态变更为已支付，仅触发核销码生成；佣金在订单完成（确认收货/核销）时再计算
        if (status === 'paid') {
            try {
                // 如果是服务商品订单，确保核销码已生成
                const orderItems = await OrderItem.findAll({
                    where: { orderId: order.id },
                    include: [{
                        model: Product,
                        as: 'product',
                        attributes: ['id', 'productType']
                    }]
                });
                
                const verificationCodes = [];
                for (const orderItem of orderItems) {
                    if (orderItem.product && orderItem.product.productType === 'service') {
                        // 检查是否已有核销码
                        const existingCodes = await VerificationCode.count({
                            where: {
                                orderId: order.id,
                                orderItemId: orderItem.id
                            }
                        });
                        
                        // 如果核销码数量不足，补充生成
                        const needCodes = orderItem.quantity - existingCodes;
                        if (needCodes > 0) {
                            for (let i = 0; i < needCodes; i++) {
                                const code = await generateUniqueVerificationCode();
                                const expiredAt = new Date();
                                expiredAt.setDate(expiredAt.getDate() + 30);
                                
                                verificationCodes.push({
                                    orderId: order.id,
                                    orderItemId: orderItem.id,
                                    memberId: order.memberId,
                                    productId: orderItem.productId,
                                    skuId: orderItem.skuId,
                                    code: code,
                                    status: 'unused',
                                    expiredAt: expiredAt
                                });
                            }
                        }
                    }
                }
                
                if (verificationCodes.length > 0) {
                    await VerificationCode.bulkCreate(verificationCodes);
                }
            } catch (error) {
                console.error('自动计算佣金或生成核销码失败:', error);
            }
        }

        res.json({
            code: 0,
            message: '状态更新成功',
            data: { 
                order: {
                    id: order.id,
                    orderNo: order.orderNo,
                    status: order.status,
                    statusText: getOrderStatusText(order.status),
                    updatedAt: order.updatedAt
                }
            }
        });
    } catch (error) {
        console.error('更新订单状态失败:', error);
        res.status(500).json({
            code: 1,
            message: '更新订单状态失败',
            error: error.message
        });
    }
});

// 申请退货（小程序端）：创建退货单（含凭证图），订单关联
router.post('/orders/:id/return', authenticateMiniappUser, async (req, res) => {
    try {
        const { id } = req.params;
        const { reason, description = '', images = [] } = req.body;
        const member = req.member;

        if (!reason) {
            return res.status(400).json({
                code: 1,
                message: '请选择退货原因'
            });
        }

        const order = await Order.findByPk(id, {
            include: [{ model: OrderItem, as: 'items', required: false }]
        });
        if (!order) {
            return res.status(404).json({
                code: 1,
                message: '订单不存在'
            });
        }

        if (order.memberId !== member.id) {
            return res.status(403).json({
                code: 1,
                message: '无权操作此订单'
            });
        }

        if (!['delivered', 'shipped'].includes(order.status)) {
            return res.status(400).json({
                code: 1,
                message: '只有已发货或已收货的订单才能申请退货'
            });
        }

        if (order.returnStatus !== 'none') {
            return res.status(400).json({
                code: 1,
                message: '订单已存在退货申请'
            });
        }

        const items = order.items || [];
        const firstItem = items[0];
        const productId = firstItem ? firstItem.productId : (order.productId || 0);
        const quantity = firstItem ? firstItem.quantity : 1;
        const imageUrls = Array.isArray(images) ? images.filter(u => u && String(u).trim()) : [];

        const returnNo = 'RT' + Date.now();
        await ReturnRequest.create({
            returnNo,
            orderId: order.id,
            memberId: member.id,
            productId: productId || 0,
            quantity,
            reason,
            reasonDetail: description || null,
            images: imageUrls.length ? imageUrls : null,
            status: 'pending'
        });

        await order.update({
            returnStatus: 'requested',
            returnReason: reason,
            updatedBy: member.id
        });

        await OrderOperationLog.create({
            orderId: order.id,
            operation: 'return',
            operatorId: null,
            operatorType: 'member',
            description: `申请退货，原因：${reason}（会员ID: ${member.id}）`,
            data: { memberId: member.id, reason, description, images: imageUrls }
        });

        res.json({
            code: 0,
            message: '退货申请提交成功',
            data: {
                order: {
                    id: order.id,
                    orderNo: order.orderNo,
                    returnStatus: order.returnStatus,
                    returnStatusText: getReturnStatusText(order.returnStatus)
                }
            }
        });
    } catch (error) {
        console.error('申请退货失败:', error);
        res.status(500).json({
            code: 1,
            message: '申请退货失败',
            error: error.message
        });
    }
});

// 提交退货物流信息（用户回寄后填写，退货已通过时可用）
router.put('/orders/:id/return-logistics', authenticateMiniappUser, async (req, res) => {
    try {
        const { id } = req.params;
        const { returnShippingCompany, returnTrackingNumber } = req.body || {};
        const member = req.member;

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({ code: 1, message: '订单不存在' });
        }
        if (order.memberId !== member.id) {
            return res.status(403).json({ code: 1, message: '无权操作此订单' });
        }
        if (order.returnStatus !== 'approved') {
            return res.status(400).json({ code: 1, message: '仅退货已通过的订单可填写回寄物流' });
        }
        if (order.refundStatus === 'completed' || order.status === 'refunded') {
            return res.status(400).json({ code: 1, message: '该订单已退款完成' });
        }

        const company = (returnShippingCompany && String(returnShippingCompany).trim()) || null;
        const tracking = (returnTrackingNumber && String(returnTrackingNumber).trim()) || null;
        if (!company || !tracking) {
            return res.status(400).json({ code: 1, message: '请填写物流公司和物流单号' });
        }

        await order.update({
            returnShippingCompany: company,
            returnTrackingNumber: tracking,
            updatedBy: member.id
        });

        res.json({
            code: 0,
            message: '退货物流信息已提交',
            data: { order: { id: order.id, returnShippingCompany: order.returnShippingCompany, returnTrackingNumber: order.returnTrackingNumber } }
        });
    } catch (error) {
        console.error('提交退货物流失败:', error);
        res.status(500).json({ code: 1, message: '提交失败', error: error.message });
    }
});

// 申请退款（小程序端）
router.post('/orders/:id/refund', authenticateMiniappUser, async (req, res) => {
    try {
        const { id } = req.params;
        const { reason, refundAmount, refundMethod = 'original' } = req.body;
        const member = req.member;

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({
                code: 1,
                message: '订单不存在'
            });
        }

        // 检查订单是否属于当前用户
        if (order.memberId !== member.id) {
            return res.status(403).json({
                code: 1,
                message: '无权操作此订单'
            });
        }

        // 仅未发货、已取消可申请退款；退货成功由后台处理退款，无需用户再申请
        const canRefund = ['paid', 'cancelled'].includes(order.status);
        if (!canRefund) {
            return res.status(400).json({
                code: 1,
                message: '仅未发货或已取消的订单可申请退款；退货成功由商家处理退款'
            });
        }

        // 检查是否已有退款申请
        if (order.refundStatus !== 'none') {
            return res.status(400).json({
                code: 1,
                message: '订单已存在退款申请'
            });
        }

        const finalRefundAmount = parseFloat(refundAmount || order.returnAmount || order.totalAmount);

        await order.update({
            refundStatus: 'requested',
            refundAmount: finalRefundAmount,
            refundMethod,
            updatedBy: member.id
        });

        // 创建退款记录，供后台「退款管理」列表展示与处理
        const refundNo = `RF${Date.now()}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
        await RefundRecord.create({
            refundNo,
            orderId: order.id,
            returnRequestId: null,
            memberId: member.id,
            amount: finalRefundAmount,
            method: refundMethod,
            status: 'pending',
            reason: reason || '用户申请退款'
        });

        // 记录操作日志
        await OrderOperationLog.create({
            orderId: order.id,
            operation: 'refund',
            operatorId: null, // 小程序用户不在 users 表中，设为 null
            operatorType: 'member',
            description: `申请退款，金额：${finalRefundAmount}元（会员ID: ${member.id}）`,
            data: {
                memberId: member.id,
                reason,
                refundAmount: finalRefundAmount,
                refundMethod
            }
        });

        res.json({
            code: 0,
            message: '退款申请提交成功',
            data: { 
                order: {
                    id: order.id,
                    orderNo: order.orderNo,
                    refundStatus: order.refundStatus,
                    refundStatusText: getRefundStatusText(order.refundStatus),
                    refundAmount: finalRefundAmount
                }
            }
        });
    } catch (error) {
        console.error('申请退款失败:', error);
        res.status(500).json({
            code: 1,
            message: '申请退款失败',
            error: error.message
        });
    }
});


// 辅助函数
function parseSnapshot(snapshot) {
    if (!snapshot) return null;
    if (typeof snapshot === 'object') return snapshot;
    try {
        return JSON.parse(snapshot);
    } catch (err) {
        return null;
    }
}

function formatOrderItems(rawItems = []) {
    return rawItems.map(item => {
        const productSnapshot = parseSnapshot(item.productSnapshot);
        const skuSnapshot = parseSnapshot(item.skuSnapshot);
        const image = item.productImage 
            || (skuSnapshot && Array.isArray(skuSnapshot.images) && skuSnapshot.images[0]) 
            || (productSnapshot && Array.isArray(productSnapshot.images) && productSnapshot.images[0]) 
            || null;

        return {
            id: item.id,
            productId: item.productId,
            skuId: item.skuId,
            name: item.productName || (productSnapshot ? productSnapshot.name : ''),
            productName: item.productName || (productSnapshot ? productSnapshot.name : ''),
            skuName: item.skuName || (skuSnapshot ? skuSnapshot.name : ''),
            image,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalAmount: item.totalAmount,
            appliedCoupons: item.appliedCoupons || [],
            appliedPromotions: item.appliedPromotions || [],
            discounts: item.discounts || []
        };
    });
}

function getPrimaryItem(items, fallbackProduct) {
    if (items && items.length > 0) {
        return items[0];
    }

    if (fallbackProduct) {
        return {
            id: fallbackProduct.id,
            productId: fallbackProduct.id,
            name: fallbackProduct.name,
            image: fallbackProduct.images && fallbackProduct.images.length > 0 ? fallbackProduct.images[0] : null
        };
    }

    return null;
}

function getOrderStatusText(status) {
    const statusMap = {
        'pending': '待支付',
        'paid': '已支付',
        'shipped': '已发货',
        'delivered': '已收货',
        'cancelled': '已取消',
        'returned': '已退货',
        'refunded': '已退款'
    };
    return statusMap[status] || status;
}

function getPaymentMethodText(method) {
    const methodMap = {
        'wechat': '微信支付',
        'alipay': '支付宝',
        'bank': '银行卡',
        'points': '积分支付',
        'commission': '佣金支付'
    };
    return methodMap[method] || method || '-';
}

function getReturnStatusText(status) {
    const statusMap = {
        'none': '无',
        'requested': '申请中',
        'approved': '已通过',
        'rejected': '已拒绝',
        'returned': '已退货',
        'refunded': '已退款'
    };
    return statusMap[status] || status;
}

function getRefundStatusText(status) {
    const statusMap = {
        'none': '无',
        'requested': '申请中',
        'processing': '处理中',
        'completed': '已完成',
        'failed': '失败'
    };
    return statusMap[status] || status;
}

function getOperationText(operation) {
    const operationMap = {
        'create': '创建订单',
        'pay': '支付',
        'ship': '发货',
        'deliver': '确认收货',
        'cancel': '取消订单',
        'return': '退货',
        'refund': '退款',
        'modify': '修改订单'
    };
    return operationMap[operation] || operation;
}

module.exports = router;