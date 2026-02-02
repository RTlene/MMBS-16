const express = require('express');
const router = express.Router();
const { TeamExpansionLevel } = require('../db');
const { Op } = require('sequelize');

// 获取团队拓展激励等级列表（分页）
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

        const { count, rows } = await TeamExpansionLevel.findAndCountAll({
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
        console.error('获取团队拓展激励等级列表失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取团队拓展激励等级列表失败',
            error: error.message
        });
    }
});

// 获取所有团队拓展激励等级（不分页）
router.get('/all', async (req, res) => {
    try {
        const levels = await TeamExpansionLevel.findAll({
            where: { status: 'active' },
            order: [['sortOrder', 'ASC'], ['level', 'ASC']]
        });

        res.json({
            code: 0,
            message: '获取成功',
            data: { levels }
        });
    } catch (error) {
        console.error('获取所有团队拓展激励等级失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取所有团队拓展激励等级失败',
            error: error.message
        });
    }
});

// 根据ID获取团队拓展激励等级
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const level = await TeamExpansionLevel.findByPk(id);

        if (!level) {
            return res.status(404).json({
                code: 1,
                message: '团队拓展激励等级不存在'
            });
        }

        res.json({
            code: 0,
            message: '获取成功',
            data: { level }
        });
    } catch (error) {
        console.error('获取团队拓展激励等级失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取团队拓展激励等级失败',
            error: error.message
        });
    }
});

// 创建团队拓展激励等级
router.post('/', async (req, res) => {
    try {
        const {
            name,
            level,
            minTeamSize,
            maxTeamSize,
            incentiveRate,
            minIncentiveBase,  // 新增
            maxIncentiveBase,  // 新增
            privileges,
            color,
            icon,
            description,
            status,
            sortOrder
        } = req.body;

        // 在创建时添加
        const newLevel = await TeamExpansionLevel.create({
            name,
            level,
            minTeamSize,
            maxTeamSize,
            incentiveRate,
            minIncentiveBase,  // 新增
            maxIncentiveBase,  // 新增
            privileges: privileges || {},
            color: color || '#faad14',
            icon,
            description,
            status: status || 'active',
            sortOrder: sortOrder || 0
        });

        // 验证必填字段
        if (!name || !level || minTeamSize === undefined || !incentiveRate) {
            return res.status(400).json({
                code: 1,
                message: '请填写必填字段'
            });
        }

        // 检查等级是否已存在
        const existingLevel = await TeamExpansionLevel.findOne({ where: { level } });
        if (existingLevel) {
            return res.status(400).json({
                code: 1,
                message: '该等级数值已存在'
            });
        }

        res.json({
            code: 0,
            message: '创建成功',
            data: { level: newLevel }
        });
    } catch (error) {
        console.error('创建团队拓展激励等级失败:', error);
        res.status(500).json({
            code: 1,
            message: '创建团队拓展激励等级失败',
            error: error.message
        });
    }
});

// 更新团队拓展激励等级
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            level,
            minTeamSize,
            maxTeamSize,
            incentiveRate,
            privileges,
            color,
            icon,
            description,
            status,
            sortOrder
        } = req.body;

        const levelRecord = await TeamExpansionLevel.findByPk(id);
        if (!levelRecord) {
            return res.status(404).json({
                code: 1,
                message: '团队拓展激励等级不存在'
            });
        }

        // 如果更新等级数值，检查是否与其他记录冲突
        if (level && level !== levelRecord.level) {
            const existingLevel = await TeamExpansionLevel.findOne({ 
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
            minTeamSize: minTeamSize !== undefined ? minTeamSize : levelRecord.minTeamSize,
            maxTeamSize: maxTeamSize !== undefined ? maxTeamSize : levelRecord.maxTeamSize,
            incentiveRate: incentiveRate !== undefined ? incentiveRate : levelRecord.incentiveRate,
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
        console.error('更新团队拓展激励等级失败:', error);
        res.status(500).json({
            code: 1,
            message: '更新团队拓展激励等级失败',
            error: error.message
        });
    }
});

// 删除团队拓展激励等级
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const level = await TeamExpansionLevel.findByPk(id);

        if (!level) {
            return res.status(404).json({
                code: 1,
                message: '团队拓展激励等级不存在'
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
        console.error('删除团队拓展激励等级失败:', error);
        res.status(500).json({
            code: 1,
            message: '删除团队拓展激励等级失败',
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
            await TeamExpansionLevel.update(
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
        const totalLevels = await TeamExpansionLevel.count();
        const activeLevels = await TeamExpansionLevel.count({ where: { status: 'active' } });
        
        const levelStats = await TeamExpansionLevel.findAll({
            attributes: [
                'name',
                'level',
                'status',
                [TeamExpansionLevel.sequelize.fn('COUNT', TeamExpansionLevel.sequelize.col('id')), 'count']
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

// 获取团队拓展激励配置详情
router.get('/config/details', async (req, res) => {
    try {
        const levels = await TeamExpansionLevel.findAll({
            where: { status: 'active' },
            order: [['level', 'ASC']]
        });

        const configDetails = levels.map(level => ({
            id: level.id,
            name: level.name,
            level: level.level,
            minTeamSize: level.minTeamSize,
            maxTeamSize: level.maxTeamSize,
            incentiveRate: level.incentiveRate,
            // 激励计算说明
            incentiveCalculation: {
                formula: `激励佣金 = 销售额 × 激励比例`,
                description: `当团队规模达到 ${level.minTeamSize}${level.maxTeamSize ? `-${level.maxTeamSize}` : '+'} 人时，享受 ${(level.incentiveRate * 100).toFixed(2)}% 的团队拓展激励`
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
        console.error('获取团队拓展激励配置详情失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取团队拓展激励配置详情失败',
            error: error.message
        });
    }
});

module.exports = router;