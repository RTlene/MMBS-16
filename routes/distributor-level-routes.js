const express = require('express');
const router = express.Router();
const { DistributorLevel } = require('../db');
const { Op } = require('sequelize');

// 获取分销等级列表（分页）
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', status = '' } = req.query;
        const offset = (page - 1) * limit;

        const where = {};
        if (search) {
            where[Op.or] = [
                { name: { [Op.like]: `%${search}%` } },
                { description: { [Op.like]: `%${search}%` } }
            ];
        }
        if (status) {
            where.status = status;
        }

        const { count, rows } = await DistributorLevel.findAndCountAll({
            where,
            order: [['sortOrder', 'ASC'], ['level', 'ASC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                levels: rows,
                totalCount: count,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page)
            }
        });
    } catch (error) {
        console.error('获取分销等级列表失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取分销等级列表失败',
            error: error.message
        });
    }
});

// 获取所有分销等级（不分页）
router.get('/all', async (req, res) => {
    try {
        const levels = await DistributorLevel.findAll({
            where: { status: 'active' },
            order: [['sortOrder', 'ASC'], ['level', 'ASC']]
        });

        res.json({
            code: 0,
            message: '获取成功',
            data: { levels }
        });
    } catch (error) {
        console.error('获取所有分销等级失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取所有分销等级失败',
            error: error.message
        });
    }
});

// 根据ID获取分销等级
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const level = await DistributorLevel.findByPk(id);

        if (!level) {
            return res.status(404).json({
                code: 1,
                message: '分销等级不存在'
            });
        }

        res.json({
            code: 0,
            message: '获取成功',
            data: { level }
        });
    } catch (error) {
        console.error('获取分销等级失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取分销等级失败',
            error: error.message
        });
    }
});

// 创建分销等级
router.post('/', async (req, res) => {
    try {
        const {
            name,
            level,
            minSales,
            maxSales,
            minFans,
            maxFans,
            procurementCost,
            sharerDirectCommissionRate,
            sharerIndirectCommissionRate,
            privileges,
            color,
            icon,
            description,
            status,
            sortOrder
        } = req.body;

        // 验证必填字段
        if (!name || !level) {
            return res.status(400).json({
                code: 1,
                message: '请填写必填字段'
            });
        }

        // 检查等级是否已存在
        const existingLevel = await DistributorLevel.findOne({ where: { level } });
        if (existingLevel) {
            return res.status(400).json({
                code: 1,
                message: '该等级数值已存在'
            });
        }

        const newLevel = await DistributorLevel.create({
            name,
            level,
            minSales: minSales || 0,
            maxSales: maxSales || null,
            minFans: minFans || 0,
            maxFans: maxFans || null,
            procurementCost: procurementCost || 0.5,
            sharerDirectCommissionRate: sharerDirectCommissionRate || 0.05,
            sharerIndirectCommissionRate: sharerIndirectCommissionRate || 0.02,
            privileges: privileges || {},
            color: color || '#1890ff',
            icon: icon || '',
            description: description || '',
            status: status || 'active',
            sortOrder: sortOrder || 0
        });

        res.json({
            code: 0,
            message: '创建成功',
            data: { level: newLevel }
        });
    } catch (error) {
        console.error('创建分销等级失败:', error);
        res.status(500).json({
            code: 1,
            message: '创建分销等级失败',
            error: error.message
        });
    }
});

// 更新分销等级
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            level,
            minSales,
            maxSales,
            minFans,
            maxFans,
            procurementCost,
            directCommissionRate,
            indirectCommissionRate,
            differentialCommissionRate,
            sharerDirectCommissionRate,
            sharerIndirectCommissionRate,
            privileges,
            color,
            icon,
            description,
            status,
            sortOrder
        } = req.body;

        const levelRecord = await DistributorLevel.findByPk(id);
        if (!levelRecord) {
            return res.status(404).json({
                code: 1,
                message: '分销等级不存在'
            });
        }

        // 如果更新等级数值，检查是否与其他记录冲突
        if (level && level !== levelRecord.level) {
            const existingLevel = await DistributorLevel.findOne({ 
                where: { level, id: { [Op.ne]: id } } 
            });
            if (existingLevel) {
                return res.status(400).json({
                    code: 1,
                    message: '该等级数值已存在'
                });
            }
        }

        await levelRecord.update({
            name: name || levelRecord.name,
            level: level || levelRecord.level,
            minSales: minSales !== undefined ? minSales : levelRecord.minSales,
            maxSales: maxSales !== undefined ? maxSales : levelRecord.maxSales,
            minFans: minFans !== undefined ? minFans : levelRecord.minFans,
            maxFans: maxFans !== undefined ? maxFans : levelRecord.maxFans,
            procurementCost: procurementCost !== undefined ? procurementCost : levelRecord.procurementCost,
            directCommissionRate: directCommissionRate !== undefined ? directCommissionRate : levelRecord.directCommissionRate,
            indirectCommissionRate: indirectCommissionRate !== undefined ? indirectCommissionRate : levelRecord.indirectCommissionRate,
            differentialCommissionRate: differentialCommissionRate !== undefined ? differentialCommissionRate : levelRecord.differentialCommissionRate,
            sharerDirectCommissionRate: sharerDirectCommissionRate !== undefined ? sharerDirectCommissionRate : levelRecord.sharerDirectCommissionRate,
            sharerIndirectCommissionRate: sharerIndirectCommissionRate !== undefined ? sharerIndirectCommissionRate : levelRecord.sharerIndirectCommissionRate,
            privileges: privileges !== undefined ? privileges : levelRecord.privileges,
            color: color || levelRecord.color,
            icon: icon !== undefined ? icon : levelRecord.icon,
            description: description !== undefined ? description : levelRecord.description,
            status: status || levelRecord.status,
            sortOrder: sortOrder !== undefined ? sortOrder : levelRecord.sortOrder
        });

        res.json({
            code: 0,
            message: '更新成功',
            data: { level: levelRecord }
        });
    } catch (error) {
        console.error('更新分销等级失败:', error);
        res.status(500).json({
            code: 1,
            message: '更新分销等级失败',
            error: error.message
        });
    }
});

// 删除分销等级
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const level = await DistributorLevel.findByPk(id);

        if (!level) {
            return res.status(404).json({
                code: 1,
                message: '分销等级不存在'
            });
        }

        // 不允许删除等级1（最低等级）
        if (level.level === 1) {
            return res.status(400).json({
                code: 1,
                message: '不能删除最低等级'
            });
        }

        await level.destroy();

        res.json({
            code: 0,
            message: '删除成功'
        });
    } catch (error) {
        console.error('删除分销等级失败:', error);
        res.status(500).json({
            code: 1,
            message: '删除分销等级失败',
            error: error.message
        });
    }
});

// 批量更新排序
router.put('/batch/sort', async (req, res) => {
    try {
        const { levels } = req.body;

        if (!Array.isArray(levels)) {
            return res.status(400).json({
                code: 1,
                message: '参数格式错误'
            });
        }

        for (const item of levels) {
            await DistributorLevel.update(
                { sortOrder: item.sortOrder },
                { where: { id: item.id } }
            );
        }

        res.json({
            code: 0,
            message: '排序更新成功'
        });
    } catch (error) {
        console.error('批量更新排序失败:', error);
        res.status(500).json({
            code: 1,
            message: '批量更新排序失败',
            error: error.message
        });
    }
});

// 获取统计信息
router.get('/stats/overview', async (req, res) => {
    try {
        const totalLevels = await DistributorLevel.count();
        const activeLevels = await DistributorLevel.count({ where: { status: 'active' } });
        
        const levelStats = await DistributorLevel.findAll({
            attributes: [
                'name',
                'level',
                'status',
                [DistributorLevel.sequelize.fn('COUNT', DistributorLevel.sequelize.col('id')), 'count']
            ],
            group: ['name', 'level', 'status'],
            order: [['level', 'ASC']]
        });

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                totalLevels,
                activeLevels,
                levelStats
            }
        });
    } catch (error) {
        console.error('获取统计信息失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取统计信息失败',
            error: error.message
        });
    }
});

// 获取分销等级配置详情（包含两种模式的佣金计算说明）
router.get('/config/details', async (req, res) => {
    try {
        const levels = await DistributorLevel.findAll({
            where: { status: 'active' },
            order: [['level', 'ASC']]
        });

        const configDetails = levels.map(level => ({
            id: level.id,
            name: level.name,
            level: level.level,
            // 分销商模式配置
            distributorMode: {
                minSales: level.minSales,
                maxSales: level.maxSales,
                procurementCost: level.procurementCost,
                directCommissionRate: level.directCommissionRate,
                indirectCommissionRate: level.indirectCommissionRate,
                differentialCommissionRate: level.differentialCommissionRate,
                // 佣金计算说明
                commissionCalculation: {
                    directCommission: `实际佣金 = 客户实际支付金额 - 分销商采购成本 - 可能的分享者支付成本`,
                    differentialCommission: `级差佣金 = 下级分销商采购成本 - 上级分销商采购成本`
                }
            },
            // 分享赚钱模式配置
            sharerMode: {
                minFans: level.minFans,
                maxFans: level.maxFans,
                directCommissionRate: level.sharerDirectCommissionRate,
                indirectCommissionRate: level.sharerIndirectCommissionRate,
                // 佣金计算说明
                commissionCalculation: {
                    directCommission: `实际佣金 = 分享者直接粉丝消费金额 × 直接佣金比例`,
                    indirectCommission: `实际佣金 = 分享者间接粉丝实际消费金额 × 间接佣金比例`
                }
            },
            privileges: level.privileges,
            color: level.color,
            icon: level.icon,
            description: level.description
        }));

        res.json({
            code: 0,
            message: '获取成功',
            data: { configDetails }
        });
    } catch (error) {
        console.error('获取分销等级配置详情失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取分销等级配置详情失败',
            error: error.message
        });
    }
});

module.exports = router;