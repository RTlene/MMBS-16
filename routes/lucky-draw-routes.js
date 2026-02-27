const express = require('express');
const { Op } = require('sequelize');
const { LuckyDraw } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// 获取抽奖活动统计
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const total = await LuckyDraw.count();
        const active = await LuckyDraw.count({ where: { status: 'active' } });
        const draft = await LuckyDraw.count({ where: { status: 'draft' } });
        const ended = await LuckyDraw.count({ where: { status: 'ended' } });

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                total,
                active,
                draft,
                ended
            }
        });
    } catch (error) {
        console.error('获取抽奖活动统计失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取抽奖活动统计失败'
        });
    }
});

// 获取抽奖活动列表
router.get('/', authenticateToken, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            status = '',
            sortBy = 'createdAt',
            sortOrder = 'DESC'
        } = req.query;

        const offset = (page - 1) * limit;
        const where = {};

        // 搜索条件
        if (search) {
            where[Op.or] = [
                { name: { [Op.like]: `%${search}%` } },
                { description: { [Op.like]: `%${search}%` } }
            ];
        }

        if (status) {
            where.status = status;
        }

        const { count, rows } = await LuckyDraw.findAndCountAll({
            where,
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [[sortBy, sortOrder.toUpperCase()]]
        });

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                draws: rows,
                total: count,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page)
            }
        });
    } catch (error) {
        console.error('获取抽奖活动列表失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取抽奖活动列表失败'
        });
    }
});

// 获取单个抽奖活动
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const draw = await LuckyDraw.findByPk(id);

        if (!draw) {
            return res.status(404).json({
                code: 1,
                message: '抽奖活动不存在'
            });
        }

        res.json({
            code: 0,
            message: '获取成功',
            data: draw
        });
    } catch (error) {
        console.error('获取抽奖活动失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取抽奖活动失败'
        });
    }
});

// 创建抽奖活动
router.post('/', authenticateToken, async (req, res) => {
    try {
        const drawData = req.body;

        // 数据验证
        if (!drawData.name || !drawData.startTime || !drawData.endTime) {
            return res.status(400).json({
                code: 1,
                message: '活动名称、开始时间和结束时间不能为空'
            });
        }

        // 验证时间
        const startTime = new Date(drawData.startTime);
        const endTime = new Date(drawData.endTime);
        
        if (startTime >= endTime) {
            return res.status(400).json({
                code: 1,
                message: '结束时间必须晚于开始时间'
            });
        }

        // 验证奖品配置
        if (!drawData.prizes || Object.keys(drawData.prizes).length === 0) {
            return res.status(400).json({
                code: 1,
                message: '至少需要配置一个奖品'
            });
        }

        const validationResult = validatePrizesConfig(drawData.prizes);
        if (!validationResult.valid) {
            return res.status(400).json({
                code: 1,
                message: validationResult.message
            });
        }

        const draw = await LuckyDraw.create({
            name: drawData.name,
            description: drawData.description || '',
            startTime: startTime,
            endTime: endTime,
            status: 'draft',
            prizes: drawData.prizes,
            rules: drawData.rules || {}
        });

        res.json({
            code: 0,
            message: '创建成功',
            data: draw
        });
    } catch (error) {
        console.error('创建抽奖活动失败:', error);
        res.status(500).json({
            code: 1,
            message: '创建抽奖活动失败'
        });
    }
});

// 更新抽奖活动
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const drawData = req.body;

        const draw = await LuckyDraw.findByPk(id);
        if (!draw) {
            return res.status(404).json({
                code: 1,
                message: '抽奖活动不存在'
            });
        }

        // 如果活动已结束，不允许修改
        if (draw.status === 'ended') {
            return res.status(400).json({
                code: 1,
                message: '已结束的活动不能修改'
            });
        }

        // 验证时间
        if (drawData.startTime && drawData.endTime) {
            const startTime = new Date(drawData.startTime);
            const endTime = new Date(drawData.endTime);
            
            if (startTime >= endTime) {
                return res.status(400).json({
                    code: 1,
                    message: '结束时间必须晚于开始时间'
                });
            }
        }

        // 验证奖品配置
        if (drawData.prizes) {
            const validationResult = validatePrizesConfig(drawData.prizes);
            if (!validationResult.valid) {
                return res.status(400).json({
                    code: 1,
                    message: validationResult.message
                });
            }
        }

        // 更新抽奖活动
        await draw.update({
            name: drawData.name || draw.name,
            description: drawData.description !== undefined ? drawData.description : draw.description,
            startTime: drawData.startTime ? new Date(drawData.startTime) : draw.startTime,
            endTime: drawData.endTime ? new Date(drawData.endTime) : draw.endTime,
            prizes: drawData.prizes !== undefined ? drawData.prizes : draw.prizes,
            rules: drawData.rules !== undefined ? drawData.rules : draw.rules
        });

        res.json({
            code: 0,
            message: '更新成功',
            data: draw
        });
    } catch (error) {
        console.error('更新抽奖活动失败:', error);
        res.status(500).json({
            code: 1,
            message: '更新抽奖活动失败'
        });
    }
});

// 更新抽奖活动状态
router.put('/:id/status', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const draw = await LuckyDraw.findByPk(id);
        if (!draw) {
            return res.status(404).json({
                code: 1,
                message: '抽奖活动不存在'
            });
        }

        // 验证状态转换
        const validTransitions = {
            'draft': ['active'],
            'active': ['ended'],
            'ended': []
        };

        if (!validTransitions[draw.status] || !validTransitions[draw.status].includes(status)) {
            return res.status(400).json({
                code: 1,
                message: `无法从${getStatusText(draw.status)}状态转换到${getStatusText(status)}状态`
            });
        }

        // 如果启动活动，检查时间
        if (status === 'active') {
            const now = new Date();
            if (draw.startTime > now) {
                return res.status(400).json({
                    code: 1,
                    message: '活动尚未开始，无法启动'
                });
            }
            if (draw.endTime <= now) {
                return res.status(400).json({
                    code: 1,
                    message: '活动已结束，无法启动'
                });
            }
        }

        await draw.update({ status });

        res.json({
            code: 0,
            message: '状态更新成功',
            data: draw
        });
    } catch (error) {
        console.error('更新抽奖活动状态失败:', error);
        res.status(500).json({
            code: 1,
            message: '更新抽奖活动状态失败'
        });
    }
});

// 删除抽奖活动
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const draw = await LuckyDraw.findByPk(id);
        if (!draw) {
            return res.status(404).json({
                code: 1,
                message: '抽奖活动不存在'
            });
        }

        // 如果活动正在进行中，不允许删除
        if (draw.status === 'active') {
            return res.status(400).json({
                code: 1,
                message: '正在进行的活动不能删除，请先结束活动'
            });
        }

        await draw.destroy();

        res.json({
            code: 0,
            message: '删除成功'
        });
    } catch (error) {
        console.error('删除抽奖活动失败:', error);
        res.status(500).json({
            code: 1,
            message: '删除抽奖活动失败'
        });
    }
});

// 奖品类型枚举
const PRIZE_TYPES = ['product', 'coupon', 'points', 'commission', 'custom'];

// 验证奖品配置（支持 type: product|coupon|points|commission|custom 及对应关联字段）
function validatePrizesConfig(prizes) {
    const prizeList = Object.values(prizes);
    if (prizeList.length === 0) {
        return { valid: false, message: '至少需要配置一个奖品' };
    }

    let totalProbability = 0;
    for (const prize of prizeList) {
        const type = (prize.type || 'custom').toLowerCase();
        if (!PRIZE_TYPES.includes(type)) {
            return { valid: false, message: '奖品类型只能是：商品、优惠券、积分、佣金奖励、自定义' };
        }
        if (!prize.name || String(prize.name).trim() === '') {
            return { valid: false, message: '奖品名称不能为空' };
        }
        const prob = parseFloat(prize.probability);
        if (isNaN(prob) || prob <= 0 || prob > 100) {
            return { valid: false, message: '奖品中奖概率必须在1-100之间' };
        }
        const qty = parseInt(prize.quantity, 10);
        if (isNaN(qty) || qty <= 0) {
            return { valid: false, message: '奖品数量必须大于0' };
        }
        if (type === 'product' && (!prize.productId || parseInt(prize.productId, 10) <= 0)) {
            return { valid: false, message: '商品类型奖品请选择商品' };
        }
        if (type === 'coupon' && (!prize.couponId || parseInt(prize.couponId, 10) <= 0)) {
            return { valid: false, message: '优惠券类型奖品请选择优惠券' };
        }
        if (type === 'points' && (prize.points == null || isNaN(Number(prize.points)) || Number(prize.points) < 0)) {
            return { valid: false, message: '积分类型奖品请填写积分数量' };
        }
        if (type === 'commission' && (prize.commissionAmount == null || isNaN(Number(prize.commissionAmount)) || Number(prize.commissionAmount) < 0)) {
            return { valid: false, message: '佣金奖励类型奖品请填写佣金金额' };
        }
        // 自定义类型：可选 customPrizeId（无则仅用名称，兼容旧数据）
        if (type === 'custom' && prize.customPrizeId != null && prize.customPrizeId !== '' && parseInt(prize.customPrizeId, 10) <= 0) {
            return { valid: false, message: '自定义奖品ID无效' };
        }
        totalProbability += prob;
    }
    if (Math.abs(totalProbability - 100) > 0.01) {
        return { valid: false, message: '所有奖品的中奖概率总和必须等于100%' };
    }
    return { valid: true };
}

// 工具函数
function getStatusText(status) {
    const statusMap = {
        'draft': '草稿',
        'active': '进行中',
        'ended': '已结束'
    };
    return statusMap[status] || status;
}

module.exports = router;