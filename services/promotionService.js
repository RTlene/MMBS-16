const { Op } = require('sequelize');
const { 
    Product, ProductSKU, Coupon, Promotion, PointRecord, PointProduct, 
    Member, MemberLevel, Order, OrderItem, ProductMemberPrice 
} = require('../db');
const PromotionRulesService = require('./promotionRulesService');

/** 解析促销 rules（DB 可能返回 JSON 字符串） */
function parsePromotionRules(rules) {
    if (rules == null) return null;
    if (typeof rules === 'object') return rules;
    if (typeof rules !== 'string') return null;
    try {
        return JSON.parse(rules);
    } catch {
        return null;
    }
}

class PromotionService {
    /**
     * 获取商品详情时应用运营工具
     * @param {number} productId - 商品ID
     * @param {number} memberId - 会员ID
     * @param {number} skuId - SKU ID（可选）
     * @param {number} quantity - 数量（可选，用于计算优惠）
     * @returns {Object} 应用运营工具后的商品信息
     */
    static async getProductWithPromotions(productId, memberId, skuId = null, quantity = 1) {
        try {
            const effectiveMemberId = memberId && Number(memberId) > 0 ? Number(memberId) : null;
            // 未登录（memberId=0 或空）时只查商品，不查会员，按游客展示
            const productPromise = Product.findByPk(productId, {
                attributes: {
                    exclude: ['detailContent']
                },
                include: [
                    { 
                        model: ProductSKU, 
                        as: 'skus', 
                        where: { status: 'active' }, 
                        required: false,
                        attributes: ['id', 'name', 'price', 'stock']
                    }
                ]
            });
            const memberPromise = effectiveMemberId
                ? Member.findByPk(effectiveMemberId, {
                    attributes: ['id', 'nickname', 'memberLevelId', 'availablePoints', 'status'],
                    include: [{ model: MemberLevel, as: 'memberLevel', attributes: ['id', 'name', 'level'] }]
                  })
                : Promise.resolve(null);
            const [product, member] = await Promise.all([productPromise, memberPromise]);

            if (!product || product.status !== 'active') {
                throw new Error('商品不存在或已下架');
            }
            // 已传 memberId 但查不到或已禁用才报错；未登录（memberId=0）按游客处理，不报错
            if (effectiveMemberId && (!member || member.status !== 'active')) {
                throw new Error('会员不存在或已被禁用');
            }

            // 调试：检查 product 对象是否包含 productType
            console.log('[PromotionService] Product 对象:', {
                id: product.id,
                name: product.name,
                productType: product.productType,
                productTypeType: typeof product.productType,
                hasProductType: 'productType' in product,
                dataValues: product.dataValues ? {
                    productType: product.dataValues.productType
                } : null
            });
            
            // 处理SKU
            let selectedSku = null;
            // 确保价格是有效数字
            let unitPrice = Number(product.price) || 0;

            if (skuId) {
                selectedSku = product.skus.find(sku => sku.id == skuId);
                if (!selectedSku) {
                    throw new Error('商品规格不存在');
                }
                unitPrice = Number(selectedSku.price) || unitPrice; // 如果SKU价格无效，使用商品价格
            }

            // 确保数量是有效数字
            const safeQuantity = Number(quantity) || 1;

            // 会员价：先按 SKU 查，再按整品(skuId=0)查
            let isMemberPrice = false;
            if (member && member.memberLevelId) {
                const searchSkuId = skuId ? Number(skuId) : 0;
                let memberPriceRow = searchSkuId > 0
                    ? await ProductMemberPrice.findOne({
                        where: { productId: product.id, memberLevelId: member.memberLevelId, skuId: searchSkuId }
                    })
                    : null;
                if (!memberPriceRow) {
                    memberPriceRow = await ProductMemberPrice.findOne({
                        where: { productId: product.id, memberLevelId: member.memberLevelId, skuId: 0 }
                    });
                }
                if (memberPriceRow) {
                    unitPrice = Number(memberPriceRow.price) || unitPrice;
                    isMemberPrice = true;
                }
            }
            
            // 计算小计（用于优惠券查询），确保不是NaN
            const subtotal = (Number.isFinite(unitPrice) && Number.isFinite(safeQuantity)) 
                ? unitPrice * safeQuantity 
                : 0;

            // 会员价时不查优惠券/促销，只查积分商品信息
            const [availableCoupons, availablePromotions, pointProduct] = isMemberPrice
                ? await Promise.all([
                    Promise.resolve([]),
                    Promise.resolve([]),
                    this.getPointProductInfo(productId, skuId)
                ])
                : await Promise.all([
                    this.getAvailableCouponsOptimized(memberId, productId, skuId, subtotal),
                    this.getAvailablePromotionsOptimized(productId, skuId),
                    this.getPointProductInfo(productId, skuId)
                ]);

            // 计算优惠后的价格（使用安全的数量值）
            const priceCalculation = await this.calculatePromotionalPrice(
                unitPrice, 
                safeQuantity, 
                availableCoupons, 
                availablePromotions, 
                member,
                safeQuantity // 传入订单数量
            );

            // 处理SKU列表 - 激进优化：完全移除SKU图片，只保留基本信息
            // 限制SKU数量，只返回前10个，避免数据过大
            const skusList = (product.skus || []).slice(0, 10).map(sku => ({
                id: sku.id,
                name: sku.name,
                price: parseFloat(sku.price) || 0,
                stock: parseInt(sku.stock) || 0
                // 完全移除 images 和 attributes，减少数据量
                // 图片可以通过单独的API按需加载
            }));

            // 返回主图（限制最多3张，避免过大）
            const limitedImages = (product.images || []).slice(0, 3);
            // 返回详情图（限制最多10张，优先保障直接展示）
            const limitedDetailImages = (product.detailImages || []).slice(0, 10);
            // 返回商品视频（用于轮播中主图后展示）
            const limitedVideos = (product.videos || []).slice(0, 5);
            
            // 限制description长度，避免过长文本
            const limitedDescription = product.description 
                ? (product.description.length > 200 ? product.description.substring(0, 200) + '...' : product.description)
                : '';

            // 确保获取 productType（优先从 dataValues，其次从直接属性）
            const productType = product.dataValues?.productType || product.productType || 'physical';
            
            console.log('[PromotionService] 提取的商品类型:', {
                productId: product.id,
                productType: productType,
                fromDataValues: product.dataValues?.productType,
                fromDirect: product.productType
            });
            
            // 构建返回数据
            const result = {
                product: {
                    id: product.id,
                    name: product.name,
                    description: limitedDescription, // 使用限制长度的描述
                    images: limitedImages,
                    detailImages: limitedDetailImages,
                    videos: limitedVideos,
                    price: product.price,
                    originalPrice: product.originalPrice || null,
                    sales: product.sales || 0,
                    brand: product.brand || null,
                    categoryId: product.categoryId || null,
                    status: product.status,
                    productType: productType // 使用提取的商品类型
                    // 移除 createdAt，减少数据量
                },
                skus: skusList,  // 添加完整的SKU列表
                sku: selectedSku ? {
                    id: selectedSku.id,
                    name: selectedSku.name,
                    price: selectedSku.price,
                    stock: selectedSku.stock
                    // 移除 attributes 和 skuCode，减少数据量
                } : null,
                promotions: {
                    // 激进优化：只返回前5个优惠券，只保留最核心字段
                    availableCoupons: availableCoupons.slice(0, 5).map(coupon => ({
                        id: coupon.id,
                        name: coupon.name,
                        discountType: coupon.discountType,
                        discountValue: coupon.discountValue,
                        minOrderAmount: coupon.minOrderAmount
                        // 移除其他字段，减少数据量
                    })),
                    // 返回前5个促销，含 type/description 供商品详情页「促销活动」正确展示
                    availablePromotions: availablePromotions.slice(0, 5).map(promotion => {
                        const rules = promotion.rules || {};
                        const discountType = rules.discountType || null;
                        const discountValue = rules.discountValue != null ? rules.discountValue : null;
                        let description = promotion.description || '';
                        if (!description && (discountType || discountValue != null)) {
                            if (discountType === 'fixed' && discountValue != null) description = `满减 ¥${discountValue}`;
                            else if (discountType === 'percent' && discountValue != null) description = `享 ${discountValue} 折`;
                            else description = promotion.name || '促销优惠';
                        }
                        if (!description) description = promotion.name || '促销';
                        return {
                            id: promotion.id,
                            name: promotion.name,
                            type: promotion.name || '促销',
                            description,
                            discountType,
                            discountValue
                        };
                    }),
                    // 积分商品精简字段
                    pointProduct: pointProduct ? {
                        id: pointProduct.id,
                        pointPrice: pointProduct.pointPrice,
                        maxExchangeQuantity: pointProduct.maxExchangeQuantity,
                        remainingQuantity: pointProduct.remainingQuantity
                    } : null
                },
                pricing: {
                    originalPrice: unitPrice,
                    quantity: safeQuantity,
                    subtotal: subtotal,
                    isMemberPrice: isMemberPrice,
                    // 精简discounts，只保留必要字段；会员价不参与优惠故无折扣
                    discounts: (priceCalculation.discounts || []).map(d => ({
                        type: d.type,
                        id: d.id || null,
                        name: d.name,
                        amount: d.amount
                    })),
                    finalPrice: priceCalculation.finalPrice,
                    savings: priceCalculation.savings,
                    savingsRate: priceCalculation.savingsRate
                },
                member: member ? {
                    id: member.id,
                    nickname: member.nickname,
                    memberLevel: member.memberLevel ? {
                        id: member.memberLevel.id,
                        name: member.memberLevel.name,
                        level: member.memberLevel.level
                    } : null,
                    availablePoints: member.availablePoints || 0
                } : null
            };

            return result;
        } catch (error) {
            console.error('获取商品运营信息失败:', error);
            throw error;
        }
    }

    /**
     * 生成订单时应用运营工具
     * @param {Object} orderData - 订单数据
     * @param {number} memberId - 会员ID
     * @param {Array} appliedCoupons - 应用的优惠券ID数组
     * @param {Array} appliedPromotions - 应用的促销活动ID数组
     * @param {Object} pointUsage - 积分使用信息
     * @returns {Object} 应用运营工具后的订单信息
     */
    static async applyPromotionsToOrder(orderData, memberId, appliedCoupons = [], appliedPromotions = [], pointUsage = null) {
        try {
            const { productId, skuId, quantity } = orderData;
            
            // 获取商品信息
            const product = await Product.findByPk(productId, {
                include: [
                    { 
                        model: ProductSKU, 
                        as: 'skus', 
                        where: { status: 'active' }, 
                        required: false 
                    }
                ]
            });

            if (!product || product.status !== 'active') {
                throw new Error('商品不存在或已下架');
            }

            // 获取会员信息
            const member = await Member.findByPk(memberId, {
                include: [{ model: MemberLevel, as: 'memberLevel' }]
            });

            if (!member || member.status !== 'active') {
                throw new Error('会员不存在或已被禁用');
            }

            // 处理SKU和价格
            let selectedSku = null;
            let unitPrice = product.price;

            if (skuId) {
                selectedSku = product.skus.find(sku => sku.id == skuId);
                if (!selectedSku) {
                    throw new Error('商品规格不存在');
                }
                unitPrice = selectedSku.price;
            }

            // 验证并获取优惠券
            const coupons = await this.validateAndGetCoupons(appliedCoupons, memberId, productId, skuId, quantity);

            // 验证并获取促销活动
            const promotions = await this.validateAndGetPromotions(appliedPromotions, productId, skuId, quantity);

            if (process.env.NODE_ENV !== 'production' || (appliedCoupons && appliedCoupons.length + (appliedPromotions && appliedPromotions.length) > 0)) {
                console.log('[applyPromotionsToOrder] appliedCoupons=', appliedCoupons, 'appliedPromotions=', appliedPromotions, '-> valid coupons=', coupons.length, 'valid promotions=', promotions.length);
            }

            // 验证积分使用
            const pointInfo = await this.validatePointUsage(pointUsage, memberId, productId, skuId, quantity);

            // 计算最终价格
            const priceCalculation = await this.calculateFinalPrice(
                unitPrice,
                quantity,
                coupons,
                promotions,
                pointInfo,
                member,
                quantity // 传入订单数量
            );

            // 构建订单数据
            const finalOrderData = {
                ...orderData,
                unitPrice: unitPrice,
                totalAmount: priceCalculation.finalPrice,
                appliedCoupons: coupons.map(coupon => ({
                    id: coupon.id,
                    name: coupon.name,
                    type: coupon.type,
                    discountType: coupon.discountType,
                    discountValue: coupon.discountValue,
                    discountAmount: coupon.discountAmount,
                    // 满减满送满折信息
                    fullReductionInfo: coupon.fullReductionInfo,
                    fullGiftInfo: coupon.fullGiftInfo,
                    fullDiscountInfo: coupon.fullDiscountInfo
                })),
                appliedPromotions: promotions.map(promotion => ({
                    id: promotion.id,
                    name: promotion.name,
                    type: promotion.type,
                    discountValue: promotion.discountValue,
                    discountAmount: promotion.discountAmount,
                    // 满减满送满折信息
                    fullReductionInfo: promotion.fullReductionInfo,
                    fullGiftInfo: promotion.fullGiftInfo,
                    fullDiscountInfo: promotion.fullDiscountInfo,
                    validFrom: promotion.validFrom || promotion.startTime,
                    validTo: promotion.validTo || promotion.endTime
                })),
                pointUsage: pointInfo ? {
                    pointPrice: pointInfo.pointPrice,
                    pointAmount: pointInfo.pointAmount,
                    pointDiscount: pointInfo.pointDiscount
                } : null,
                discounts: priceCalculation.discounts,
                savings: priceCalculation.savings,
                originalAmount: priceCalculation.originalAmount
            };

            return finalOrderData;
        } catch (error) {
            console.error('应用运营工具到订单失败:', error);
            throw error;
        }
    }

    /**
     * 获取可用的优惠券（优化版本，避免重复查询）
     */
    static async getAvailableCouponsOptimized(memberId, productId, skuId, subtotal) {
        const now = new Date();
        
        // 确保subtotal是有效数字，避免NaN
        const safeSubtotal = Number.isFinite(subtotal) && subtotal >= 0 ? subtotal : 0;

        const coupons = await Coupon.findAll({
            attributes: [
                'id', 'name', 'code', 'type', 'discountType', 'value', 'discountValue',
                'minAmount', 'minOrderAmount', 'maxDiscount', 'maxDiscountAmount',
                'totalCount', 'usedCount', 'usageLimit', 'memberUsageLimit',
                'productIds', 'skuIds', 'validFrom', 'validTo', 'status', 'description'
                // 排除大字段：fullReductionRules, fullGiftRules, fullDiscountRules
            ],
            where: {
                status: 'active',
                validFrom: { [Op.lte]: now },
                validTo: { [Op.gte]: now },
                [Op.or]: [
                    { minOrderAmount: { [Op.lte]: safeSubtotal } },
                    { minOrderAmount: null }
                ]
            },
            order: [['discountValue', 'DESC']],
            limit: 20  // 限制返回数量，避免查询过多数据
        });

        // 过滤出可用的优惠券
        const availableCoupons = coupons.filter(coupon => {
            // 检查使用限制
            if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
                return false;
            }

            // 检查商品限制
            if (coupon.productIds && Array.isArray(coupon.productIds) && coupon.productIds.length > 0) {
                if (!coupon.productIds.includes(parseInt(productId))) {
                    return false;
                }
            }

            // 检查SKU限制
            if (skuId && coupon.skuIds && Array.isArray(coupon.skuIds) && coupon.skuIds.length > 0) {
                if (!coupon.skuIds.includes(parseInt(skuId))) {
                    return false;
                }
            }

            return true;
        });

        return availableCoupons;
    }

    /**
     * 获取可用的优惠券（保留原方法以兼容）
     */
    static async getAvailableCoupons(memberId, productId, skuId, quantity) {
        const subtotal = await this.calculateSubtotal(productId, skuId, quantity);
        return this.getAvailableCouponsOptimized(memberId, productId, skuId, subtotal);
    }

    /**
     * 获取可用的促销活动（优化版本）
     */
    static async getAvailablePromotionsOptimized(productId, skuId) {
        const now = new Date();

        const promotions = await Promotion.findAll({
            attributes: [
                'id', 'name', 'type', 'description', 'startTime', 'endTime', 'status', 'rules'
                // 需要查询 rules 字段用于过滤，但返回给客户端时会排除
            ],
            where: {
                status: 'active',
                startTime: { [Op.lte]: now },
                endTime: { [Op.gte]: now }
            },
            order: [['startTime', 'DESC'], ['createdAt', 'DESC']],
            limit: 20  // 限制返回数量
        });

        // 过滤出可用的促销活动
        const availablePromotions = promotions.filter(promotion => {
            // 从 rules JSON 中解析 productIds 和 skuIds
            const rules = promotion.rules || {};
            const productIds = rules.productIds || [];
            const skuIds = rules.skuIds || [];
            
            // 检查商品限制
            if (Array.isArray(productIds) && productIds.length > 0) {
                if (!productIds.includes(parseInt(productId))) {
                    return false;
                }
            }

            // 检查SKU限制
            if (skuId && Array.isArray(skuIds) && skuIds.length > 0) {
                if (!skuIds.includes(parseInt(skuId))) {
                    return false;
                }
            }

            return true;
        });

        return availablePromotions;
    }

    /**
     * 获取可用的促销活动（保留原方法以兼容）
     */
    static async getAvailablePromotions(productId, skuId, quantity) {
        return this.getAvailablePromotionsOptimized(productId, skuId);
    }

    /**
     * 获取积分商品信息
     */
    static async getPointProductInfo(productId, skuId) {
        const pointProduct = await PointProduct.findOne({
            where: {
                productId: productId,
                skuId: skuId || null,
                status: 'active'
            }
        });

        if (!pointProduct) {
            return null;
        }

        // 计算剩余可兑换数量
        const remainingQuantity = pointProduct.maxExchangeQuantity - (pointProduct.exchangedQuantity || 0);

        return {
            ...pointProduct.toJSON(),
            remainingQuantity: Math.max(0, remainingQuantity)
        };
    }

    /**
     * 计算促销价格（支持满金额和满数量条件）
     */
    static async calculatePromotionalPrice(unitPrice, quantity, coupons, promotions, member, orderQuantity = null) {
        const originalAmount = unitPrice * quantity;
        let finalPrice = originalAmount;
        const discounts = [];

        // 如果没有传入orderQuantity，使用quantity作为默认值
        const totalQuantity = orderQuantity || quantity;

        // 应用促销活动
        for (const promotion of promotions) {
            let discountAmount = 0;
            let discountInfo = null;
            const rules = parsePromotionRules(promotion.rules);

            // 根据促销类型计算折扣
            switch (promotion.type) {
                case 'full_reduction':
                    if (rules && rules.fullReductionRules && rules.fullReductionRules.length > 0) {
                        const result = PromotionRulesService.calculateFullReduction(originalAmount, totalQuantity, rules.fullReductionRules);
                        discountAmount = result.discountAmount;
                        discountInfo = result;
                    }
                    break;
                case 'full_gift':
                    // 满送不直接减少金额，而是添加赠品
                    if (rules && rules.fullGiftRules && rules.fullGiftRules.length > 0) {
                        const result = await PromotionRulesService.calculateFullGift(originalAmount, totalQuantity, rules.fullGiftRules);
                        discountInfo = result;
                        // 满送不减少金额，但记录赠品信息
                    }
                    break;
                case 'full_discount':
                    if (rules && rules.fullDiscountRules && rules.fullDiscountRules.length > 0) {
                        const result = PromotionRulesService.calculateFullDiscount(originalAmount, totalQuantity, rules.fullDiscountRules);
                        discountAmount = result.discountAmount;
                        discountInfo = result;
                    }
                    break;
                default:
                    discountAmount = this.calculateDiscountAmount(promotion, originalAmount, quantity);
            }
            
            if (discountAmount > 0) {
                discounts.push({
                    type: 'promotion',
                    id: promotion.id,
                    name: promotion.name,
                    amount: discountAmount,
                    description: discountInfo ? discountInfo.description : null
                });
                finalPrice -= discountAmount;
            }
        }

        // 应用优惠券
        for (const coupon of coupons) {
            let discountAmount = 0;
            let discountInfo = null;
            
            // 根据优惠券类型计算折扣
            switch (coupon.discountType) {
                case 'full_reduction':
                    if (coupon.fullReductionRules) {
                        const result = PromotionRulesService.calculateFullReduction(originalAmount, totalQuantity, coupon.fullReductionRules);
                        discountAmount = result.discountAmount;
                        discountInfo = result;
                    }
                    break;
                case 'full_gift':
                    // 满送不直接减少金额，而是添加赠品
                    if (coupon.fullGiftRules) {
                        const result = await PromotionRulesService.calculateFullGift(originalAmount, totalQuantity, coupon.fullGiftRules);
                        discountInfo = result;
                        // 满送不减少金额，但记录赠品信息
                    }
                    break;
                case 'full_discount':
                    if (coupon.fullDiscountRules) {
                        const result = PromotionRulesService.calculateFullDiscount(originalAmount, totalQuantity, coupon.fullDiscountRules);
                        discountAmount = result.discountAmount;
                        discountInfo = result;
                    }
                    break;
                default:
                    discountAmount = this.calculateDiscountAmount(coupon, originalAmount, quantity);
            }
            
            if (discountAmount > 0) {
                discounts.push({
                    type: 'coupon',
                    id: coupon.id,
                    name: coupon.name,
                    amount: discountAmount,
                    description: discountInfo ? discountInfo.description : null
                });
                finalPrice -= discountAmount;
            }
        }

        // 应用会员等级折扣
        if (member && member.memberLevel && member.memberLevel.directCommissionRate > 0) {
            const memberDiscount = originalAmount * member.memberLevel.directCommissionRate;
            if (memberDiscount > 0) {
                discounts.push({
                    type: 'member',
                    name: '会员折扣',
                    amount: memberDiscount
                });
                finalPrice -= memberDiscount;
            }
        }

        const savings = originalAmount - finalPrice;
        const savingsRate = originalAmount > 0 ? (savings / originalAmount) * 100 : 0;

        return {
            originalAmount,
            finalPrice: Math.max(0, finalPrice),
            discounts,
            savings,
            savingsRate: Math.round(savingsRate * 100) / 100
        };
    }

    /**
     * 计算最终价格（支持满金额和满数量条件）
     */
    static async calculateFinalPrice(unitPrice, quantity, coupons, promotions, pointInfo, member, orderQuantity = null) {
        const originalAmount = unitPrice * quantity;
        let finalPrice = originalAmount;
        const discounts = [];

        // 如果没有传入orderQuantity，使用quantity作为默认值
        const totalQuantity = orderQuantity || quantity;

        // 应用促销活动
        for (const promotion of promotions) {
            let discountAmount = 0;
            let discountInfo = null;
            const rules = parsePromotionRules(promotion.rules);

            // 根据促销类型计算折扣
            switch (promotion.type) {
                case 'full_reduction':
                    if (rules && rules.fullReductionRules && rules.fullReductionRules.length > 0) {
                        const result = PromotionRulesService.calculateFullReduction(originalAmount, totalQuantity, rules.fullReductionRules);
                        discountAmount = result.discountAmount;
                        discountInfo = result;
                    }
                    break;
                case 'full_gift':
                    // 满送不直接减少金额，而是添加赠品
                    if (rules && rules.fullGiftRules && rules.fullGiftRules.length > 0) {
                        const result = await PromotionRulesService.calculateFullGift(originalAmount, totalQuantity, rules.fullGiftRules);
                        discountInfo = result;
                        // 满送不减少金额，但记录赠品信息
                    }
                    break;
                case 'full_discount':
                    if (rules && rules.fullDiscountRules && rules.fullDiscountRules.length > 0) {
                        const result = PromotionRulesService.calculateFullDiscount(originalAmount, totalQuantity, rules.fullDiscountRules);
                        discountAmount = result.discountAmount;
                        discountInfo = result;
                    }
                    break;
                default:
                    discountAmount = this.calculateDiscountAmount(promotion, originalAmount, quantity);
            }
            
            if (discountAmount > 0) {
                discounts.push({
                    type: 'promotion',
                    id: promotion.id,
                    name: promotion.name,
                    amount: discountAmount,
                    description: discountInfo ? discountInfo.description : null
                });
                finalPrice -= discountAmount;
            }
        }

        // 应用优惠券
        for (const coupon of coupons) {
            let discountAmount = 0;
            let discountInfo = null;
            
            // 根据优惠券类型计算折扣
            switch (coupon.discountType) {
                case 'full_reduction':
                    if (coupon.fullReductionRules) {
                        const result = PromotionRulesService.calculateFullReduction(originalAmount, totalQuantity, coupon.fullReductionRules);
                        discountAmount = result.discountAmount;
                        discountInfo = result;
                    }
                    break;
                case 'full_gift':
                    // 满送不直接减少金额，而是添加赠品
                    if (coupon.fullGiftRules) {
                        const result = await PromotionRulesService.calculateFullGift(originalAmount, totalQuantity, coupon.fullGiftRules);
                        discountInfo = result;
                        // 满送不减少金额，但记录赠品信息
                    }
                    break;
                case 'full_discount':
                    if (coupon.fullDiscountRules) {
                        const result = PromotionRulesService.calculateFullDiscount(originalAmount, totalQuantity, coupon.fullDiscountRules);
                        discountAmount = result.discountAmount;
                        discountInfo = result;
                    }
                    break;
                default:
                    discountAmount = this.calculateDiscountAmount(coupon, originalAmount, quantity);
            }
            
            if (discountAmount > 0) {
                discounts.push({
                    type: 'coupon',
                    id: coupon.id,
                    name: coupon.name,
                    amount: discountAmount,
                    description: discountInfo ? discountInfo.description : null
                });
                finalPrice -= discountAmount;
            }
        }

        // 应用积分折扣
        if (pointInfo && pointInfo.pointDiscount > 0) {
            discounts.push({
                type: 'points',
                name: '积分抵扣',
                amount: pointInfo.pointDiscount
            });
            finalPrice -= pointInfo.pointDiscount;
        }

        // 应用会员等级折扣
        if (member && member.memberLevel && member.memberLevel.directCommissionRate > 0) {
            const memberDiscount = originalAmount * member.memberLevel.directCommissionRate;
            if (memberDiscount > 0) {
                discounts.push({
                    type: 'member',
                    name: '会员折扣',
                    amount: memberDiscount
                });
                finalPrice -= memberDiscount;
            }
        }

        const savings = originalAmount - finalPrice;
        const savingsRate = originalAmount > 0 ? (savings / originalAmount) * 100 : 0;

        return {
            originalAmount,
            finalPrice: Math.max(0, finalPrice),
            discounts,
            savings,
            savingsRate: Math.round(savingsRate * 100) / 100
        };
    }

    /**
     * 计算折扣金额
     */
    static calculateDiscountAmount(promotionOrCoupon, amount, quantity) {
        const discountType = promotionOrCoupon.discountType;
        const rawDiscountValue = promotionOrCoupon.discountValue;
        const discountValueNum = Number(rawDiscountValue);
        const maxDiscountAmount = promotionOrCoupon.maxDiscountAmount != null ? Number(promotionOrCoupon.maxDiscountAmount) : null;
        const minOrderAmount = promotionOrCoupon.minOrderAmount != null ? Number(promotionOrCoupon.minOrderAmount) : null;
        const amt = Number(amount) || 0;
        const qty = Number(quantity) || 0;

        // 检查最低订单金额
        if (minOrderAmount != null && minOrderAmount > 0 && amt < minOrderAmount) {
            return 0;
        }

        let discountAmount = 0;

        if (discountType === 'percentage') {
            discountAmount = amt * (discountValueNum / 100);
        } else if (discountType === 'fixed') {
            discountAmount = discountValueNum;
        } else if (discountType === 'quantity' && rawDiscountValue && typeof rawDiscountValue === 'object') {
            // 买X送Y或买X减Y
            const v = rawDiscountValue;
            const freeQuantity = Math.floor(qty / (v.quantity || 1)) * (v.freeQuantity || 0);
            discountAmount = qty > 0 ? freeQuantity * (amt / qty) : 0;
        }

        // 应用最大折扣限制
        if (maxDiscountAmount != null && maxDiscountAmount > 0 && discountAmount > maxDiscountAmount) {
            discountAmount = maxDiscountAmount;
        }

        return Math.min(discountAmount, amt);
    }

    /**
     * 验证并获取优惠券
     */
    static async validateAndGetCoupons(couponIds, memberId, productId, skuId, quantity) {
        // 支持传入 [id1, id2] 或 [{ id, code }, ...]（小程序提交订单格式）
        const ids = Array.isArray(couponIds)
            ? couponIds.map((c) => (c != null && typeof c === 'object' && 'id' in c) ? Number(c.id) : Number(c)).filter((id) => Number.isFinite(id) && id > 0)
            : [];
        if (ids.length === 0) return [];
        const coupons = await Coupon.findAll({
            where: {
                id: { [Op.in]: ids },
                status: 'active'
            }
        });

        // 验证优惠券可用性
        const validCoupons = [];
        for (const coupon of coupons) {
            const isValid = await this.validateCoupon(coupon, memberId, productId, skuId, quantity);
            if (isValid) {
                validCoupons.push(coupon);
            }
        }

        return validCoupons;
    }

    /**
     * 验证并获取促销活动
     */
    static async validateAndGetPromotions(promotionIds, productId, skuId, quantity) {
        const ids = Array.isArray(promotionIds) ? promotionIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0) : [];
        if (ids.length === 0) return [];
        const promotions = await Promotion.findAll({
            where: {
                id: { [Op.in]: ids },
                status: 'active'
            }
        });

        // 验证促销活动可用性
        const validPromotions = [];
        for (const promotion of promotions) {
            const isValid = await this.validatePromotion(promotion, productId, skuId, quantity);
            if (isValid) {
                validPromotions.push(promotion);
            }
        }

        return validPromotions;
    }

    /**
     * 验证积分使用
     */
    static async validatePointUsage(pointUsage, memberId, productId, skuId, quantity) {
        if (!pointUsage) {
            return null;
        }

        const member = await Member.findByPk(memberId);
        if (!member || member.availablePoints < pointUsage.pointAmount) {
            throw new Error('积分不足');
        }

        const pointProduct = await PointProduct.findOne({
            where: {
                productId: productId,
                skuId: skuId || null,
                status: 'active'
            }
        });

        if (!pointProduct) {
            throw new Error('该商品不支持积分兑换');
        }

        if (pointUsage.pointAmount > pointProduct.pointPrice * quantity) {
            throw new Error('积分使用超出限制');
        }

        return {
            pointPrice: pointProduct.pointPrice,
            pointAmount: pointUsage.pointAmount,
            pointDiscount: pointUsage.pointAmount * pointProduct.pointPrice
        };
    }

    /**
     * 验证优惠券
     */
    static async validateCoupon(coupon, memberId, productId, skuId, quantity) {
        const now = new Date();
        const validFrom = coupon.validFrom instanceof Date ? coupon.validFrom : new Date(coupon.validFrom);
        const validTo = coupon.validTo instanceof Date ? coupon.validTo : new Date(coupon.validTo);
        if (isNaN(validFrom.getTime()) || isNaN(validTo.getTime())) return false;
        if (validFrom > now || validTo < now) return false;

        if (coupon.usageLimit != null && coupon.usedCount != null && Number(coupon.usedCount) >= Number(coupon.usageLimit)) {
            return false;
        }

        const productIds = Array.isArray(coupon.productIds) ? coupon.productIds : (coupon.productIds ? [].concat(coupon.productIds) : []);
        if (productIds.length > 0) {
            const pid = Number(productId);
            if (!productIds.some((id) => Number(id) === pid)) return false;
        }

        const skuIds = Array.isArray(coupon.skuIds) ? coupon.skuIds : (coupon.skuIds ? [].concat(coupon.skuIds) : []);
        if (skuIds.length > 0 && skuId != null) {
            const sid = Number(skuId);
            if (!skuIds.some((id) => Number(id) === sid)) return false;
        }

        return true;
    }

    /**
     * 验证促销活动
     */
    static async validatePromotion(promotion, productId, skuId, quantity) {
        const now = new Date();

        if (promotion.startTime) {
            const start = promotion.startTime instanceof Date ? promotion.startTime.getTime() : new Date(promotion.startTime).getTime();
            const end = promotion.endTime instanceof Date ? promotion.endTime.getTime() : new Date(promotion.endTime).getTime();
            if (isNaN(start) || isNaN(end) || start > now.getTime() || end < now.getTime()) {
                return false;
            }
        } else if (promotion.validFrom && promotion.validTo) {
            const vf = promotion.validFrom instanceof Date ? promotion.validFrom : new Date(promotion.validFrom);
            const vt = promotion.validTo instanceof Date ? promotion.validTo : new Date(promotion.validTo);
            if (isNaN(vf.getTime()) || isNaN(vt.getTime()) || vf > now || vt < now) return false;
        }

        const productIds = Array.isArray(promotion.productIds) ? promotion.productIds : (promotion.productIds ? [].concat(promotion.productIds) : []);
        if (productIds.length > 0) {
            const pid = Number(productId);
            if (!productIds.some((id) => Number(id) === pid)) return false;
        }

        const skuIds = Array.isArray(promotion.skuIds) ? promotion.skuIds : (promotion.skuIds ? [].concat(promotion.skuIds) : []);
        if (skuIds.length > 0 && skuId != null) {
            const sid = Number(skuId);
            if (!skuIds.some((id) => Number(id) === sid)) return false;
        }

        if (promotion.minQuantity != null && Number(quantity) < Number(promotion.minQuantity)) {
            return false;
        }

        return true;
    }

    /**
     * 计算小计
     */
    static async calculateSubtotal(productId, skuId, quantity) {
        const product = await Product.findByPk(productId);
        if (!product) {
            return 0;
        }

        const safeQuantity = Number(quantity);
        const qty = Number.isFinite(safeQuantity) && safeQuantity > 0 ? safeQuantity : 1;

        let unitPrice = Number(product.price) || 0;

        if (skuId) {
            const sku = await ProductSKU.findByPk(skuId);
            if (sku && Number(sku.price)) {
                unitPrice = Number(sku.price);
            }
        }

        if (!unitPrice || Number.isNaN(unitPrice)) {
            const fallbackSku = await ProductSKU.findOne({
                where: {
                    productId,
                    status: 'active'
                },
                order: [['sortOrder', 'ASC'], ['createdAt', 'ASC']]
            });
            if (fallbackSku && Number(fallbackSku.price)) {
                unitPrice = Number(fallbackSku.price);
            }
        }

        if (!unitPrice || Number.isNaN(unitPrice)) {
            unitPrice = 0;
        }

        return unitPrice * qty;
    }

    /**
     * 获取适用的满减满送满折优惠（支持金额和数量条件）
     * @param {number} orderAmount - 订单金额
     * @param {number} orderQuantity - 订单商品总数量
     * @param {Array} productIds - 商品ID数组
     * @param {number} memberId - 会员ID
     * @returns {Object} 所有适用的优惠
     */
    static async getApplicablePromotions(orderAmount, orderQuantity, productIds = [], memberId = null) {
        return await PromotionRulesService.getApplicablePromotions(orderAmount, orderQuantity, productIds, memberId);
    }
}

module.exports = PromotionService;