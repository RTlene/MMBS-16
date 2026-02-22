const express = require('express');
const router = express.Router();
const { Order, Member, Product, ProductSKU, MemberCommissionRecord, DistributorLevel, OrderOperationLog, User, OrderItem, ReturnRequest, RefundRecord, VerificationCode, CommissionCalculation, sequelize } = require('../db');
const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const CommissionService = require('../services/commissionService');
const multer = require('multer');
const { toCsv, parseCsv, rowsToObjects } = require('../utils/csv');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function sendCsv(res, filename, csvText) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(csvText);
}

function isServiceOrder(order) {
    try {
        const items = order?.items || [];
        return items.some(it => it?.product?.productType === 'service');
    } catch (_) {
        return false;
    }
}

// 获取所有订单列表（后台管理）
router.get('/', async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            status = '', 
            paymentMethod = '',
            startDate = '',
            endDate = '',
            search = ''
        } = req.query;
        const offset = (page - 1) * limit;

        const where = {};
        
        // 状态筛选
        if (status) {
            where.status = status;
        }
        
        // 支付方式筛选
        if (paymentMethod) {
            where.paymentMethod = paymentMethod;
        }
        
        // 日期筛选
        if (startDate && endDate) {
            where.createdAt = {
                [Op.between]: [new Date(startDate), new Date(endDate)]
            };
        }
        
        // 搜索（订单号、会员昵称）
        if (search) {
            where[Op.or] = [
                { orderNo: { [Op.like]: `%${search}%` } }
            ];
        }

        console.log('[OrderRoutes] 查询订单，条件:', JSON.stringify(where, null, 2));
        console.log('[OrderRoutes] 分页参数: page=', page, 'limit=', limit, 'offset=', offset);

        const { count, rows } = await Order.findAndCountAll({
            where,
            include: [
                { 
                    model: Member, 
                    as: 'member', 
                    attributes: ['id', 'nickname', 'phone', 'avatar'],
                    required: false
                },
                {
                    model: OrderItem,
                    as: 'items',
                    attributes: ['id', 'productId', 'skuId', 'productName', 'skuName', 'quantity', 'unitPrice', 'totalAmount', 'productSnapshot'],
                    include: [{
                        model: Product,
                        as: 'product',
                        attributes: ['id', 'name', 'productType'],
                        required: false
                    }],
                    required: false
                },
                {
                    model: OrderOperationLog,
                    as: 'operationLogs',
                    attributes: ['id', 'operation', 'data', 'createdAt'],
                    required: false,
                    limit: 50,
                    order: [['createdAt', 'DESC']]
                }
            ],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset),
            distinct: true
        });

        console.log('[OrderRoutes] 查询结果: count=', count, 'rows.length=', rows.length);

        // 如果搜索条件包含会员昵称，需要额外过滤
        let orders = rows;
        if (search) {
            orders = rows.filter(order => {
                const orderNoMatch = order.orderNo && order.orderNo.includes(search);
                const memberNameMatch = order.member && order.member.nickname && order.member.nickname.includes(search);
                return orderNoMatch || memberNameMatch;
            });
            console.log('[OrderRoutes] 搜索过滤后订单数量:', orders.length);
        }

        const responseData = {
            code: 0,
            message: '获取成功',
            data: {
                orders: orders,
                totalCount: count,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page)
            }
        };

        console.log('[OrderRoutes] 返回数据: orders数量=', responseData.data.orders.length);
        res.json(responseData);
    } catch (error) {
        console.error('获取订单列表失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取订单列表失败',
            error: error.message
        });
    }
});

// 获取会员的订单列表
router.get('/member/:memberId', async (req, res) => {
    try {
        const { memberId } = req.params;
        const { page = 1, limit = 10, status = '' } = req.query;
        const offset = (page - 1) * limit;

        const where = { memberId };
        if (status) {
            where.status = status;
        }

        const { count, rows } = await Order.findAndCountAll({
            where,
            include: [
                { model: Product, as: 'product', attributes: ['id', 'name'] }
            ],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                orders: rows,
                totalCount: count,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page)
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

// 获取会员的佣金记录
router.get('/commission/:memberId', async (req, res) => {
    try {
        const { memberId } = req.params;
        const { page = 1, limit = 10, type = '' } = req.query;
        const offset = (page - 1) * limit;

        const where = { memberId };
        if (type) {
            where.type = type;
        }

        const { count, rows } = await MemberCommissionRecord.findAndCountAll({
            where,
            include: [
                { model: Order, as: 'order', attributes: ['id', 'orderNo', 'totalAmount'] }
            ],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                commissionRecords: rows,
                totalCount: count,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page)
            }
        });
    } catch (error) {
        console.error('获取佣金记录失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取佣金记录失败',
            error: error.message
        });
    }
});

// 创建测试订单（用于验证佣金逻辑：下单会员、推荐关系、商品与金额由后台指定，订单直接为已支付并触发佣金计算）
router.post('/test', async (req, res) => {
    try {
        const { memberId, productId, quantity = 1, unitPrice, totalAmount } = req.body;

        if (!memberId || !productId) {
            return res.status(400).json({
                code: 1,
                message: '请选择下单会员和商品（memberId、productId 必填）'
            });
        }

        const member = await Member.findByPk(memberId);
        if (!member) {
            return res.status(404).json({ code: 1, message: '会员不存在' });
        }

        const product = await Product.findByPk(productId);
        if (!product) {
            return res.status(404).json({ code: 1, message: '商品不存在' });
        }

        const qty = Math.max(1, parseInt(quantity, 10) || 1);
        let price = unitPrice != null && unitPrice !== '' ? parseFloat(unitPrice) : null;
        if (price == null || isNaN(price)) {
            const sku = await ProductSKU.findOne({ where: { productId } });
            price = sku ? parseFloat(sku.price) : 0;
        }
        const total = totalAmount != null && totalAmount !== '' ? parseFloat(totalAmount) : (price * qty);

        if (total < 0 || price < 0) {
            return res.status(400).json({ code: 1, message: '单价或总金额不能为负数' });
        }

        const orderNo = `TEST${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

        const order = await Order.create({
            orderNo,
            memberId,
            productId,
            quantity: qty,
            unitPrice: price,
            totalAmount: total,
            status: 'paid',
            paymentMethod: 'test',
            paymentTime: new Date(),
            isTest: true,
            remark: '测试订单（用于佣金验证）',
            createdBy: req.user ? req.user.id : null
        });

        await OrderItem.create({
            orderId: order.id,
            productId: product.id,
            productName: product.name || '测试商品',
            quantity: qty,
            unitPrice: price,
            totalAmount: total,
            productImage: (product.images && product.images[0]) || null
        });

        await OrderOperationLog.create({
            orderId: order.id,
            operation: 'pay',
            operatorId: req.user ? req.user.id : null,
            operatorType: 'admin',
            description: `后台创建测试订单并标记已支付（会员ID: ${member.id}，金额: ${total}），用于佣金验证`
        });

        // 佣金仅订单完成时产生：测试订单直接标记为已完成以触发佣金计算
        await order.update({ status: 'completed', completedAt: new Date() });

        let commissionCreated = 0;
        let commissionReason = null; // 'no_referrer' | 'referrer_not_found' | 'level_not_met'
        console.log(`[测试订单] 订单已创建并标记已完成 orderId=${order.id}，开始计算佣金`);
        try {
            const result = await CommissionService.calculateOrderCommission(order.id);
            const calculations = result && result.calculations ? result.calculations : [];
            commissionCreated = calculations.length;
            if (commissionCreated === 0 && result) {
                if (result.noReferrer) commissionReason = 'no_referrer';
                else if (result.referrerNotFound) commissionReason = 'referrer_not_found';
                else commissionReason = 'level_not_met';
            }
            console.log(`[测试订单] 佣金计算结束 orderId=${order.id} commissionCreated=${commissionCreated} commissionReason=${commissionReason || '-'}`);
        } catch (err) {
            console.error('[测试订单] 佣金计算失败 orderId=%s error=%s', order.id, err.message, err);
        }
        try {
            await CommissionService.updateSalesOnOrderPaid(order.id);
        } catch (e) {
            console.error('[测试订单] 销售额累加失败:', e);
        }
        try {
            const LevelUpgradeService = require('../services/levelUpgradeService');
            await LevelUpgradeService.tryUpgradeMember(order.memberId);
        } catch (e) {
            console.error('[测试订单] 等级自动升级检查失败:', e);
        }

        res.json({
            code: 0,
            message: '测试订单已创建并已支付（请到佣金记录中确认待确认条目）',
            data: {
                order: {
                    id: order.id,
                    orderNo: order.orderNo,
                    memberId: order.memberId,
                    totalAmount: order.totalAmount,
                    status: order.status
                },
                commissionCreated,
                commissionReason
            }
        });
    } catch (error) {
        console.error('创建测试订单失败:', error);
        res.status(500).json({
            code: 1,
            message: '创建测试订单失败',
            error: error.message
        });
    }
});

// 创建正式订单
router.post('/', async (req, res) => {
    try {
        const { memberId, productId, quantity = 1, unitPrice, totalAmount, paymentMethod = 'wechat' } = req.body;

        // 验证必填字段
        if (!memberId || !productId || !unitPrice || !totalAmount) {
            return res.status(400).json({
                code: 1,
                message: '请填写必填字段'
            });
        }

        // 检查会员是否存在
        const member = await Member.findByPk(memberId);
        if (!member) {
            return res.status(404).json({
                code: 1,
                message: '会员不存在'
            });
        }

        // 检查商品是否存在
        const product = await Product.findByPk(productId);
        if (!product) {
            return res.status(404).json({
                code: 1,
                message: '商品不存在'
            });
        }

        // 生成订单号
        const orderNo = `ORD${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

        // 创建订单
        const order = await Order.create({
            orderNo,
            memberId,
            productId,
            quantity,
            unitPrice,
            totalAmount,
            status: 'pending',
            paymentMethod,
            isTest: false,
            remark: '正式订单'
        });

        // 佣金在订单完成（确认收货/核销）时再计算
        res.json({
            code: 0,
            message: '订单创建成功',
            data: { order }
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

// 更新订单状态
router.put('/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({
                code: 1,
                message: '订单不存在'
            });
        }

        await order.update({ 
            status,
            ...(status === 'paid' && { paymentTime: new Date() })
        });

        // 订单完成（已收货/已完成）时触发佣金计算
        if (status === 'delivered' || status === 'completed') {
            try {
                await CommissionService.calculateOrderCommission(order.id);
            } catch (error) {
                console.error('订单完成佣金计算失败:', error);
            }
        }

        res.json({
            code: 0,
            message: '订单状态更新成功',
            data: { order }
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

// 导出订单（按筛选条件导出全量CSV）
router.get('/export', async (req, res) => {
    try {
        const { status = '', paymentMethod = '', startDate = '', endDate = '', search = '' } = req.query;

        const where = {};
        if (status) where.status = status;
        if (paymentMethod) where.paymentMethod = paymentMethod;
        if (startDate && endDate) {
            where.createdAt = { [Op.between]: [new Date(startDate), new Date(endDate)] };
        }
        if (search) {
            where[Op.or] = [{ orderNo: { [Op.like]: `%${search}%` } }];
        }

        const rows = await Order.findAll({
            where,
            include: [
                { model: Member, as: 'member', attributes: ['id', 'nickname', 'phone', 'referrerId'], required: false },
                {
                    model: OrderItem,
                    as: 'items',
                    attributes: ['productName', 'skuName', 'quantity', 'unitPrice', 'totalAmount'],
                    include: [{ model: Product, as: 'product', attributes: ['id', 'productType'], required: false }],
                    required: false
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        const headers = [
            'orderNo',
            'memberId',
            'memberNickname',
            'memberPhone',
            'referrerId',
            'status',
            'paymentMethod',
            'originalTotal',
            'actualPay',
            'createdAt',
            'isServiceOrder',
            'items'
        ];

        const dataRows = rows.map(o => {
            const items = (o.items || []).map(it => `${it.productName || ''}${it.skuName ? `(${it.skuName})` : ''}x${it.quantity || 0}`).join(';');
            const originalTotal = (o.items || []).reduce((sum, it) => sum + (Number(it.totalAmount) || 0), 0);
            return [
                o.orderNo,
                o.memberId ?? (o.member?.id || ''),
                o.member?.nickname || '',
                o.member?.phone || '',
                o.member?.referrerId || '',
                o.status,
                o.paymentMethod || '',
                originalTotal,
                o.totalAmount ?? '',
                o.createdAt,
                isServiceOrder(o) ? '1' : '0',
                items
            ];
        });

        const csv = toCsv(headers, dataRows);
        sendCsv(res, `orders_${new Date().toISOString().slice(0, 10)}.csv`, csv);
    } catch (error) {
        console.error('导出订单失败:', error);
        res.status(500).json({ code: 1, message: '导出订单失败: ' + error.message });
    }
});

// 下载订单批量发货导入模板
router.get('/import-shipping-template', async (req, res) => {
    const headers = ['orderNo', 'shippingCompany', 'trackingNumber', 'shippingMethod'];
    const sample = [['202601010001', '顺丰', 'SF1234567890', 'express']];
    const csv = toCsv(headers, sample);
    sendCsv(res, 'orders_import_shipping_template.csv', csv);
});

// 订单批量发货导入（CSV）
router.post('/import-shipping', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ code: 1, message: '未上传文件' });

        const text = req.file.buffer.toString('utf8');
        const rows = parseCsv(text);
        const objs = rowsToObjects(rows);

        const results = { total: objs.length, success: 0, skipped: 0, errors: [] };

        for (let idx = 0; idx < objs.length; idx++) {
            const r = objs[idx] || {};
            const line = idx + 2;
            const orderNo = (r.orderNo || '').trim();
            const shippingCompany = (r.shippingCompany || '').trim();
            const trackingNumber = (r.trackingNumber || '').trim();
            const shippingMethod = (r.shippingMethod || '').trim() || 'express';

            if (!orderNo || !shippingCompany || !trackingNumber) {
                results.skipped += 1;
                results.errors.push({ line, orderNo, reason: 'orderNo/shippingCompany/trackingNumber 不能为空' });
                continue;
            }

            const order = await Order.findOne({
                where: { orderNo },
                include: [{
                    model: OrderItem,
                    as: 'items',
                    include: [{ model: Product, as: 'product', attributes: ['id', 'productType'], required: false }],
                    required: false
                }]
            });

            if (!order) {
                results.skipped += 1;
                results.errors.push({ line, orderNo, reason: '订单不存在' });
                continue;
            }

            if (isServiceOrder(order)) {
                results.skipped += 1;
                results.errors.push({ line, orderNo, reason: '服务类订单不支持发货导入，请走核销流程' });
                continue;
            }

            if (order.status !== 'paid') {
                results.skipped += 1;
                results.errors.push({ line, orderNo, reason: `当前状态不可发货: ${order.status}` });
                continue;
            }

            await order.update({
                status: 'shipped',
                shippingCompany,
                trackingNumber,
                shippingMethod,
                shippedAt: new Date(),
                updatedBy: req.user?.id
            });

            await OrderOperationLog.create({
                orderId: order.id,
                operation: 'ship',
                operatorId: req.user?.id,
                operatorType: 'admin',
                oldStatus: 'paid',
                newStatus: 'shipped',
                description: `批量导入发货，物流公司：${shippingCompany}，单号：${trackingNumber}`,
                data: { shippingCompany, trackingNumber, shippingMethod, import: true }
            });

            results.success += 1;
        }

        res.json({ code: 0, message: '导入完成', data: results });
    } catch (error) {
        console.error('批量发货导入失败:', error);
        res.status(500).json({ code: 1, message: '批量发货导入失败: ' + error.message });
    }
});

// 获取订单详情
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const order = await Order.findByPk(id, {
            include: [
                { model: Member, as: 'member', attributes: ['id', 'nickname', 'phone', 'avatar'] },
                { model: Product, as: 'product', attributes: ['id', 'name', 'images'], required: false },
                { 
                    model: OrderItem, 
                    as: 'items', 
                    attributes: ['id', 'productId', 'skuId', 'productName', 'skuName', 'quantity', 'unitPrice', 'totalAmount', 'productImage', 'appliedCoupons', 'appliedPromotions', 'discounts', 'productSnapshot', 'skuSnapshot'],
                    required: false
                },
                { model: OrderOperationLog, as: 'operationLogs', 
                  include: [{ model: User, as: 'operator', attributes: ['id', 'username'] }],
                  order: [['createdAt', 'DESC']],
                  required: false
                },
                { model: MemberCommissionRecord, as: 'commissionRecords',
                  attributes: ['id', 'type', 'amount', 'description', 'status', 'createdAt'],
                  include: [{
                      model: Member,
                      as: 'member',
                      attributes: ['id', 'nickname', 'phone'],
                      required: false
                  }],
                  required: false
                }
            ]
        });

        if (!order) {
            return res.status(404).json({
                code: 1,
                message: '订单不存在'
            });
        }

        // 从操作日志中提取金额计算信息
        let amountCalculation = null;
        const createLog = order.operationLogs?.find(log => log.operation === 'create' || log.operation === 'pay');
        if (createLog && createLog.data) {
            try {
                const logData = typeof createLog.data === 'string' ? JSON.parse(createLog.data) : createLog.data;
                amountCalculation = {
                    originalAmount: logData.originalAmount || 0,
                    commissionDeduction: logData.commissionDeduction || 0,
                    pointsDeduction: logData.pointsDeduction || 0,
                    finalAmount: logData.finalAmount || order.totalAmount
                };
            } catch (e) {
                console.error('解析操作日志数据失败:', e);
            }
        }

        // 计算订单项的总原价
        let itemsOriginalTotal = 0;
        if (order.items && order.items.length > 0) {
            itemsOriginalTotal = order.items.reduce((sum, item) => {
                const itemOriginal = parseFloat(item.unitPrice || 0) * parseInt(item.quantity || 0);
                return sum + itemOriginal;
            }, 0);
        } else {
            itemsOriginalTotal = parseFloat(order.unitPrice || 0) * parseInt(order.quantity || 0);
        }

        // 计算总优惠金额（原价 - 最终金额）
        const totalDiscount = itemsOriginalTotal - parseFloat(order.totalAmount || 0);

        // 确保数据正确序列化
        const orderData = order.toJSON();
        
        // 确保items数组存在
        if (!orderData.items) {
            orderData.items = [];
        }
        
        // 确保commissionRecords数组存在
        if (!orderData.commissionRecords) {
            orderData.commissionRecords = [];
        }
        
        res.json({
            code: 0,
            message: '获取成功',
            data: { 
                order: {
                    ...orderData,
                    amountCalculation: amountCalculation || {
                        originalAmount: itemsOriginalTotal,
                        commissionDeduction: 0,
                        pointsDeduction: 0,
                        finalAmount: order.totalAmount
                    },
                    itemsOriginalTotal: itemsOriginalTotal,
                    totalDiscount: totalDiscount
                }
            }
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

// 变更订单类型（必须在修改订单路由之前）
router.put('/:id/change-type', async (req, res) => {
    try {
        const { id } = req.params;
        const { orderType, remark } = req.body;

        if (!orderType || !['physical', 'service'].includes(orderType)) {
            return res.status(400).json({
                code: 1,
                message: '订单类型无效'
            });
        }

        const order = await Order.findByPk(id, {
            include: [
                {
                    model: OrderItem,
                    as: 'items',
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'productType']
                        }
                    ]
                }
            ]
        });

        if (!order) {
            return res.status(404).json({
                code: 1,
                message: '订单不存在'
            });
        }

        if (order.status !== 'paid') {
            return res.status(400).json({
                code: 1,
                message: '只有已支付的订单才能变更类型'
            });
        }

        // 记录操作日志
        const oldType = order.items && order.items.some(item => item.product && item.product.productType === 'service') ? 'service' : 'physical';
        await OrderOperationLog.create({
            orderId: order.id,
            operation: 'change_type',
            operatorId: req.user?.id,
            operatorType: 'admin',
            description: `订单类型变更为：${orderType === 'service' ? '服务商品' : '实物商品'}`,
            data: { 
                oldType: oldType,
                newType: orderType,
                remark 
            }
        });

        res.json({
            code: 0,
            message: '订单类型变更成功',
            data: { order }
        });
    } catch (error) {
        console.error('变更订单类型失败:', error);
        res.status(500).json({
            code: 1,
            message: '变更订单类型失败',
            error: error.message
        });
    }
});

// 修改订单
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            quantity, 
            unitPrice, 
            totalAmount, 
            shippingAddress, 
            receiverName, 
            receiverPhone, 
            remark 
        } = req.body;

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({
                code: 1,
                message: '订单不存在'
            });
        }

        // 只有待支付状态的订单才能修改
        if (order.status !== 'pending') {
            return res.status(400).json({
                code: 1,
                message: '只有待支付状态的订单才能修改'
            });
        }

        const oldData = {
            quantity: order.quantity,
            unitPrice: order.unitPrice,
            totalAmount: order.totalAmount,
            shippingAddress: order.shippingAddress,
            receiverName: order.receiverName,
            receiverPhone: order.receiverPhone,
            remark: order.remark
        };

        await order.update({
            quantity: quantity || order.quantity,
            unitPrice: unitPrice || order.unitPrice,
            totalAmount: totalAmount || order.totalAmount,
            shippingAddress: shippingAddress || order.shippingAddress,
            receiverName: receiverName || order.receiverName,
            receiverPhone: receiverPhone || order.receiverPhone,
            remark: remark || order.remark,
            updatedBy: req.user?.id
        });

        // 记录操作日志
        await OrderOperationLog.create({
            orderId: order.id,
            operation: 'modify',
            operatorId: req.user?.id,
            operatorType: req.user ? 'admin' : 'member',
            description: '修改订单信息',
            data: { oldData, newData: req.body }
        });

        res.json({
            code: 0,
            message: '订单修改成功',
            data: { order }
        });
    } catch (error) {
        console.error('修改订单失败:', error);
        res.status(500).json({
            code: 1,
            message: '修改订单失败',
            error: error.message
        });
    }
});

// 发货
router.put('/:id/ship', async (req, res) => {
    try {
        const { id } = req.params;
        const { shippingCompany, trackingNumber, shippingMethod } = req.body;

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({
                code: 1,
                message: '订单不存在'
            });
        }

        if (order.status !== 'paid') {
            return res.status(400).json({
                code: 1,
                message: '只有已支付状态的订单才能发货'
            });
        }

        await order.update({
            status: 'shipped',
            shippingCompany,
            trackingNumber,
            shippingMethod,
            shippedAt: new Date(),
            updatedBy: req.user?.id
        });

        // 记录操作日志
        await OrderOperationLog.create({
            orderId: order.id,
            operation: 'ship',
            operatorId: req.user?.id,
            operatorType: 'admin',
            oldStatus: 'paid',
            newStatus: 'shipped',
            description: `订单已发货，物流公司：${shippingCompany}，单号：${trackingNumber}`,
            data: { shippingCompany, trackingNumber, shippingMethod }
        });

        res.json({
            code: 0,
            message: '发货成功',
            data: { order }
        });
    } catch (error) {
        console.error('发货失败:', error);
        res.status(500).json({
            code: 1,
            message: '发货失败',
            error: error.message
        });
    }
});

// 确认收货
router.put('/:id/deliver', async (req, res) => {
    try {
        const { id } = req.params;

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({
                code: 1,
                message: '订单不存在'
            });
        }

        if (order.status !== 'shipped') {
            return res.status(400).json({
                code: 1,
                message: '只有已发货状态的订单才能确认收货'
            });
        }

        await order.update({
            status: 'delivered',
            deliveredAt: new Date(),
            updatedBy: req.user?.id
        });

        // 记录操作日志
        await OrderOperationLog.create({
            orderId: order.id,
            operation: 'deliver',
            operatorId: req.user?.id,
            operatorType: req.user ? 'admin' : 'member',
            oldStatus: 'shipped',
            newStatus: 'delivered',
            description: '订单已确认收货'
        });

        // 订单完成时触发佣金计算
        try {
            await CommissionService.calculateOrderCommission(order.id);
        } catch (error) {
            console.error('订单完成佣金计算失败:', error);
        }

        res.json({
            code: 0,
            message: '确认收货成功',
            data: { order }
        });
    } catch (error) {
        console.error('确认收货失败:', error);
        res.status(500).json({
            code: 1,
            message: '确认收货失败',
            error: error.message
        });
    }
});

// 申请退货
router.post('/:id/return', async (req, res) => {
    try {
        const { id } = req.params;
        const { reason, description, images } = req.body;

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({
                code: 1,
                message: '订单不存在'
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

        await order.update({
            returnStatus: 'requested',
            returnReason: reason,
            updatedBy: req.user?.id
        });

        // 记录操作日志
        await OrderOperationLog.create({
            orderId: order.id,
            operation: 'return',
            operatorId: req.user?.id,
            operatorType: 'member',
            description: `申请退货，原因：${reason}`,
            data: { reason, description, images }
        });

        res.json({
            code: 0,
            message: '退货申请提交成功',
            data: { order }
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

// 处理退货申请
router.put('/:id/return/process', async (req, res) => {
    try {
        const { id } = req.params;
        const { action, adminRemark, returnAmount } = req.body; // action: 'approve' | 'reject'

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({
                code: 1,
                message: '订单不存在'
            });
        }

        if (order.returnStatus !== 'requested') {
            return res.status(400).json({
                code: 1,
                message: '订单没有待处理的退货申请'
            });
        }

        const newReturnStatus = action === 'approve' ? 'approved' : 'rejected';
        
        await order.update({
            returnStatus: newReturnStatus,
            returnAmount: action === 'approve' ? (returnAmount || order.totalAmount) : null,
            adminRemark: adminRemark || order.adminRemark,
            updatedBy: req.user?.id
        });

        // 记录操作日志
        await OrderOperationLog.create({
            orderId: order.id,
            operation: 'return',
            operatorId: req.user?.id,
            operatorType: 'admin',
            description: action === 'approve' ? '退货申请已通过' : '退货申请已拒绝',
            data: { action, adminRemark, returnAmount }
        });

        res.json({
            code: 0,
            message: action === 'approve' ? '退货申请已通过' : '退货申请已拒绝',
            data: { order }
        });
    } catch (error) {
        console.error('处理退货申请失败:', error);
        res.status(500).json({
            code: 1,
            message: '处理退货申请失败',
            error: error.message
        });
    }
});

// 申请退款
router.post('/:id/refund', async (req, res) => {
    try {
        const { id } = req.params;
        const { reason, refundAmount, refundMethod } = req.body;

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({
                code: 1,
                message: '订单不存在'
            });
        }

        if (!['cancelled', 'returned'].includes(order.status) && order.returnStatus !== 'approved') {
            return res.status(400).json({
                code: 1,
                message: '只有已取消、已退货或退货已通过的订单才能申请退款'
            });
        }

        if (order.refundStatus !== 'none') {
            return res.status(400).json({
                code: 1,
                message: '订单已存在退款申请'
            });
        }

        await order.update({
            refundStatus: 'requested',
            refundAmount: refundAmount || order.returnAmount || order.totalAmount,
            refundMethod: refundMethod || 'original',
            updatedBy: req.user?.id
        });

        // 记录操作日志
        await OrderOperationLog.create({
            orderId: order.id,
            operation: 'refund',
            operatorId: req.user?.id,
            operatorType: req.user ? 'admin' : 'member',
            description: `申请退款，金额：${refundAmount || order.returnAmount || order.totalAmount}元`,
            data: { reason, refundAmount, refundMethod }
        });

        res.json({
            code: 0,
            message: '退款申请提交成功',
            data: { order }
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

// 处理退款申请
router.put('/:id/refund/process', async (req, res) => {
    try {
        const { id } = req.params;
        const { action, adminRemark } = req.body; // action: 'approve' | 'reject'

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({
                code: 1,
                message: '订单不存在'
            });
        }

        if (order.refundStatus !== 'requested') {
            return res.status(400).json({
                code: 1,
                message: '订单没有待处理的退款申请'
            });
        }

        const newRefundStatus = action === 'approve' ? 'processing' : 'failed';
        
        await order.update({
            refundStatus: newRefundStatus,
            adminRemark: adminRemark || order.adminRemark,
            updatedBy: req.user?.id
        });

        // 记录操作日志
        await OrderOperationLog.create({
            orderId: order.id,
            operation: 'refund',
            operatorId: req.user?.id,
            operatorType: 'admin',
            description: action === 'approve' ? '退款申请已通过，开始处理' : '退款申请已拒绝',
            data: { action, adminRemark }
        });

        res.json({
            code: 0,
            message: action === 'approve' ? '退款申请已通过' : '退款申请已拒绝',
            data: { order }
        });
    } catch (error) {
        console.error('处理退款申请失败:', error);
        res.status(500).json({
            code: 1,
            message: '处理退款申请失败',
            error: error.message
        });
    }
});

// 完成退款
router.put('/:id/refund/complete', async (req, res) => {
    try {
        const { id } = req.params;
        const { thirdPartyRefundNo } = req.body;

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({
                code: 1,
                message: '订单不存在'
            });
        }

        if (order.refundStatus !== 'processing') {
            return res.status(400).json({
                code: 1,
                message: '只有处理中的退款才能完成'
            });
        }

        await order.update({
            refundStatus: 'completed',
            refundedAt: new Date(),
            updatedBy: req.user?.id
        });

        // 记录操作日志
        await OrderOperationLog.create({
            orderId: order.id,
            operation: 'refund',
            operatorId: req.user?.id,
            operatorType: 'admin',
            description: '退款已完成',
            data: { thirdPartyRefundNo }
        });

        res.json({
            code: 0,
            message: '退款完成',
            data: { order }
        });
    } catch (error) {
        console.error('完成退款失败:', error);
        res.status(500).json({
            code: 1,
            message: '完成退款失败',
            error: error.message
        });
    }
});

// 核销订单（服务商品）
router.put('/:id/verify', async (req, res) => {
    try {
        const { id } = req.params;
        const { verificationCode } = req.body;

        if (!verificationCode || String(verificationCode).trim().length === 0) {
            return res.status(400).json({
                code: 1,
                message: '核销码不能为空'
            });
        }

        const order = await Order.findByPk(id, {
            include: [
                {
                    model: OrderItem,
                    as: 'items',
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'productType']
                        }
                    ]
                }
            ]
        });

        if (!order) {
            return res.status(404).json({
                code: 1,
                message: '订单不存在'
            });
        }

        // 检查订单是否包含服务商品
        const hasServiceProduct = order.items && order.items.some(item => 
            item.product && item.product.productType === 'service'
        );

        if (!hasServiceProduct) {
            return res.status(400).json({
                code: 1,
                message: '该订单不包含服务商品，无需核销'
            });
        }

        if (order.status !== 'paid') {
            return res.status(400).json({
                code: 1,
                message: '只有已支付的订单才能核销'
            });
        }

        // 更新订单状态为已完成
        await order.update({
            status: 'completed',
            completedAt: new Date(),
            updatedBy: req.user?.id
        });

        // 记录操作日志
        await OrderOperationLog.create({
            orderId: order.id,
            operation: 'verify',
            operatorId: req.user?.id,
            operatorType: 'admin',
            description: `核销订单，核销码：${String(verificationCode).trim()}`,
            data: { verificationCode: String(verificationCode).trim() }
        });

        // 订单完成（核销）时触发佣金计算
        try {
            await CommissionService.calculateOrderCommission(order.id);
        } catch (error) {
            console.error('订单完成佣金计算失败:', error);
        }

        res.json({
            code: 0,
            message: '核销成功',
            data: { order }
        });
    } catch (error) {
        console.error('核销订单失败:', error);
        res.status(500).json({
            code: 1,
            message: '核销订单失败',
            error: error.message
        });
    }
});

// 删除订单（需密码验证）
router.delete('/:id', async (req, res) => {
    try {
        const orderId = req.params.id;
        const { password } = req.body || {};

        if (!password || String(password).trim() === '') {
            return res.status(400).json({
                code: 1,
                message: '请输入当前登录账号的密码以确认删除'
            });
        }

        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ code: 1, message: '未登录' });
        }

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(401).json({ code: 1, message: '用户不存在' });
        }

        const valid = await bcrypt.compare(String(password).trim(), user.password);
        if (!valid) {
            return res.status(400).json({
                code: 1,
                message: '密码错误，无法删除订单'
            });
        }

        const order = await Order.findByPk(orderId);
        if (!order) {
            return res.status(404).json({
                code: 1,
                message: '订单不存在'
            });
        }

        const t = await sequelize.transaction();
        try {
            await RefundRecord.destroy({ where: { orderId }, transaction: t });
            await ReturnRequest.destroy({ where: { orderId }, transaction: t });
            await OrderOperationLog.destroy({ where: { orderId }, transaction: t });
            await MemberCommissionRecord.destroy({ where: { orderId }, transaction: t });
            await VerificationCode.destroy({ where: { orderId }, transaction: t });
            await CommissionCalculation.destroy({ where: { orderId }, transaction: t });
            await OrderItem.destroy({ where: { orderId }, transaction: t });
            await order.destroy({ transaction: t });
            await t.commit();
        } catch (err) {
            await t.rollback();
            throw err;
        }

        res.json({
            code: 0,
            message: '订单已删除'
        });
    } catch (error) {
        console.error('删除订单失败:', error);
        res.status(500).json({
            code: 1,
            message: error.message || '删除订单失败'
        });
    }
});

module.exports = router;