const express = require('express');
const { MemberLevel } = require('../db');
const LevelUpgradeService = require('../services/levelUpgradeService');
const router = express.Router();

// 获取会员等级列表
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', status = '' } = req.query;
        const offset = (page - 1) * limit;
        
        let whereClause = {};
        if (search) {
            whereClause.name = {
                [require('sequelize').Op.like]: `%${search}%`
            };
        }
        if (status) {
            whereClause.status = status;
        }
        
        const { count, rows } = await MemberLevel.findAndCountAll({
            where: whereClause,
            order: [['sortOrder', 'ASC'], ['level', 'ASC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
        
        // 确保数据类型正确
        const levels = rows.map(level => ({
            ...level.toJSON(),
            discountRate: parseFloat(level.discountRate) || 1.0,
            pointsRate: parseFloat(level.pointsRate) || 1.0,
            minPoints: parseInt(level.minPoints) || 0,
            maxPoints: level.maxPoints ? parseInt(level.maxPoints) : null,
            level: parseInt(level.level) || 0,
            sortOrder: parseInt(level.sortOrder) || 0
        }));
        
        res.json({
            code: 0,
            message: '获取成功',
            data: {
                levels: levels,
                total: count,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page)
            }
        });
    } catch (error) {
        console.error('获取会员等级列表失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取失败: ' + error.message
        });
    }
});

// 获取所有会员等级（用于下拉选择）
router.get('/all', async (req, res) => {
    try {
        const levels = await MemberLevel.findAll({
            where: { status: 'active' },
            order: [['sortOrder', 'ASC'], ['level', 'ASC']],
            attributes: ['id', 'name', 'level', 'minPoints', 'discountRate', 'color', 'icon']
        });
        
        res.json({
            code: 0,
            message: '获取成功',
            data: levels
        });
    } catch (error) {
        console.error('获取所有会员等级失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取失败: ' + error.message
        });
    }
});

// 全量重算等级自动升级（会员等级+分销等级）
router.post('/recalc-upgrades', async (req, res) => {
    try {
        const result = await LevelUpgradeService.runForAllMembers();
        res.json({
            code: 0,
            message: '已按「启用自动升级」的等级条件重算完成',
            data: result
        });
    } catch (error) {
        console.error('重算等级自动升级失败:', error);
        res.status(500).json({
            code: 1,
            message: '重算失败: ' + error.message
        });
    }
});

// 获取单个会员等级
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const level = await MemberLevel.findByPk(id);
        
        if (!level) {
            return res.status(404).json({
                code: 1,
                message: '等级不存在'
            });
        }
        
        res.json({
            code: 0,
            message: '获取成功',
            data: level
        });
    } catch (error) {
        console.error('获取会员等级失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取失败: ' + error.message
        });
    }
});

// 创建会员等级
router.post('/', async (req, res) => {
    try {
        console.log('收到创建会员等级请求:', req.body);
        
        const {
            name,
            level,
            minPoints,
            maxPoints,
            discountRate,
            pointsRate,
            privileges,
            color,
            icon,
            description,
            status,
            sortOrder,
            enableAutoUpgrade
        } = req.body;
        
        // 验证必填字段
        if (!name || level === undefined || minPoints === undefined) {
            console.log('验证失败: 必填字段缺失', { name, level, minPoints });
            return res.status(400).json({
                code: 1,
                message: '等级名称、等级数值和最低积分不能为空'
            });
        }
        
        // 验证数据类型
        if (typeof level !== 'number' || level < 1) {
            return res.status(400).json({
                code: 1,
                message: '等级数值必须是大于0的整数'
            });
        }
        
        if (typeof minPoints !== 'number' || minPoints < 0) {
            return res.status(400).json({
                code: 1,
                message: '最低积分必须是非负整数'
            });
        }
        
        if (maxPoints && (typeof maxPoints !== 'number' || maxPoints < minPoints)) {
            return res.status(400).json({
                code: 1,
                message: '最高积分必须大于等于最低积分'
            });
        }
        
        // 检查等级数值是否重复
        const existingLevel = await MemberLevel.findOne({ where: { level } });
        if (existingLevel) {
            return res.status(400).json({
                code: 1,
                message: '等级数值已存在'
            });
        }
        
        const newLevel = await MemberLevel.create({
            name,
            level: parseInt(level),
            minPoints: parseInt(minPoints),
            maxPoints: maxPoints ? parseInt(maxPoints) : null,
            discountRate: parseFloat(discountRate) || 1.00,
            pointsRate: parseFloat(pointsRate) || 1.00,
            privileges: privileges || {},
            color: color || '#1890ff',
            icon: icon || '',
            description: description || '',
            status: status || 'active',
            sortOrder: parseInt(sortOrder) || 0,
            enableAutoUpgrade: !!enableAutoUpgrade
        });
        
        console.log('会员等级创建成功:', newLevel.toJSON());
        
        res.json({
            code: 0,
            message: '创建成功',
            data: newLevel
        });
    } catch (error) {
        console.error('创建会员等级失败:', error);
        res.status(500).json({
            code: 1,
            message: '创建失败: ' + error.message
        });
    }
});

// 更新会员等级
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            level,
            minPoints,
            maxPoints,
            discountRate,
            pointsRate,
            privileges,
            color,
            icon,
            description,
            status,
            sortOrder,
            enableAutoUpgrade
        } = req.body;
        
        const existingLevel = await MemberLevel.findByPk(id);
        if (!existingLevel) {
            return res.status(404).json({
                code: 1,
                message: '等级不存在'
            });
        }
        
        // 验证必填字段
        if (!name || level === undefined || minPoints === undefined) {
            return res.status(400).json({
                code: 1,
                message: '等级名称、等级数值和最低积分不能为空'
            });
        }
        
        // 验证数据类型
        if (typeof level !== 'number' || level < 1) {
            return res.status(400).json({
                code: 1,
                message: '等级数值必须是大于0的整数'
            });
        }
        
        if (typeof minPoints !== 'number' || minPoints < 0) {
            return res.status(400).json({
                code: 1,
                message: '最低积分必须是非负整数'
            });
        }
        
        if (maxPoints && (typeof maxPoints !== 'number' || maxPoints < minPoints)) {
            return res.status(400).json({
                code: 1,
                message: '最高积分必须大于等于最低积分'
            });
        }
        
        // 检查等级数值是否重复（排除当前等级）
        if (level !== existingLevel.level) {
            const duplicateLevel = await MemberLevel.findOne({ 
                where: { 
                    level,
                    id: { [require('sequelize').Op.ne]: id }
                } 
            });
            if (duplicateLevel) {
                return res.status(400).json({
                    code: 1,
                    message: '等级数值已存在'
                });
            }
        }
        
        await existingLevel.update({
            name,
            level: parseInt(level),
            minPoints: parseInt(minPoints),
            maxPoints: maxPoints ? parseInt(maxPoints) : null,
            discountRate: parseFloat(discountRate) || 1.00,
            pointsRate: parseFloat(pointsRate) || 1.00,
            privileges: privileges || {},
            color: color || '#1890ff',
            icon: icon || '',
            description: description || '',
            status: status || 'active',
            sortOrder: parseInt(sortOrder) || 0,
            enableAutoUpgrade: enableAutoUpgrade !== undefined ? !!enableAutoUpgrade : existingLevel.enableAutoUpgrade
        });
        
        res.json({
            code: 0,
            message: '更新成功',
            data: existingLevel
        });
    } catch (error) {
        console.error('更新会员等级失败:', error);
        res.status(500).json({
            code: 1,
            message: '更新失败: ' + error.message
        });
    }
});

// 删除会员等级
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const level = await MemberLevel.findByPk(id);
        
        if (!level) {
            return res.status(404).json({
                code: 1,
                message: '等级不存在'
            });
        }
        
        await level.destroy();
        
        res.json({
            code: 0,
            message: '删除成功'
        });
    } catch (error) {
        console.error('删除会员等级失败:', error);
        res.status(500).json({
            code: 1,
            message: '删除失败: ' + error.message
        });
    }
});

// 批量删除会员等级
router.delete('/', async (req, res) => {
    try {
        const { ids } = req.body;
        
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                code: 1,
                message: '请选择要删除的等级'
            });
        }
        
        const deletedCount = await MemberLevel.destroy({
            where: { id: { [require('sequelize').Op.in]: ids } }
        });
        
        res.json({
            code: 0,
            message: `成功删除 ${deletedCount} 个等级`
        });
    } catch (error) {
        console.error('批量删除会员等级失败:', error);
        res.status(500).json({
            code: 1,
            message: '批量删除失败: ' + error.message
        });
    }
});

// 获取统计信息
router.get('/stats/overview', async (req, res) => {
    try {
        const totalLevels = await MemberLevel.count();
        const activeLevels = await MemberLevel.count({ where: { status: 'active' } });
        const inactiveLevels = await MemberLevel.count({ where: { status: 'inactive' } });
        
        // 按等级统计
        const levelStats = await MemberLevel.findAll({
            attributes: [
                'level',
                [MemberLevel.sequelize.fn('COUNT', MemberLevel.sequelize.col('id')), 'count']
            ],
            group: ['level'],
            order: [['level', 'ASC']]
        });
        
        res.json({
            code: 0,
            message: '获取统计信息成功',
            data: {
                totalLevels,
                activeLevels,
                inactiveLevels,
                levelStats
            }
        });
    } catch (error) {
        console.error('获取统计信息失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取统计信息失败: ' + error.message
        });
    }
});

// 批量更新排序
router.put('/batch/sort', async (req, res) => {
    try {
        const { levels } = req.body;
        
        if (!levels || !Array.isArray(levels)) {
            return res.status(400).json({
                code: 1,
                message: '请提供有效的等级数据'
            });
        }
        
        const updatePromises = levels.map(level => 
            MemberLevel.update(
                { sortOrder: level.sortOrder },
                { where: { id: level.id } }
            )
        );
        
        await Promise.all(updatePromises);
        
        res.json({
            code: 0,
            message: '排序更新成功'
        });
    } catch (error) {
        console.error('批量更新排序失败:', error);
        res.status(500).json({
            code: 1,
            message: '批量更新排序失败: ' + error.message
        });
    }
});

module.exports = router;