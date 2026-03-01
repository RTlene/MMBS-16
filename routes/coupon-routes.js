const express = require('express');
const { Op } = require('sequelize');
const { Coupon, Member, MemberCoupon } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// 云环境常见 ECONNRESET：数据库连接被重置时自动重试
const DB_RETRY_CODES = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST'];
function isDbConnectionError(err) {
    const code = err && (err.code || (err.original && err.original.code));
    return DB_RETRY_CODES.includes(code) || (err.original && err.original.errno === -104);
}
async function withDbRetry(fn, maxAttempts = 3) {
    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (attempt < maxAttempts && err.name === 'SequelizeDatabaseError' && isDbConnectionError(err)) {
                await new Promise(r => setTimeout(r, 100 * attempt));
                continue;
            }
            throw err;
        }
    }
    throw lastErr;
}

// 获取优惠券统计（管理端）
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const total = await withDbRetry(() => Coupon.count());
        const active = await withDbRetry(() => Coupon.count({ where: { status: 'active' } }));
        const inactive = await withDbRetry(() => Coupon.count({ where: { status: 'inactive' } }));
        const expired = await withDbRetry(() => Coupon.count({ where: { status: 'expired' } }));
        res.json({
            code: 0,
            message: '获取成功',
            data: { total, active, inactive, expired }
        });
    } catch (error) {
        console.error('获取优惠券统计失败:', error);
        res.status(500).json({ code: 1, message: '获取优惠券统计失败' });
    }
});

// 获取优惠券列表（管理端）
router.get('/', authenticateToken, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search = '',
            status = '',
            type = '',
            sortBy = 'createdAt',
            sortOrder = 'DESC'
        } = req.query;

        const offset = (parseInt(page) - 1) * parseInt(limit);
        const where = {};

        if (search) {
            where[Op.or] = [
                { name: { [Op.like]: `%${search}%` } },
                { code: { [Op.like]: `%${search}%` } }
            ];
        }
        if (status) where.status = status;
        if (type) where.type = type;

        const { count, rows } = await withDbRetry(() => Coupon.findAndCountAll({
            where,
            limit: parseInt(limit),
            offset,
            order: [[sortBy, sortOrder.toUpperCase()]]
        }));

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                coupons: rows,
                total: count,
                totalPages: Math.ceil(count / parseInt(limit)),
                currentPage: parseInt(page)
            }
        });
    } catch (error) {
        console.error('获取优惠券列表失败:', error);
        res.status(500).json({ code: 1, message: '获取优惠券列表失败' });
    }
});

// 系统发放：给指定会员发放优惠券（仅 distributionMode=system 的券可发放）
router.post('/grant', authenticateToken, async (req, res) => {
    try {
        const { couponId, memberIds } = req.body || {};
        if (!couponId || !Array.isArray(memberIds) || memberIds.length === 0) {
            return res.status(400).json({ code: 1, message: '请选择优惠券和至少一名会员' });
        }
        const cid = parseInt(couponId, 10);
        const ids = [...new Set(memberIds.map(id => parseInt(id, 10)).filter(Number.isFinite))];
        if (ids.length === 0) {
            return res.status(400).json({ code: 1, message: '会员ID无效' });
        }
        const coupon = await withDbRetry(() => Coupon.findByPk(cid));
        if (!coupon) {
            return res.status(404).json({ code: 1, message: '优惠券不存在' });
        }
        if ((coupon.distributionMode || 'user_claim') !== 'system') {
            return res.status(400).json({ code: 1, message: '仅「系统发放」模式的优惠券可在此发放' });
        }
        if (coupon.status !== 'active') {
            return res.status(400).json({ code: 1, message: '优惠券已禁用或过期' });
        }
        const now = new Date();
        if (new Date(coupon.validFrom) > now || new Date(coupon.validTo) < now) {
            return res.status(400).json({ code: 1, message: '优惠券不在有效期内' });
        }
        const total = coupon.totalCount || 0;
        const used = coupon.usedCount || 0;
        const unpaidGrants = await MemberCoupon.count({
            where: { couponId: cid, usedAt: null }
        });
        const available = Math.max(0, total - used - unpaidGrants);
        if (available < ids.length) {
            return res.status(400).json({ code: 1, message: `优惠券剩余可发放数量不足，当前剩余 ${available} 张` });
        }
        const members = await Member.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id'] });
        const validMemberIds = members.map(m => m.id);
        const toCreate = validMemberIds.map(memberId => ({ memberId, couponId: cid }));
        await withDbRetry(() => MemberCoupon.bulkCreate(toCreate));
        res.json({
            code: 0,
            message: '发放成功',
            data: { granted: validMemberIds.length, memberIds: validMemberIds }
        });
    } catch (error) {
        console.error('发放优惠券失败:', error);
        res.status(500).json({ code: 1, message: error.message || '发放优惠券失败' });
    }
});

// 批量删除优惠券
router.post('/batch-delete', authenticateToken, async (req, res) => {
    try {
        const { ids } = req.body || {};
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ code: 1, message: '请选择要删除的优惠券' });
        }
        const idList = ids.map(id => parseInt(id, 10)).filter(Number.isFinite);
        const deleted = await withDbRetry(() => Coupon.destroy({ where: { id: idList } }));
        res.json({ code: 0, message: '删除成功', data: { deleted } });
    } catch (error) {
        console.error('批量删除优惠券失败:', error);
        res.status(500).json({ code: 1, message: '批量删除失败' });
    }
});
// 批量更新状态
router.post('/batch-status', authenticateToken, async (req, res) => {
    try {
        const { ids, status } = req.body || {};
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ code: 1, message: '请选择优惠券' });
        }
        if (!['active', 'inactive', 'expired'].includes(status)) {
            return res.status(400).json({ code: 1, message: '状态无效' });
        }
        const idList = ids.map(id => parseInt(id, 10)).filter(Number.isFinite);
        const [affected] = await withDbRetry(() => Coupon.update({ status }, { where: { id: idList } }));
        res.json({ code: 0, message: '更新成功', data: { affected } });
    } catch (error) {
        console.error('批量更新优惠券状态失败:', error);
        res.status(500).json({ code: 1, message: '批量更新失败' });
    }
});

// 获取单个优惠券（管理端）
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const coupon = await withDbRetry(() => Coupon.findByPk(req.params.id));
        if (!coupon) {
            return res.status(404).json({ code: 1, message: '优惠券不存在' });
        }
        res.json({ code: 0, message: '获取成功', data: coupon });
    } catch (error) {
        console.error('获取优惠券失败:', error);
        res.status(500).json({ code: 1, message: '获取优惠券失败' });
    }
});

// 创建优惠券（管理端）
router.post('/', authenticateToken, async (req, res) => {
    try {
        const body = req.body;
        const userId = req.user.id;

        if (!body.name || !body.code || !body.type || !body.discountType || body.discountValue == null || body.totalCount == null || !body.validFrom || !body.validTo) {
            return res.status(400).json({
                code: 1,
                message: '名称、代码、类型、折扣类型、折扣值、发放总数、有效期起止不能为空'
            });
        }

        const existing = await withDbRetry(() => Coupon.findOne({ where: { code: body.code.trim() } }));
        if (existing) {
            return res.status(400).json({ code: 1, message: '优惠券代码已存在' });
        }

        const validFrom = new Date(body.validFrom);
        const validTo = new Date(body.validTo);
        if (validFrom >= validTo) {
            return res.status(400).json({ code: 1, message: '有效期结束时间必须晚于开始时间' });
        }

        const distributionMode = ['auto', 'system', 'user_claim'].includes(body.distributionMode) ? body.distributionMode : 'user_claim';
        const coupon = await withDbRetry(() => Coupon.create({
            name: body.name,
            code: String(body.code).trim(),
            type: body.type,
            discountType: body.discountType,
            value: parseFloat(body.value) || 0,
            discountValue: parseFloat(body.discountValue),
            minAmount: body.minAmount != null ? parseFloat(body.minAmount) : null,
            minOrderAmount: body.minOrderAmount != null ? parseFloat(body.minOrderAmount) : null,
            maxDiscount: body.maxDiscount != null ? parseFloat(body.maxDiscount) : null,
            maxDiscountAmount: body.maxDiscountAmount != null ? parseFloat(body.maxDiscountAmount) : null,
            totalCount: parseInt(body.totalCount) || 0,
            usedCount: 0,
            usageLimit: body.usageLimit != null ? parseInt(body.usageLimit) : null,
            memberUsageLimit: body.memberUsageLimit != null ? parseInt(body.memberUsageLimit) : null,
            userClaimLimit: body.userClaimLimit != null ? parseInt(body.userClaimLimit) : null,
            productIds: body.productIds || null,
            skuIds: body.skuIds || null,
            validFrom,
            validTo,
            status: body.status || 'active',
            distributionMode,
            description: body.description || null,
            fullReductionRules: body.fullReductionRules || null,
            fullGiftRules: body.fullGiftRules || null,
            fullDiscountRules: body.fullDiscountRules || null,
            createdBy: userId,
            updatedBy: userId
        }));

        res.json({ code: 0, message: '创建成功', data: coupon });
    } catch (error) {
        console.error('创建优惠券失败:', error);
        res.status(500).json({ code: 1, message: '创建优惠券失败' });
    }
});

// 更新优惠券（管理端）
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const coupon = await withDbRetry(() => Coupon.findByPk(req.params.id));
        if (!coupon) {
            return res.status(404).json({ code: 1, message: '优惠券不存在' });
        }

        const body = req.body;
        const userId = req.user.id;

        if (body.code && body.code !== coupon.code) {
            const existing = await withDbRetry(() => Coupon.findOne({ where: { code: String(body.code).trim() } }));
            if (existing) {
                return res.status(400).json({ code: 1, message: '优惠券代码已存在' });
            }
            coupon.code = String(body.code).trim();
        }
        if (body.name != null) coupon.name = body.name;
        if (body.type != null) coupon.type = body.type;
        if (body.discountType != null) coupon.discountType = body.discountType;
        if (body.value != null) coupon.value = parseFloat(body.value);
        if (body.discountValue != null) coupon.discountValue = parseFloat(body.discountValue);
        if (body.minAmount !== undefined) coupon.minAmount = body.minAmount == null ? null : parseFloat(body.minAmount);
        if (body.minOrderAmount !== undefined) coupon.minOrderAmount = body.minOrderAmount == null ? null : parseFloat(body.minOrderAmount);
        if (body.maxDiscount !== undefined) coupon.maxDiscount = body.maxDiscount == null ? null : parseFloat(body.maxDiscount);
        if (body.maxDiscountAmount !== undefined) coupon.maxDiscountAmount = body.maxDiscountAmount == null ? null : parseFloat(body.maxDiscountAmount);
        if (body.totalCount != null) coupon.totalCount = parseInt(body.totalCount);
        if (body.usageLimit !== undefined) coupon.usageLimit = body.usageLimit == null ? null : parseInt(body.usageLimit);
        if (body.memberUsageLimit !== undefined) coupon.memberUsageLimit = body.memberUsageLimit == null ? null : parseInt(body.memberUsageLimit);
        if (body.userClaimLimit !== undefined) coupon.userClaimLimit = body.userClaimLimit == null ? null : parseInt(body.userClaimLimit);
        if (body.productIds !== undefined) coupon.productIds = body.productIds;
        if (body.skuIds !== undefined) coupon.skuIds = body.skuIds;
        if (body.validFrom != null) coupon.validFrom = new Date(body.validFrom);
        if (body.validTo != null) coupon.validTo = new Date(body.validTo);
        if (body.status != null) coupon.status = body.status;
        if (body.description !== undefined) coupon.description = body.description;
        if (body.fullReductionRules !== undefined) coupon.fullReductionRules = body.fullReductionRules;
        if (body.fullGiftRules !== undefined) coupon.fullGiftRules = body.fullGiftRules;
        if (body.fullDiscountRules !== undefined) coupon.fullDiscountRules = body.fullDiscountRules;
        if (body.distributionMode !== undefined && ['auto', 'system', 'user_claim'].includes(body.distributionMode)) {
            coupon.distributionMode = body.distributionMode;
        }
        coupon.updatedBy = userId;

        await withDbRetry(() => coupon.save());
        res.json({ code: 0, message: '更新成功', data: coupon });
    } catch (error) {
        console.error('更新优惠券失败:', error);
        res.status(500).json({ code: 1, message: '更新优惠券失败' });
    }
});

// 删除优惠券（管理端）
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const coupon = await withDbRetry(() => Coupon.findByPk(req.params.id));
        if (!coupon) {
            return res.status(404).json({ code: 1, message: '优惠券不存在' });
        }
        await withDbRetry(() => coupon.destroy());
        res.json({ code: 0, message: '删除成功' });
    } catch (error) {
        console.error('删除优惠券失败:', error);
        res.status(500).json({ code: 1, message: '删除优惠券失败' });
    }
});

module.exports = router;
