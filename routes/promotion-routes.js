const express = require('express');
const { Op } = require('sequelize');
const { Promotion } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// 获取促销活动统计
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const total = await Promotion.count();
        const active = await Promotion.count({ where: { status: 'active' } });
        const draft = await Promotion.count({ where: { status: 'draft' } });
        const ended = await Promotion.count({ where: { status: 'ended' } });

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
        console.error('获取促销活动统计失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取促销活动统计失败'
        });
    }
});

// 获取促销活动列表
router.get('/', authenticateToken, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            type = '',
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

        if (type) {
            where.type = type;
        }

        if (status) {
            where.status = status;
        }

        const { count, rows } = await Promotion.findAndCountAll({
            where,
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [[sortBy, sortOrder.toUpperCase()]]
        });

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                promotions: rows,
                total: count,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page)
            }
        });
    } catch (error) {
        console.error('获取促销活动列表失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取促销活动列表失败'
        });
    }
});

// 获取单个促销活动
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const promotion = await Promotion.findByPk(id);

        if (!promotion) {
            return res.status(404).json({
                code: 1,
                message: '促销活动不存在'
            });
        }

        res.json({
            code: 0,
            message: '获取成功',
            data: promotion
        });
    } catch (error) {
        console.error('获取促销活动失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取促销活动失败'
        });
    }
});

// 创建促销活动
router.post('/', authenticateToken, async (req, res) => {
    try {
        const promotionData = req.body;

        // 数据验证
        if (!promotionData.name || !promotionData.type || !promotionData.startTime || !promotionData.endTime) {
            return res.status(400).json({
                code: 1,
                message: '活动名称、类型、开始时间和结束时间不能为空'
            });
        }

        // 验证时间
        const startTime = new Date(promotionData.startTime);
        const endTime = new Date(promotionData.endTime);
        
        if (startTime >= endTime) {
            return res.status(400).json({
                code: 1,
                message: '结束时间必须晚于开始时间'
            });
        }

        // 验证规则配置
        if (promotionData.rules) {
            const validationResult = validatePromotionRules(promotionData.type, promotionData.rules);
            if (!validationResult.valid) {
                return res.status(400).json({
                    code: 1,
                    message: validationResult.message
                });
            }
        }

        const promotion = await Promotion.create({
            name: promotionData.name,
            type: promotionData.type,
            description: promotionData.description || '',
            startTime: startTime,
            endTime: endTime,
            status: promotionData.status || 'draft',
            rules: promotionData.rules || {}
        });

        res.json({
            code: 0,
            message: '创建成功',
            data: promotion
        });
    } catch (error) {
        console.error('创建促销活动失败:', error);
        res.status(500).json({
            code: 1,
            message: '创建促销活动失败'
        });
    }
});

// 更新促销活动
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const promotionData = req.body;

        const promotion = await Promotion.findByPk(id);
        if (!promotion) {
            return res.status(404).json({
                code: 1,
                message: '促销活动不存在'
            });
        }

        // 如果活动已结束，不允许修改
        if (promotion.status === 'ended') {
            return res.status(400).json({
                code: 1,
                message: '已结束的活动不能修改'
            });
        }

        // 验证时间
        if (promotionData.startTime && promotionData.endTime) {
            const startTime = new Date(promotionData.startTime);
            const endTime = new Date(promotionData.endTime);
            
            if (startTime >= endTime) {
                return res.status(400).json({
                    code: 1,
                    message: '结束时间必须晚于开始时间'
                });
            }
        }

        // 验证规则配置
        if (promotionData.rules) {
            const validationResult = validatePromotionRules(promotionData.type || promotion.type, promotionData.rules);
            if (!validationResult.valid) {
                return res.status(400).json({
                    code: 1,
                    message: validationResult.message
                });
            }
        }

        // 更新促销活动
        await promotion.update({
            name: promotionData.name || promotion.name,
            type: promotionData.type || promotion.type,
            description: promotionData.description !== undefined ? promotionData.description : promotion.description,
            startTime: promotionData.startTime ? new Date(promotionData.startTime) : promotion.startTime,
            endTime: promotionData.endTime ? new Date(promotionData.endTime) : promotion.endTime,
            status: promotionData.status || promotion.status,
            rules: promotionData.rules !== undefined ? promotionData.rules : promotion.rules
        });

        res.json({
            code: 0,
            message: '更新成功',
            data: promotion
        });
    } catch (error) {
        console.error('更新促销活动失败:', error);
        res.status(500).json({
            code: 1,
            message: '更新促销活动失败'
        });
    }
});

// 更新促销活动状态
router.put('/:id/status', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const promotion = await Promotion.findByPk(id);
        if (!promotion) {
            return res.status(404).json({
                code: 1,
                message: '促销活动不存在'
            });
        }

        // 验证状态转换
        const validTransitions = {
            'draft': ['active'],
            'active': ['paused', 'ended'],
            'paused': ['active', 'ended'],
            'ended': []
        };

        if (!validTransitions[promotion.status] || !validTransitions[promotion.status].includes(status)) {
            return res.status(400).json({
                code: 1,
                message: `无法从${getStatusText(promotion.status)}状态转换到${getStatusText(status)}状态`
            });
        }

        // 如果启动活动，检查时间
        if (status === 'active') {
            const now = new Date();
            if (promotion.startTime > now) {
                return res.status(400).json({
                    code: 1,
                    message: '活动尚未开始，无法启动'
                });
            }
            if (promotion.endTime <= now) {
                return res.status(400).json({
                    code: 1,
                    message: '活动已结束，无法启动'
                });
            }
        }

        await promotion.update({ status });

        res.json({
            code: 0,
            message: '状态更新成功',
            data: promotion
        });
    } catch (error) {
        console.error('更新促销活动状态失败:', error);
        res.status(500).json({
            code: 1,
            message: '更新促销活动状态失败'
        });
    }
});

// 删除促销活动
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const promotion = await Promotion.findByPk(id);
        if (!promotion) {
            return res.status(404).json({
                code: 1,
                message: '促销活动不存在'
            });
        }

        // 如果活动正在进行中，不允许删除
        if (promotion.status === 'active') {
            return res.status(400).json({
                code: 1,
                message: '正在进行的活动不能删除，请先暂停或结束活动'
            });
        }

        await promotion.destroy();

        res.json({
            code: 0,
            message: '删除成功'
        });
    } catch (error) {
        console.error('删除促销活动失败:', error);
        res.status(500).json({
            code: 1,
            message: '删除促销活动失败'
        });
    }
});

// 验证促销活动规则
function validatePromotionRules(type, rules) {
    switch (type) {
        case 'flash_sale':
            if (!rules.discountRate || rules.discountRate <= 0 || rules.discountRate > 100) {
                return { valid: false, message: '限时抢购的折扣率必须在1-100之间' };
            }
            if (!rules.limitQuantity || rules.limitQuantity <= 0) {
                return { valid: false, message: '限购数量必须大于0' };
            }
            if (!rules.productIds || !Array.isArray(rules.productIds) || rules.productIds.length === 0) {
                return { valid: false, message: '必须选择参与商品' };
            }
            break;
        case 'group_buy':
            if (!rules.groupSize || rules.groupSize < 2) {
                return { valid: false, message: '团购人数必须大于等于2' };
            }
            if (!rules.groupPrice || rules.groupPrice <= 0) {
                return { valid: false, message: '团购价格必须大于0' };
            }
            if (!rules.productIds || !Array.isArray(rules.productIds) || rules.productIds.length === 0) {
                return { valid: false, message: '必须选择参与商品' };
            }
            break;
        case 'bundle':
            if (!rules.bundleProducts || !Array.isArray(rules.bundleProducts) || rules.bundleProducts.length < 2) {
                return { valid: false, message: '捆绑销售必须选择至少2个商品' };
            }
            if (!rules.bundlePrice || rules.bundlePrice <= 0) {
                return { valid: false, message: '捆绑价格必须大于0' };
            }
            break;
        case 'free_shipping':
            if (!rules.minAmount || rules.minAmount <= 0) {
                return { valid: false, message: '最低消费金额必须大于0' };
            }
            break;

        // 在现有validatePromotionRules函数中添加case
        case 'full_reduction':
            if (!rules.fullReductionRules || !Array.isArray(rules.fullReductionRules)) {
                return { valid: false, message: '满减活动必须配置满减规则' };
            }
            const fullReductionValidation = PromotionRulesService.validateFullReductionRules(rules.fullReductionRules);
            if (!fullReductionValidation.valid) {
                return fullReductionValidation;
            }
            break;
        case 'full_gift':
            if (!rules.fullGiftRules || !Array.isArray(rules.fullGiftRules)) {
                return { valid: false, message: '满送活动必须配置满送规则' };
            }
            const fullGiftValidation = PromotionRulesService.validateFullGiftRules(rules.fullGiftRules);
            if (!fullGiftValidation.valid) {
                return fullGiftValidation;
            }
            break;
        case 'full_discount':
            if (!rules.fullDiscountRules || !Array.isArray(rules.fullDiscountRules)) {
                return { valid: false, message: '满折活动必须配置满折规则' };
            }
            const fullDiscountValidation = PromotionRulesService.validateFullDiscountRules(rules.fullDiscountRules);
            if (!fullDiscountValidation.valid) {
                return fullDiscountValidation;
            }
            break;
            }
    
    return { valid: true };
}

// 工具函数
function getStatusText(status) {
    const statusMap = {
        'draft': '草稿',
        'active': '进行中',
        'paused': '已暂停',
        'ended': '已结束'
    };
    return statusMap[status] || status;
}

module.exports = router;