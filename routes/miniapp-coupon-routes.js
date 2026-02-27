const express = require('express');
const { Op } = require('sequelize');
const { Coupon, Order, OrderItem, sequelize } = require('../db');
const { authenticateMiniappUser, optionalAuthenticate } = require('../middleware/miniapp-auth');
const router = express.Router();

// 获取我的优惠券列表
router.get('/coupons/my', authenticateMiniappUser, async (req, res) => {
    try {
        const { status = 'all', page = 1, limit = 20 } = req.query;
        const member = req.member;
        const offset = (page - 1) * limit;
        const now = new Date();

        // 查询会员已使用的优惠券（从订单项中获取）
        const usedCouponCodes = await OrderItem.findAll({
            include: [{
                model: Order,
                as: 'order',
                where: {
                    memberId: member.id,
                    status: { [Op.notIn]: ['cancelled', 'pending'] }
                },
                attributes: []
            }],
            attributes: ['appliedCoupons'],
            raw: true
        });

        const usedCodes = new Set();
        usedCouponCodes.forEach(order => {
            if (order.appliedCoupons && Array.isArray(order.appliedCoupons)) {
                order.appliedCoupons.forEach(coupon => {
                    if (coupon.code) {
                        usedCodes.add(coupon.code);
                    }
                });
            }
        });

        // 查询所有可用优惠券
        const where = {
            status: 'active',
            validFrom: { [Op.lte]: now },
            validTo: { [Op.gte]: now }
        };

        const { count, rows } = await Coupon.findAndCountAll({
            where,
            order: [['discountValue', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        // 处理优惠券数据
        const coupons = rows.map(coupon => {
            const isUsed = usedCodes.has(coupon.code);
            const isExpired = new Date(coupon.validTo) < now;
            const isAvailable = !isUsed && !isExpired && 
                               (coupon.totalCount - coupon.usedCount) > 0;

            let couponStatus = 'available';
            if (isUsed) {
                couponStatus = 'used';
            } else if (isExpired) {
                couponStatus = 'expired';
            } else if (!isAvailable) {
                couponStatus = 'unavailable';
            }

            const minOrder = coupon.minOrderAmount != null ? parseFloat(coupon.minOrderAmount) : (coupon.minAmount != null ? parseFloat(coupon.minAmount) : null);
            return {
                id: coupon.id,
                name: coupon.name,
                code: coupon.code,
                type: coupon.type,
                discountType: coupon.discountType,
                value: parseFloat(coupon.value),
                discountValue: parseFloat(coupon.discountValue),
                minAmount: coupon.minAmount ? parseFloat(coupon.minAmount) : null,
                minOrderAmount: minOrder,
                maxDiscount: coupon.maxDiscount ? parseFloat(coupon.maxDiscount) : null,
                maxDiscountAmount: coupon.maxDiscountAmount ? parseFloat(coupon.maxDiscountAmount) : null,
                validFrom: coupon.validFrom,
                validTo: coupon.validTo,
                description: coupon.description,
                status: couponStatus,
                isUsed,
                isExpired,
                isAvailable
            };
        });

        // 根据状态过滤
        let filteredCoupons = coupons;
        if (status === 'available') {
            filteredCoupons = coupons.filter(c => c.status === 'available');
        } else if (status === 'used') {
            filteredCoupons = coupons.filter(c => c.status === 'used');
        } else if (status === 'expired') {
            filteredCoupons = coupons.filter(c => c.status === 'expired');
        }

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                coupons: filteredCoupons,
                total: count,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page),
                hasMore: parseInt(page) < Math.ceil(count / limit)
            }
        });
    } catch (error) {
        console.error('获取我的优惠券失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取我的优惠券失败',
            error: error.message
        });
    }
});

// 获取可用优惠券（用于下单时选择）
router.get('/coupons/available', authenticateMiniappUser, async (req, res) => {
    try {
        const { productId, skuId, subtotal = 0 } = req.query;
        const member = req.member;
        const now = new Date();

        // 查询会员已使用的优惠券（从订单项中获取）
        const usedCouponCodes = await OrderItem.findAll({
            include: [{
                model: Order,
                as: 'order',
                where: {
                    memberId: member.id,
                    status: { [Op.notIn]: ['cancelled', 'pending'] }
                },
                attributes: []
            }],
            attributes: ['appliedCoupons'],
            raw: true
        });

        const usedCodes = new Set();
        usedCouponCodes.forEach(item => {
            if (item.appliedCoupons && Array.isArray(item.appliedCoupons)) {
                item.appliedCoupons.forEach(coupon => {
                    if (coupon.code) {
                        usedCodes.add(coupon.code);
                    }
                });
            }
        });

        // 查询可用优惠券
        const where = {
            status: 'active',
            validFrom: { [Op.lte]: now },
            validTo: { [Op.gte]: now },
            [Op.or]: [
                { minOrderAmount: { [Op.lte]: parseFloat(subtotal) } },
                { minOrderAmount: null }
            ]
        };

        // 如果指定了商品，筛选适用商品
        if (productId) {
            where[Op.or] = [
                { productIds: null },
                { productIds: { [Op.contains]: [parseInt(productId)] } }
            ];
        }

        const coupons = await Coupon.findAll({
            where,
            order: [['discountValue', 'DESC']],
            limit: 50
        });

        // 处理优惠券数据
        const availableCoupons = coupons
            .filter(coupon => {
                // 检查是否已使用
                if (usedCodes.has(coupon.code)) {
                    return false;
                }
                // 检查是否还有剩余
                if (coupon.totalCount - coupon.usedCount <= 0) {
                    return false;
                }
                // 检查最低订单金额
                if (coupon.minOrderAmount && parseFloat(subtotal) < parseFloat(coupon.minOrderAmount)) {
                    return false;
                }
                // 检查适用商品
                if (productId && coupon.productIds && Array.isArray(coupon.productIds)) {
                    if (!coupon.productIds.includes(parseInt(productId))) {
                        return false;
                    }
                }
                // 检查适用SKU
                if (skuId && coupon.skuIds && Array.isArray(coupon.skuIds)) {
                    if (!coupon.skuIds.includes(parseInt(skuId))) {
                        return false;
                    }
                }
                return true;
            })
            .map(coupon => ({
                id: coupon.id,
                name: coupon.name,
                code: coupon.code,
                type: coupon.type,
                discountType: coupon.discountType,
                value: parseFloat(coupon.value),
                discountValue: parseFloat(coupon.discountValue),
                minAmount: coupon.minAmount ? parseFloat(coupon.minAmount) : null,
                minOrderAmount: coupon.minOrderAmount ? parseFloat(coupon.minOrderAmount) : null,
                maxDiscount: coupon.maxDiscount ? parseFloat(coupon.maxDiscount) : null,
                maxDiscountAmount: coupon.maxDiscountAmount ? parseFloat(coupon.maxDiscountAmount) : null,
                validFrom: coupon.validFrom,
                validTo: coupon.validTo,
                description: coupon.description
            }));

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                coupons: availableCoupons
            }
        });
    } catch (error) {
        console.error('获取可用优惠券失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取可用优惠券失败',
            error: error.message
        });
    }
});

// 领取优惠券（实际上优惠券是直接可用的，这里只是记录）
router.post('/coupons/:id/receive', authenticateMiniappUser, async (req, res) => {
    try {
        const { id } = req.params;
        const member = req.member;
        const now = new Date();

        const coupon = await Coupon.findByPk(id);

        if (!coupon) {
            return res.status(404).json({
                code: 1,
                message: '优惠券不存在'
            });
        }

        // 检查优惠券状态
        if (coupon.status !== 'active') {
            return res.status(400).json({
                code: 1,
                message: '优惠券不可用'
            });
        }

        // 检查有效期
        if (new Date(coupon.validFrom) > now || new Date(coupon.validTo) < now) {
            return res.status(400).json({
                code: 1,
                message: '优惠券已过期或未生效'
            });
        }

        // 检查是否还有剩余
        if (coupon.totalCount - coupon.usedCount <= 0) {
            return res.status(400).json({
                code: 1,
                message: '优惠券已领完'
            });
        }

        // 检查会员使用次数限制
        if (coupon.memberUsageLimit) {
            const memberUsedCount = await OrderItem.count({
                include: [{
                    model: Order,
                    as: 'order',
                    where: {
                        memberId: member.id,
                        status: { [Op.notIn]: ['cancelled', 'pending'] }
                    },
                    attributes: []
                }],
                where: {
                    appliedCoupons: {
                        [Op.contains]: [{ code: coupon.code }]
                    }
                }
            });

            if (memberUsedCount >= coupon.memberUsageLimit) {
                return res.status(400).json({
                    code: 1,
                    message: `您已使用过该优惠券${coupon.memberUsageLimit}次，无法再次领取`
                });
            }
        }

        // 优惠券是直接可用的，不需要真正"领取"，这里只是返回成功
        res.json({
            code: 0,
            message: '优惠券已可用',
            data: {
                coupon: {
                    id: coupon.id,
                    name: coupon.name,
                    code: coupon.code,
                    type: coupon.type,
                    discountType: coupon.discountType,
                    value: parseFloat(coupon.value),
                    discountValue: parseFloat(coupon.discountValue),
                    minOrderAmount: coupon.minOrderAmount ? parseFloat(coupon.minOrderAmount) : null,
                    validFrom: coupon.validFrom,
                    validTo: coupon.validTo,
                    description: coupon.description
                }
            }
        });
    } catch (error) {
        console.error('领取优惠券失败:', error);
        res.status(500).json({
            code: 1,
            message: '领取优惠券失败',
            error: error.message
        });
    }
});

module.exports = router;

