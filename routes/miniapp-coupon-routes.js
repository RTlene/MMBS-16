const express = require('express');
const { Op } = require('sequelize');
const { Coupon, Order, OrderItem, MemberCoupon, Member, sequelize } = require('../db');
const { authenticateMiniappUser, optionalAuthenticate } = require('../middleware/miniapp-auth');
const router = express.Router();

/** 检查会员是否满足自动发放条件 autoGrantRules。member 为完整会员对象，stats 为 { orderCount, totalSpent }。无条件（null/空数组/非数组）视为满足。 */
function memberSatisfiesAutoGrantRules(member, stats, autoGrantRules) {
    if (!autoGrantRules || !Array.isArray(autoGrantRules) || autoGrantRules.length === 0) return true;
    for (const rule of autoGrantRules) {
        const type = (rule.type || '').toLowerCase();
        if (type === 'member_level' && rule.memberLevelId != null) {
            if ((member.memberLevelId || null) !== parseInt(rule.memberLevelId, 10)) return false;
        } else if (type === 'min_order_count' && rule.value != null) {
            const n = parseInt(rule.value, 10);
            if (!Number.isFinite(n) || (stats.orderCount || 0) < n) return false;
        } else if (type === 'min_total_spent' && rule.value != null) {
            const minSpent = parseFloat(rule.value);
            if (!Number.isFinite(minSpent) || (stats.totalSpent || 0) < minSpent) return false;
        } else if (type === 'new_member_only' && rule.value) {
            const days = parseInt(rule.value, 10) || 30;
            const since = new Date();
            since.setDate(since.getDate() - days);
            if (!member.createdAt || new Date(member.createdAt) < since) return false;
        }
    }
    return true;
}

// 获取我的优惠券列表：MemberCoupon（系统发放+用户领取）+ 满足条件的自动发放券（无 MemberCoupon 记录也展示）
router.get('/coupons/my', authenticateMiniappUser, async (req, res) => {
    try {
        const { status = 'all', page = 1, limit = 20 } = req.query;
        const member = req.member;
        const limitNum = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
        const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limitNum;
        const now = new Date();

        const allRows = await MemberCoupon.findAll({
            where: { memberId: member.id },
            include: [{ model: Coupon, as: 'coupon', required: true }],
            order: [['createdAt', 'DESC']]
        });

        const toItem = (mc) => {
            const coupon = mc.coupon;
            if (!coupon) return null;
            const isUsed = !!mc.usedAt;
            const isExpired = !isUsed && new Date(coupon.validTo) < now;
            const isAvailable = !isUsed && !isExpired && coupon.status === 'active' &&
                new Date(coupon.validFrom) <= now && new Date(coupon.validTo) >= now;
            let couponStatus = 'available';
            if (isUsed) couponStatus = 'used';
            else if (isExpired) couponStatus = 'expired';
            else if (!isAvailable) couponStatus = 'unavailable';

            const minOrder = coupon.minOrderAmount != null ? parseFloat(coupon.minOrderAmount) : (coupon.minAmount != null ? parseFloat(coupon.minAmount) : null);
            const value = coupon.value != null ? parseFloat(coupon.value) : (coupon.discountValue != null ? parseFloat(coupon.discountValue) : 0);
            const discountValue = coupon.discountValue != null ? parseFloat(coupon.discountValue) : value;
            return {
                id: coupon.id,
                name: coupon.name,
                code: coupon.code,
                type: coupon.type,
                discountType: coupon.discountType || 'fixed',
                value: Number.isFinite(value) ? value : 0,
                discountValue: Number.isFinite(discountValue) ? discountValue : 0,
                minAmount: coupon.minAmount != null ? parseFloat(coupon.minAmount) : null,
                minOrderAmount: minOrder,
                maxDiscount: coupon.maxDiscount != null ? parseFloat(coupon.maxDiscount) : null,
                maxDiscountAmount: coupon.maxDiscountAmount != null ? parseFloat(coupon.maxDiscountAmount) : null,
                validFrom: coupon.validFrom,
                validTo: coupon.validTo,
                description: coupon.description,
                status: couponStatus,
                isUsed,
                isExpired,
                isAvailable
            };
        };

        let list = allRows.map(toItem).filter(Boolean);
        const seenIds = new Set(list.map(c => c.id));

        // 合并满足条件的自动发放券（无领取记录也展示在「我的」中，与下单可用逻辑一致）
        const memberFull = await Member.findByPk(member.id, { attributes: ['id', 'memberLevelId', 'createdAt'] });
        const orderStats = await Order.findAll({
            where: { memberId: member.id, status: { [Op.notIn]: ['cancelled', 'pending'] } },
            attributes: [[sequelize.fn('COUNT', sequelize.col('id')), 'orderCount'], [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('totalAmount')), 0), 'totalSpent']],
            raw: true
        });
        const stats = orderStats && orderStats[0] ? { orderCount: parseInt(orderStats[0].orderCount, 10) || 0, totalSpent: parseFloat(orderStats[0].totalSpent) || 0 } : { orderCount: 0, totalSpent: 0 };
        const autoCoupons = await Coupon.findAll({
            where: {
                status: 'active',
                distributionMode: 'auto',
                validFrom: { [Op.lte]: now },
                validTo: { [Op.gte]: now }
            },
            order: [['discountValue', 'DESC']],
            limit: 50
        });
        const memberOrderItems = await OrderItem.findAll({
            include: [{ model: Order, as: 'order', required: true, where: { memberId: member.id, status: { [Op.notIn]: ['cancelled', 'pending'] } }, attributes: [] }],
            attributes: ['appliedCoupons'],
            raw: true
        });
        for (const coupon of autoCoupons) {
            if (seenIds.has(coupon.id)) continue;
            if (!memberSatisfiesAutoGrantRules(memberFull || member, stats, coupon.autoGrantRules)) continue;
            const userUseLimit = coupon.userClaimLimit != null ? parseInt(coupon.userClaimLimit, 10) : (coupon.memberUsageLimit != null ? parseInt(coupon.memberUsageLimit, 10) : null);
            const usedCount = memberOrderItems.filter(item =>
                Array.isArray(item.appliedCoupons) && item.appliedCoupons.some(c => c && c.code === coupon.code)
            ).length;
            const isUsed = Number.isFinite(userUseLimit) && userUseLimit > 0 ? usedCount >= userUseLimit : usedCount > 0;
            const isExpired = new Date(coupon.validTo) < now;
            const isAvailable = !isUsed && !isExpired;
            let couponStatus = 'available';
            if (isUsed) couponStatus = 'used';
            else if (isExpired) couponStatus = 'expired';
            else if (!isAvailable) couponStatus = 'unavailable';
            const minOrder = coupon.minOrderAmount != null ? parseFloat(coupon.minOrderAmount) : (coupon.minAmount != null ? parseFloat(coupon.minAmount) : null);
            const value = coupon.value != null ? parseFloat(coupon.value) : (coupon.discountValue != null ? parseFloat(coupon.discountValue) : 0);
            const discountValue = coupon.discountValue != null ? parseFloat(coupon.discountValue) : value;
            list.push({
                id: coupon.id,
                name: coupon.name,
                code: coupon.code,
                type: coupon.type,
                discountType: coupon.discountType || 'fixed',
                value: Number.isFinite(value) ? value : 0,
                discountValue: Number.isFinite(discountValue) ? discountValue : 0,
                minAmount: coupon.minAmount != null ? parseFloat(coupon.minAmount) : null,
                minOrderAmount: minOrder,
                maxDiscount: coupon.maxDiscount != null ? parseFloat(coupon.maxDiscount) : null,
                maxDiscountAmount: coupon.maxDiscountAmount != null ? parseFloat(coupon.maxDiscountAmount) : null,
                validFrom: coupon.validFrom,
                validTo: coupon.validTo,
                description: coupon.description,
                status: couponStatus,
                isUsed,
                isExpired,
                isAvailable
            });
            seenIds.add(coupon.id);
        }

        if (status === 'available') list = list.filter(c => c.status === 'available');
        else if (status === 'used') list = list.filter(c => c.status === 'used');
        else if (status === 'expired') list = list.filter(c => c.status === 'expired');

        const totalCount = list.length;
        const coupons = list.slice(offset, offset + limitNum);

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                coupons,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitNum),
                currentPage: Math.max(parseInt(page) || 1, 1),
                hasMore: offset + coupons.length < totalCount
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

// 获取可用优惠券（用于下单时选择）：已领取未使用的 MemberCoupon + 可领取池中符合条件且未领完的 user_claim 券
router.get('/coupons/available', authenticateMiniappUser, async (req, res) => {
    const { productId, skuId, subtotal } = req.query;
    const member = req.member;
    console.log('[Coupons/available] 请求 memberId=%s subtotal=%s productId=%s skuId=%s', member && member.id, subtotal, productId || '-', skuId || '-');
    try {
        const subtotalNum = (subtotal != null && subtotal !== '') ? parseFloat(subtotal) : 0;
        const safeSubtotal = Number.isFinite(subtotalNum) ? subtotalNum : 0;
        const now = new Date();

        const toCouponItem = (coupon) => {
            const value = coupon.value != null ? parseFloat(coupon.value) : (coupon.discountValue != null ? parseFloat(coupon.discountValue) : 0);
            const discountValue = coupon.discountValue != null ? parseFloat(coupon.discountValue) : value;
            const minOrder = coupon.minOrderAmount != null ? parseFloat(coupon.minOrderAmount) : (coupon.minAmount != null ? parseFloat(coupon.minAmount) : null);
            return {
                id: coupon.id,
                name: coupon.name,
                code: coupon.code,
                type: coupon.type,
                discountType: coupon.discountType || 'fixed',
                value: Number.isFinite(value) ? value : 0,
                discountValue: Number.isFinite(discountValue) ? discountValue : 0,
                minAmount: coupon.minAmount != null ? parseFloat(coupon.minAmount) : null,
                minOrderAmount: minOrder,
                maxDiscount: coupon.maxDiscount != null ? parseFloat(coupon.maxDiscount) : null,
                maxDiscountAmount: coupon.maxDiscountAmount != null ? parseFloat(coupon.maxDiscountAmount) : null,
                validFrom: coupon.validFrom,
                validTo: coupon.validTo,
                description: coupon.description
            };
        };

        const seenIds = new Set();

        // 1) 已领取且未使用的券（MemberCoupon）
        const rows = await MemberCoupon.findAll({
            where: { memberId: member.id, usedAt: null },
            include: [{ model: Coupon, as: 'coupon', required: true }],
            order: [[{ model: Coupon, as: 'coupon' }, 'discountValue', 'DESC']]
        });
        const fromHeld = rows
            .filter(mc => {
                const coupon = mc.coupon;
                if (!coupon || coupon.status !== 'active') return false;
                if (new Date(coupon.validFrom) > now || new Date(coupon.validTo) < now) return false;
                if (coupon.minOrderAmount != null && safeSubtotal < parseFloat(coupon.minOrderAmount)) return false;
                if (productId && coupon.productIds && Array.isArray(coupon.productIds) && coupon.productIds.length > 0) {
                    if (!coupon.productIds.includes(parseInt(productId))) return false;
                }
                if (skuId && coupon.skuIds && Array.isArray(coupon.skuIds) && coupon.skuIds.length > 0) {
                    if (!coupon.skuIds.includes(parseInt(skuId))) return false;
                }
                return true;
            })
            .map(mc => {
                seenIds.add(mc.coupon.id);
                return toCouponItem(mc.coupon);
            });

        // 2) 用户领取池中符合条件且未领完的券（未先领取也可在下单时选用）
        const poolCoupons = await Coupon.findAll({
            where: {
                status: 'active',
                distributionMode: 'user_claim',
                validFrom: { [Op.lte]: now },
                validTo: { [Op.gte]: now }
            },
            order: [['discountValue', 'DESC']],
            limit: 50
        });
        const fromPool = [];
        for (const coupon of poolCoupons) {
            if (seenIds.has(coupon.id)) continue;
            if (coupon.minOrderAmount != null && safeSubtotal < parseFloat(coupon.minOrderAmount)) continue;
            if (productId && coupon.productIds && Array.isArray(coupon.productIds) && coupon.productIds.length > 0) {
                if (!coupon.productIds.includes(parseInt(productId))) continue;
            }
            if (skuId && coupon.skuIds && Array.isArray(coupon.skuIds) && coupon.skuIds.length > 0) {
                if (!coupon.skuIds.includes(parseInt(skuId))) continue;
            }
            const totalClaimed = await MemberCoupon.count({ where: { couponId: coupon.id } });
            if (totalClaimed >= (coupon.totalCount || 0)) continue;
            const userClaimLimit = coupon.userClaimLimit != null ? parseInt(coupon.userClaimLimit, 10) : null;
            if (Number.isFinite(userClaimLimit) && userClaimLimit >= 0) {
                const userClaimed = await MemberCoupon.count({ where: { memberId: member.id, couponId: coupon.id } });
                if (userClaimed >= userClaimLimit) continue;
            }
            fromPool.push(toCouponItem(coupon));
        }

        // 3) 自动发放券：总数无上限，满足条件即可见，每用户使用次数有上限（userClaimLimit/memberUsageLimit）
        const memberFull = await Member.findByPk(member.id, { attributes: ['id', 'memberLevelId', 'createdAt'] });
        const orderStats = await Order.findAll({
            where: {
                memberId: member.id,
                status: { [Op.notIn]: ['cancelled', 'pending'] }
            },
            attributes: [[sequelize.fn('COUNT', sequelize.col('id')), 'orderCount'], [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('totalAmount')), 0), 'totalSpent']],
            raw: true
        });
        const stats = orderStats && orderStats[0] ? { orderCount: parseInt(orderStats[0].orderCount, 10) || 0, totalSpent: parseFloat(orderStats[0].totalSpent) || 0 } : { orderCount: 0, totalSpent: 0 };
        const autoCoupons = await Coupon.findAll({
            where: {
                status: 'active',
                distributionMode: 'auto',
                validFrom: { [Op.lte]: now },
                validTo: { [Op.gte]: now }
            },
            order: [['discountValue', 'DESC']],
            limit: 50
        });
        const fromAuto = [];
        for (const coupon of autoCoupons) {
            if (seenIds.has(coupon.id)) continue;
            if (!memberSatisfiesAutoGrantRules(memberFull || member, stats, coupon.autoGrantRules)) continue;
            if (coupon.minOrderAmount != null && safeSubtotal < parseFloat(coupon.minOrderAmount)) continue;
            if (productId && coupon.productIds && Array.isArray(coupon.productIds) && coupon.productIds.length > 0) {
                if (!coupon.productIds.includes(parseInt(productId))) continue;
            }
            if (skuId && coupon.skuIds && Array.isArray(coupon.skuIds) && coupon.skuIds.length > 0) {
                if (!coupon.skuIds.includes(parseInt(skuId))) continue;
            }
            const userUseLimit = coupon.userClaimLimit != null ? parseInt(coupon.userClaimLimit, 10) : (coupon.memberUsageLimit != null ? parseInt(coupon.memberUsageLimit, 10) : null);
            if (Number.isFinite(userUseLimit) && userUseLimit > 0) {
                const memberOrderItems = await OrderItem.findAll({
                    include: [{ model: Order, as: 'order', required: true, where: { memberId: member.id, status: { [Op.notIn]: ['cancelled', 'pending'] } }, attributes: [] }],
                    attributes: ['appliedCoupons'],
                    raw: true
                });
                const usedCount = memberOrderItems.filter(item =>
                    Array.isArray(item.appliedCoupons) && item.appliedCoupons.some(c => c && c.code === coupon.code)
                ).length;
                if (usedCount >= userUseLimit) continue;
            }
            fromAuto.push(toCouponItem(coupon));
        }

        const availableCoupons = [...fromHeld, ...fromPool, ...fromAuto];
        console.log('[Coupons/available] memberId=%s subtotal=%s productId=%s -> held=%s pool=%s auto=%s total=%s',
            member.id, safeSubtotal, productId || '', fromHeld.length, fromPool.length, fromAuto.length, availableCoupons.length);

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

// 可领取的优惠券列表（user_claim 且未达总库存与每用户领取限量）
router.get('/coupons/claimable', authenticateMiniappUser, async (req, res) => {
    try {
        const member = req.member;
        const now = new Date();

        const coupons = await Coupon.findAll({
            where: {
                status: 'active',
                distributionMode: 'user_claim',
                validFrom: { [Op.lte]: now },
                validTo: { [Op.gte]: now }
            },
            order: [['discountValue', 'DESC']],
            limit: 50
        });

        const claimable = [];
        for (const coupon of coupons) {
            const totalClaimed = await MemberCoupon.count({ where: { couponId: coupon.id } });
            if (totalClaimed >= (coupon.totalCount || 0)) continue;

            const userClaimLimit = coupon.userClaimLimit != null ? parseInt(coupon.userClaimLimit, 10) : null;
            if (Number.isFinite(userClaimLimit) && userClaimLimit >= 0) {
                const userClaimed = await MemberCoupon.count({
                    where: { memberId: member.id, couponId: coupon.id }
                });
                if (userClaimed >= userClaimLimit) continue;
            }

            const value = coupon.value != null ? parseFloat(coupon.value) : (coupon.discountValue != null ? parseFloat(coupon.discountValue) : 0);
            const discountValue = coupon.discountValue != null ? parseFloat(coupon.discountValue) : value;
            const minOrder = coupon.minOrderAmount != null ? parseFloat(coupon.minOrderAmount) : (coupon.minAmount != null ? parseFloat(coupon.minAmount) : null);
            claimable.push({
                id: coupon.id,
                name: coupon.name,
                code: coupon.code,
                type: coupon.type,
                discountType: coupon.discountType || 'fixed',
                value: Number.isFinite(value) ? value : 0,
                discountValue: Number.isFinite(discountValue) ? discountValue : 0,
                minAmount: coupon.minAmount != null ? parseFloat(coupon.minAmount) : null,
                minOrderAmount: minOrder,
                maxDiscount: coupon.maxDiscount != null ? parseFloat(coupon.maxDiscount) : null,
                maxDiscountAmount: coupon.maxDiscountAmount != null ? parseFloat(coupon.maxDiscountAmount) : null,
                validFrom: coupon.validFrom,
                validTo: coupon.validTo,
                description: coupon.description,
                userClaimLimit: coupon.userClaimLimit != null ? parseInt(coupon.userClaimLimit, 10) : null,
                remaining: Math.max(0, (coupon.totalCount || 0) - totalClaimed)
            });
        }

        res.json({
            code: 0,
            message: '获取成功',
            data: { coupons: claimable }
        });
    } catch (error) {
        console.error('获取可领取优惠券失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取可领取优惠券失败',
            error: error.message
        });
    }
});

// 领取优惠券（写入 MemberCoupon，并受 userClaimLimit / totalCount 限制）
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

        // 仅「用户领取」模式可被用户主动领取
        const mode = coupon.distributionMode || 'user_claim';
        if (mode !== 'user_claim') {
            return res.status(400).json({
                code: 1,
                message: '该优惠券不支持用户领取'
            });
        }

        // 检查有效期
        if (new Date(coupon.validFrom) > now || new Date(coupon.validTo) < now) {
            return res.status(400).json({
                code: 1,
                message: '优惠券已过期或未生效'
            });
        }

        // 检查发放池剩余：按该券已发放数量（MemberCoupon 条数）与 totalCount 比较
        const totalClaimed = await MemberCoupon.count({ where: { couponId: coupon.id } });
        if (totalClaimed >= (coupon.totalCount || 0)) {
            return res.status(400).json({
                code: 1,
                message: '优惠券已领完'
            });
        }

        // 每用户领取限量：该用户已领取数量
        const userClaimLimit = coupon.userClaimLimit != null ? parseInt(coupon.userClaimLimit, 10) : null;
        if (Number.isFinite(userClaimLimit) && userClaimLimit >= 0) {
            const userClaimed = await MemberCoupon.count({
                where: { memberId: member.id, couponId: coupon.id }
            });
            if (userClaimed >= userClaimLimit) {
                return res.status(400).json({
                    code: 1,
                    message: userClaimLimit <= 1 ? '您已领取过该优惠券' : `您已达到该券的领取上限（${userClaimLimit}张）`
                });
            }
        }

        // 检查会员使用次数限制（按订单使用记录）
        if (coupon.memberUsageLimit) {
            const memberOrderItems = await OrderItem.findAll({
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
            const memberUsedCount = memberOrderItems.filter(item =>
                Array.isArray(item.appliedCoupons) && item.appliedCoupons.some(c => c && c.code === coupon.code)
            ).length;
            if (memberUsedCount >= coupon.memberUsageLimit) {
                return res.status(400).json({
                    code: 1,
                    message: `您已使用过该优惠券${coupon.memberUsageLimit}次，无法再次领取`
                });
            }
        }

        // 写入领取记录，用户「我的优惠券」与「可用优惠券」均以 MemberCoupon 为准
        await MemberCoupon.create({
            memberId: member.id,
            couponId: coupon.id
        });

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

