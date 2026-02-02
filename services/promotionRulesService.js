const { Op } = require('sequelize');
const { Coupon, Promotion, Product, ProductSKU } = require('../db');

class PromotionRulesService {
    /**
     * 计算满减优惠（支持金额和数量条件）
     * @param {number} orderAmount - 订单金额
     * @param {number} orderQuantity - 订单商品总数量
     * @param {Array} rules - 满减规则数组
     * @returns {Object} 优惠结果
     */
    static calculateFullReduction(orderAmount, orderQuantity, rules) {
        if (!rules || !Array.isArray(rules) || rules.length === 0) {
            return { discountAmount: 0, appliedRule: null };
        }

        // 分别处理金额条件和数量条件
        const amountRules = rules.filter(rule => rule.conditionType === 'amount');
        const quantityRules = rules.filter(rule => rule.conditionType === 'quantity');

        let bestDiscount = { discountAmount: 0, appliedRule: null };

        // 检查金额条件
        if (amountRules.length > 0) {
            const sortedAmountRules = amountRules.sort((a, b) => b.minAmount - a.minAmount);
            for (const rule of sortedAmountRules) {
                if (orderAmount >= rule.minAmount) {
                    if (rule.discountAmount > bestDiscount.discountAmount) {
                        bestDiscount = {
                            discountAmount: rule.discountAmount,
                            appliedRule: rule,
                            description: `满${rule.minAmount}元减${rule.discountAmount}元`
                        };
                    }
                    break; // 找到最高金额条件就停止
                }
            }
        }

        // 检查数量条件
        if (quantityRules.length > 0) {
            const sortedQuantityRules = quantityRules.sort((a, b) => b.minQuantity - a.minQuantity);
            for (const rule of sortedQuantityRules) {
                if (orderQuantity >= rule.minQuantity) {
                    if (rule.discountAmount > bestDiscount.discountAmount) {
                        bestDiscount = {
                            discountAmount: rule.discountAmount,
                            appliedRule: rule,
                            description: `满${rule.minQuantity}件减${rule.discountAmount}元`
                        };
                    }
                    break; // 找到最高数量条件就停止
                }
            }
        }

        return bestDiscount;
    }

    /**
     * 计算满送优惠（支持金额和数量条件）
     * @param {number} orderAmount - 订单金额
     * @param {number} orderQuantity - 订单商品总数量
     * @param {Array} rules - 满送规则数组
     * @returns {Object} 优惠结果
     */
    static async calculateFullGift(orderAmount, orderQuantity, rules) {
        if (!rules || !Array.isArray(rules) || rules.length === 0) {
            return { gifts: [], appliedRule: null };
        }

        // 分别处理金额条件和数量条件
        const amountRules = rules.filter(rule => rule.conditionType === 'amount');
        const quantityRules = rules.filter(rule => rule.conditionType === 'quantity');

        let bestGift = { gifts: [], appliedRule: null };

        // 检查金额条件
        if (amountRules.length > 0) {
            const sortedAmountRules = amountRules.sort((a, b) => b.minAmount - a.minAmount);
            for (const rule of sortedAmountRules) {
                if (orderAmount >= rule.minAmount) {
                    const giftProduct = await Product.findByPk(rule.giftProductId, {
                        include: [{ model: ProductSKU, as: 'skus' }]
                    });

                    if (giftProduct) {
                        bestGift = {
                            gifts: [{
                                productId: rule.giftProductId,
                                productName: giftProduct.name,
                                productImage: giftProduct.images && giftProduct.images.length > 0 ? giftProduct.images[0] : null,
                                quantity: rule.giftQuantity,
                                skuId: rule.giftSkuId || null
                            }],
                            appliedRule: rule,
                            description: `满${rule.minAmount}元送${giftProduct.name}${rule.giftQuantity}件`
                        };
                    }
                    break; // 找到最高金额条件就停止
                }
            }
        }

        // 检查数量条件
        if (quantityRules.length > 0) {
            const sortedQuantityRules = quantityRules.sort((a, b) => b.minQuantity - a.minQuantity);
            for (const rule of sortedQuantityRules) {
                if (orderQuantity >= rule.minQuantity) {
                    const giftProduct = await Product.findByPk(rule.giftProductId, {
                        include: [{ model: ProductSKU, as: 'skus' }]
                    });

                    if (giftProduct) {
                        // 如果数量条件的赠品价值更高，则使用数量条件
                        const currentGiftValue = giftProduct.price * rule.giftQuantity;
                        const existingGiftValue = bestGift.gifts.length > 0 ? 
                            bestGift.gifts[0].quantity * (await Product.findByPk(bestGift.gifts[0].productId)).price : 0;

                        if (currentGiftValue > existingGiftValue) {
                            bestGift = {
                                gifts: [{
                                    productId: rule.giftProductId,
                                    productName: giftProduct.name,
                                    productImage: giftProduct.images && giftProduct.images.length > 0 ? giftProduct.images[0] : null,
                                    quantity: rule.giftQuantity,
                                    skuId: rule.giftSkuId || null
                                }],
                                appliedRule: rule,
                                description: `满${rule.minQuantity}件送${giftProduct.name}${rule.giftQuantity}件`
                            };
                        }
                    }
                    break; // 找到最高数量条件就停止
                }
            }
        }

        return bestGift;
    }

    /**
     * 计算满折优惠（支持金额和数量条件）
     * @param {number} orderAmount - 订单金额
     * @param {number} orderQuantity - 订单商品总数量
     * @param {Array} rules - 满折规则数组
     * @returns {Object} 优惠结果
     */
    static calculateFullDiscount(orderAmount, orderQuantity, rules) {
        if (!rules || !Array.isArray(rules) || rules.length === 0) {
            return { discountRate: 1, discountAmount: 0, appliedRule: null };
        }

        // 分别处理金额条件和数量条件
        const amountRules = rules.filter(rule => rule.conditionType === 'amount');
        const quantityRules = rules.filter(rule => rule.conditionType === 'quantity');

        let bestDiscount = { discountRate: 1, discountAmount: 0, appliedRule: null };

        // 检查金额条件
        if (amountRules.length > 0) {
            const sortedAmountRules = amountRules.sort((a, b) => b.minAmount - a.minAmount);
            for (const rule of sortedAmountRules) {
                if (orderAmount >= rule.minAmount) {
                    const discountAmount = orderAmount * (1 - rule.discountRate);
                    if (discountAmount > bestDiscount.discountAmount) {
                        bestDiscount = {
                            discountRate: rule.discountRate,
                            discountAmount: discountAmount,
                            appliedRule: rule,
                            description: `满${rule.minAmount}元享${Math.round(rule.discountRate * 10)}折`
                        };
                    }
                    break; // 找到最高金额条件就停止
                }
            }
        }

        // 检查数量条件
        if (quantityRules.length > 0) {
            const sortedQuantityRules = quantityRules.sort((a, b) => b.minQuantity - a.minQuantity);
            for (const rule of sortedQuantityRules) {
                if (orderQuantity >= rule.minQuantity) {
                    const discountAmount = orderAmount * (1 - rule.discountRate);
                    if (discountAmount > bestDiscount.discountAmount) {
                        bestDiscount = {
                            discountRate: rule.discountRate,
                            discountAmount: discountAmount,
                            appliedRule: rule,
                            description: `满${rule.minQuantity}件享${Math.round(rule.discountRate * 10)}折`
                        };
                    }
                    break; // 找到最高数量条件就停止
                }
            }
        }

        return bestDiscount;
    }

    /**
     * 验证满减规则（支持金额和数量条件）
     * @param {Array} rules - 满减规则数组
     * @returns {Object} 验证结果
     */
    static validateFullReductionRules(rules) {
        if (!Array.isArray(rules) || rules.length === 0) {
            return { valid: false, message: '满减规则不能为空' };
        }

        for (let i = 0; i < rules.length; i++) {
            const rule = rules[i];
            
            // 验证条件类型
            if (!rule.conditionType || !['amount', 'quantity'].includes(rule.conditionType)) {
                return { valid: false, message: `第${i + 1}条规则的条件类型必须是amount或quantity` };
            }
            
            if (rule.conditionType === 'amount') {
                if (!rule.minAmount || rule.minAmount <= 0) {
                    return { valid: false, message: `第${i + 1}条规则的最低消费金额必须大于0` };
                }
            } else if (rule.conditionType === 'quantity') {
                if (!rule.minQuantity || rule.minQuantity <= 0) {
                    return { valid: false, message: `第${i + 1}条规则的最低商品数量必须大于0` };
                }
            }
            
            if (!rule.discountAmount || rule.discountAmount <= 0) {
                return { valid: false, message: `第${i + 1}条规则的优惠金额必须大于0` };
            }
            
            // 金额条件的额外验证
            if (rule.conditionType === 'amount' && rule.discountAmount >= rule.minAmount) {
                return { valid: false, message: `第${i + 1}条规则的优惠金额不能大于等于最低消费金额` };
            }
        }

        // 检查同类型规则是否有重叠
        const amountRules = rules.filter(rule => rule.conditionType === 'amount');
        const quantityRules = rules.filter(rule => rule.conditionType === 'quantity');

        // 检查金额规则重叠
        if (amountRules.length > 1) {
            const sortedAmountRules = amountRules.sort((a, b) => a.minAmount - b.minAmount);
            for (let i = 1; i < sortedAmountRules.length; i++) {
                if (sortedAmountRules[i].minAmount <= sortedAmountRules[i - 1].minAmount) {
                    return { valid: false, message: '金额条件的满减规则不能重复' };
                }
            }
        }

        // 检查数量规则重叠
        if (quantityRules.length > 1) {
            const sortedQuantityRules = quantityRules.sort((a, b) => a.minQuantity - b.minQuantity);
            for (let i = 1; i < sortedQuantityRules.length; i++) {
                if (sortedQuantityRules[i].minQuantity <= sortedQuantityRules[i - 1].minQuantity) {
                    return { valid: false, message: '数量条件的满减规则不能重复' };
                }
            }
        }

        return { valid: true };
    }

    /**
     * 验证满送规则（支持金额和数量条件）
     * @param {Array} rules - 满送规则数组
     * @returns {Object} 验证结果
     */
    static validateFullGiftRules(rules) {
        if (!Array.isArray(rules) || rules.length === 0) {
            return { valid: false, message: '满送规则不能为空' };
        }

        for (let i = 0; i < rules.length; i++) {
            const rule = rules[i];
            
            // 验证条件类型
            if (!rule.conditionType || !['amount', 'quantity'].includes(rule.conditionType)) {
                return { valid: false, message: `第${i + 1}条规则的条件类型必须是amount或quantity` };
            }
            
            if (rule.conditionType === 'amount') {
                if (!rule.minAmount || rule.minAmount <= 0) {
                    return { valid: false, message: `第${i + 1}条规则的最低消费金额必须大于0` };
                }
            } else if (rule.conditionType === 'quantity') {
                if (!rule.minQuantity || rule.minQuantity <= 0) {
                    return { valid: false, message: `第${i + 1}条规则的最低商品数量必须大于0` };
                }
            }
            
            if (!rule.giftProductId) {
                return { valid: false, message: `第${i + 1}条规则必须选择赠品` };
            }
            
            if (!rule.giftQuantity || rule.giftQuantity <= 0) {
                return { valid: false, message: `第${i + 1}条规则的赠品数量必须大于0` };
            }
        }

        return { valid: true };
    }

    /**
     * 验证满折规则（支持金额和数量条件）
     * @param {Array} rules - 满折规则数组
     * @returns {Object} 验证结果
     */
    static validateFullDiscountRules(rules) {
        if (!Array.isArray(rules) || rules.length === 0) {
            return { valid: false, message: '满折规则不能为空' };
        }

        for (let i = 0; i < rules.length; i++) {
            const rule = rules[i];
            
            // 验证条件类型
            if (!rule.conditionType || !['amount', 'quantity'].includes(rule.conditionType)) {
                return { valid: false, message: `第${i + 1}条规则的条件类型必须是amount或quantity` };
            }
            
            if (rule.conditionType === 'amount') {
                if (!rule.minAmount || rule.minAmount <= 0) {
                    return { valid: false, message: `第${i + 1}条规则的最低消费金额必须大于0` };
                }
            } else if (rule.conditionType === 'quantity') {
                if (!rule.minQuantity || rule.minQuantity <= 0) {
                    return { valid: false, message: `第${i + 1}条规则的最低商品数量必须大于0` };
                }
            }
            
            if (!rule.discountRate || rule.discountRate <= 0 || rule.discountRate >= 1) {
                return { valid: false, message: `第${i + 1}条规则的折扣率必须在0-1之间` };
            }
        }

        return { valid: true };
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
        const applicablePromotions = {
            coupons: [],
            promotions: []
        };

        try {
            // 获取适用的优惠券
            const coupons = await Coupon.findAll({
                where: {
                    status: 'active',
                    validFrom: { [Op.lte]: new Date() },
                    validTo: { [Op.gte]: new Date() }
                }
            });

            for (const coupon of coupons) {
                let isApplicable = false;
                let discountInfo = null;

                // 检查最低消费金额
                if (coupon.minAmount && orderAmount < coupon.minAmount) {
                    continue;
                }

                // 根据优惠券类型计算优惠
                switch (coupon.discountType) {
                    case 'full_reduction':
                        if (coupon.fullReductionRules) {
                            const result = this.calculateFullReduction(orderAmount, orderQuantity, coupon.fullReductionRules);
                            if (result.discountAmount > 0) {
                                isApplicable = true;
                                discountInfo = result;
                            }
                        }
                        break;
                    case 'full_gift':
                        if (coupon.fullGiftRules) {
                            const result = await this.calculateFullGift(orderAmount, orderQuantity, coupon.fullGiftRules);
                            if (result.gifts.length > 0) {
                                isApplicable = true;
                                discountInfo = result;
                            }
                        }
                        break;
                    case 'full_discount':
                        if (coupon.fullDiscountRules) {
                            const result = this.calculateFullDiscount(orderAmount, orderQuantity, coupon.fullDiscountRules);
                            if (result.discountAmount > 0) {
                                isApplicable = true;
                                discountInfo = result;
                            }
                        }
                        break;
                }

                if (isApplicable) {
                    applicablePromotions.coupons.push({
                        id: coupon.id,
                        name: coupon.name,
                        type: coupon.type,
                        discountType: coupon.discountType,
                        discountInfo: discountInfo,
                        description: coupon.description
                    });
                }
            }

            // 获取适用的促销活动
            const promotions = await Promotion.findAll({
                where: {
                    status: 'active',
                    startTime: { [Op.lte]: new Date() },
                    endTime: { [Op.gte]: new Date() }
                }
            });

            for (const promotion of promotions) {
                let isApplicable = false;
                let discountInfo = null;

                // 根据促销类型计算优惠
                switch (promotion.type) {
                    case 'full_reduction':
                        if (promotion.rules && promotion.rules.fullReductionRules) {
                            const result = this.calculateFullReduction(orderAmount, orderQuantity, promotion.rules.fullReductionRules);
                            if (result.discountAmount > 0) {
                                isApplicable = true;
                                discountInfo = result;
                            }
                        }
                        break;
                    case 'full_gift':
                        if (promotion.rules && promotion.rules.fullGiftRules) {
                            const result = await this.calculateFullGift(orderAmount, orderQuantity, promotion.rules.fullGiftRules);
                            if (result.gifts.length > 0) {
                                isApplicable = true;
                                discountInfo = result;
                            }
                        }
                        break;
                    case 'full_discount':
                        if (promotion.rules && promotion.rules.fullDiscountRules) {
                            const result = this.calculateFullDiscount(orderAmount, orderQuantity, promotion.rules.fullDiscountRules);
                            if (result.discountAmount > 0) {
                                isApplicable = true;
                                discountInfo = result;
                            }
                        }
                        break;
                }

                if (isApplicable) {
                    applicablePromotions.promotions.push({
                        id: promotion.id,
                        name: promotion.name,
                        type: promotion.type,
                        discountInfo: discountInfo,
                        description: promotion.description
                    });
                }
            }

            return applicablePromotions;
        } catch (error) {
            console.error('获取适用优惠失败:', error);
            throw error;
        }
    }

    /**
     * 生成规则配置示例
     * @param {string} type - 规则类型
     * @param {string} conditionType - 条件类型
     * @returns {Object} 规则配置示例
     */
    static getRuleExample(type, conditionType) {
        const examples = {
            full_reduction: {
                amount: [
                    { conditionType: 'amount', minAmount: 100, discountAmount: 10 },
                    { conditionType: 'amount', minAmount: 200, discountAmount: 30 },
                    { conditionType: 'amount', minAmount: 500, discountAmount: 80 }
                ],
                quantity: [
                    { conditionType: 'quantity', minQuantity: 3, discountAmount: 15 },
                    { conditionType: 'quantity', minQuantity: 5, discountAmount: 30 },
                    { conditionType: 'quantity', minQuantity: 10, discountAmount: 80 }
                ]
            },
            full_gift: {
                amount: [
                    { conditionType: 'amount', minAmount: 100, giftProductId: 1, giftQuantity: 1 },
                    { conditionType: 'amount', minAmount: 200, giftProductId: 2, giftQuantity: 2 }
                ],
                quantity: [
                    { conditionType: 'quantity', minQuantity: 3, giftProductId: 1, giftQuantity: 1 },
                    { conditionType: 'quantity', minQuantity: 5, giftProductId: 2, giftQuantity: 2 }
                ]
            },
            full_discount: {
                amount: [
                    { conditionType: 'amount', minAmount: 100, discountRate: 0.9 },
                    { conditionType: 'amount', minAmount: 200, discountRate: 0.8 },
                    { conditionType: 'amount', minAmount: 500, discountRate: 0.7 }
                ],
                quantity: [
                    { conditionType: 'quantity', minQuantity: 3, discountRate: 0.9 },
                    { conditionType: 'quantity', minQuantity: 5, discountRate: 0.8 },
                    { conditionType: 'quantity', minQuantity: 10, discountRate: 0.7 }
                ]
            }
        };

        return examples[type] && examples[type][conditionType] ? examples[type][conditionType] : [];
    }
}

module.exports = PromotionRulesService;