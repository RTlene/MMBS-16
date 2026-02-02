const express = require('express');
const { Op } = require('sequelize');
const { PointSettings, PointSourceConfig, PointMultiplierConfig, User } = require('../db');

const router = express.Router();

// 获取积分来源配置列表
router.get('/source-configs', async (req, res) => {
    try {
        const configs = await PointSourceConfig.findAll({
            include: [
                { model: User, as: 'creator', attributes: ['id', 'username'] },
                { model: User, as: 'updater', attributes: ['id', 'username'] }
            ],
            order: [['createdAt', 'DESC']]
        });

        res.json({
            code: 0,
            message: '获取成功',
            data: configs
        });
    } catch (error) {
        console.error('获取积分来源配置失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取积分来源配置失败',
            error: error.message
        });
    }
});

// 创建积分来源配置
router.post('/source-configs', async (req, res) => {
    try {
        const {
            source,
            sourceName,
            basePoints,
            multiplier,
            maxDailyPoints,
            maxTotalPoints,
            description,
            isEnabled = true
        } = req.body;

        // 验证必填字段
        if (!source || !sourceName || basePoints === undefined || multiplier === undefined) {
            return res.status(400).json({
                code: 1,
                message: '缺少必填字段'
            });
        }

        // 检查来源是否已存在
        const existingConfig = await PointSourceConfig.findOne({
            where: { source }
        });

        if (existingConfig) {
            return res.status(400).json({
                code: 1,
                message: '该积分来源已存在'
            });
        }

        const config = await PointSourceConfig.create({
            source,
            sourceName,
            basePoints,
            multiplier,
            maxDailyPoints,
            maxTotalPoints,
            description,
            isEnabled,
            createdBy: 1, // 这里应该从认证中间件获取
            updatedBy: 1
        });

        res.json({
            code: 0,
            message: '创建成功',
            data: config
        });
    } catch (error) {
        console.error('创建积分来源配置失败:', error);
        res.status(500).json({
            code: 1,
            message: '创建积分来源配置失败',
            error: error.message
        });
    }
});

// 更新积分来源配置
router.put('/source-configs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const config = await PointSourceConfig.findByPk(id);
        if (!config) {
            return res.status(404).json({
                code: 1,
                message: '配置不存在'
            });
        }

        // 检查来源是否被其他配置使用
        if (updateData.source && updateData.source !== config.source) {
            const existingConfig = await PointSourceConfig.findOne({
                where: {
                    source: updateData.source,
                    id: { [Op.ne]: id }
                }
            });

            if (existingConfig) {
                return res.status(400).json({
                    code: 1,
                    message: '该积分来源已被其他配置使用'
                });
            }
        }

        updateData.updatedBy = 1; // 这里应该从认证中间件获取

        await config.update(updateData);

        res.json({
            code: 0,
            message: '更新成功',
            data: config
        });
    } catch (error) {
        console.error('更新积分来源配置失败:', error);
        res.status(500).json({
            code: 1,
            message: '更新积分来源配置失败',
            error: error.message
        });
    }
});

// 删除积分来源配置
router.delete('/source-configs/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const config = await PointSourceConfig.findByPk(id);
        if (!config) {
            return res.status(404).json({
                code: 1,
                message: '配置不存在'
            });
        }

        await config.destroy();

        res.json({
            code: 0,
            message: '删除成功'
        });
    } catch (error) {
        console.error('删除积分来源配置失败:', error);
        res.status(500).json({
            code: 1,
            message: '删除积分来源配置失败',
            error: error.message
        });
    }
});

// 获取倍率配置列表
router.get('/multiplier-configs', async (req, res) => {
    try {
        const configs = await PointMultiplierConfig.findAll({
            include: [
                { model: User, as: 'creator', attributes: ['id', 'username'] },
                { model: User, as: 'updater', attributes: ['id', 'username'] }
            ],
            order: [['priority', 'DESC'], ['createdAt', 'DESC']]
        });

        res.json({
            code: 0,
            message: '获取成功',
            data: configs
        });
    } catch (error) {
        console.error('获取倍率配置失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取倍率配置失败',
            error: error.message
        });
    }
});

// 创建倍率配置
router.post('/multiplier-configs', async (req, res) => {
    try {
        const {
            name,
            multiplier,
            conditions,
            isActive = true,
            priority = 0,
            validFrom,
            validTo,
            description
        } = req.body;

        // 验证必填字段
        if (!name || multiplier === undefined) {
            return res.status(400).json({
                code: 1,
                message: '缺少必填字段'
            });
        }

        const config = await PointMultiplierConfig.create({
            name,
            multiplier,
            conditions,
            isActive,
            priority,
            validFrom: validFrom ? new Date(validFrom) : null,
            validTo: validTo ? new Date(validTo) : null,
            description,
            createdBy: 1, // 这里应该从认证中间件获取
            updatedBy: 1
        });

        res.json({
            code: 0,
            message: '创建成功',
            data: config
        });
    } catch (error) {
        console.error('创建倍率配置失败:', error);
        res.status(500).json({
            code: 1,
            message: '创建倍率配置失败',
            error: error.message
        });
    }
});

// 更新倍率配置
router.put('/multiplier-configs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const config = await PointMultiplierConfig.findByPk(id);
        if (!config) {
            return res.status(404).json({
                code: 1,
                message: '配置不存在'
            });
        }

        // 处理日期字段
        if (updateData.validFrom) {
            updateData.validFrom = new Date(updateData.validFrom);
        }
        if (updateData.validTo) {
            updateData.validTo = new Date(updateData.validTo);
        }

        updateData.updatedBy = 1; // 这里应该从认证中间件获取

        await config.update(updateData);

        res.json({
            code: 0,
            message: '更新成功',
            data: config
        });
    } catch (error) {
        console.error('更新倍率配置失败:', error);
        res.status(500).json({
            code: 1,
            message: '更新倍率配置失败',
            error: error.message
        });
    }
});

// 删除倍率配置
router.delete('/multiplier-configs/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const config = await PointMultiplierConfig.findByPk(id);
        if (!config) {
            return res.status(404).json({
                code: 1,
                message: '配置不存在'
            });
        }

        await config.destroy();

        res.json({
            code: 0,
            message: '删除成功'
        });
    } catch (error) {
        console.error('删除倍率配置失败:', error);
        res.status(500).json({
            code: 1,
            message: '删除倍率配置失败',
            error: error.message
        });
    }
});

// 获取规则配置列表
router.get('/rule-configs', async (req, res) => {
    try {
        const configs = await PointSettings.findAll({
            where: { type: 'rule' },
            include: [
                { model: User, as: 'creator', attributes: ['id', 'username'] },
                { model: User, as: 'updater', attributes: ['id', 'username'] }
            ],
            order: [['priority', 'DESC'], ['createdAt', 'DESC']]
        });

        res.json({
            code: 0,
            message: '获取成功',
            data: configs
        });
    } catch (error) {
        console.error('获取规则配置失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取规则配置失败',
            error: error.message
        });
    }
});

// 创建规则配置
router.post('/rule-configs', async (req, res) => {
    try {
        const {
            name,
            type = 'rule',
            source,
            basePoints,
            multiplier,
            maxPoints,
            minOrderAmount,
            maxOrderAmount,
            conditions,
            isActive = true,
            priority = 0,
            validFrom,
            validTo,
            description
        } = req.body;

        // 验证必填字段
        if (!name || !source || basePoints === undefined || multiplier === undefined) {
            return res.status(400).json({
                code: 1,
                message: '缺少必填字段'
            });
        }

        const config = await PointSettings.create({
            name,
            type,
            source,
            basePoints,
            multiplier,
            maxPoints,
            minOrderAmount,
            maxOrderAmount,
            conditions,
            isActive,
            priority,
            validFrom: validFrom ? new Date(validFrom) : null,
            validTo: validTo ? new Date(validTo) : null,
            description,
            createdBy: 1, // 这里应该从认证中间件获取
            updatedBy: 1
        });

        res.json({
            code: 0,
            message: '创建成功',
            data: config
        });
    } catch (error) {
        console.error('创建规则配置失败:', error);
        res.status(500).json({
            code: 1,
            message: '创建规则配置失败',
            error: error.message
        });
    }
});

// 更新规则配置
router.put('/rule-configs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const config = await PointSettings.findByPk(id);
        if (!config) {
            return res.status(404).json({
                code: 1,
                message: '配置不存在'
            });
        }

        // 处理日期字段
        if (updateData.validFrom) {
            updateData.validFrom = new Date(updateData.validFrom);
        }
        if (updateData.validTo) {
            updateData.validTo = new Date(updateData.validTo);
        }

        updateData.updatedBy = 1; // 这里应该从认证中间件获取

        await config.update(updateData);

        res.json({
            code: 0,
            message: '更新成功',
            data: config
        });
    } catch (error) {
        console.error('更新规则配置失败:', error);
        res.status(500).json({
            code: 1,
            message: '更新规则配置失败',
            error: error.message
        });
    }
});

// 删除规则配置
router.delete('/rule-configs/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const config = await PointSettings.findByPk(id);
        if (!config) {
            return res.status(404).json({
                code: 1,
                message: '配置不存在'
            });
        }

        await config.destroy();

        res.json({
            code: 0,
            message: '删除成功'
        });
    } catch (error) {
        console.error('删除规则配置失败:', error);
        res.status(500).json({
            code: 1,
            message: '删除规则配置失败',
            error: error.message
        });
    }
});

// 获取统计信息
router.get('/stats', async (req, res) => {
    try {
        const [sourceCount, multiplierCount, ruleCount, activeCount] = await Promise.all([
            PointSourceConfig.count(),
            PointMultiplierConfig.count(),
            PointSettings.count({ where: { type: 'rule' } }),
            PointSettings.count({ where: { isActive: true } }) + 
            PointSourceConfig.count({ where: { isEnabled: true } }) +
            PointMultiplierConfig.count({ where: { isActive: true } })
        ]);

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                sourceCount,
                multiplierCount,
                ruleCount,
                activeCount
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

module.exports = router;