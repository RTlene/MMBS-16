const express = require('express');
const { Op } = require('sequelize');
const { SmsTemplate } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// 获取短信模板统计
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const total = await SmsTemplate.count();
        const active = await SmsTemplate.count({ where: { status: 'active' } });
        
        // 这里应该从短信发送记录表中统计，暂时使用模拟数据
        const totalSent = 0; // 实际项目中应该查询发送记录表
        const todaySent = 0; // 实际项目中应该查询今日发送记录

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                total,
                active,
                totalSent,
                todaySent
            }
        });
    } catch (error) {
        console.error('获取短信模板统计失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取短信模板统计失败'
        });
    }
});

// 获取短信模板列表
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
                { content: { [Op.like]: `%${search}%` } }
            ];
        }

        if (type) {
            where.type = type;
        }

        if (status) {
            where.status = status;
        }

        const { count, rows } = await SmsTemplate.findAndCountAll({
            where,
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [[sortBy, sortOrder.toUpperCase()]]
        });

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                templates: rows,
                total: count,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page)
            }
        });
    } catch (error) {
        console.error('获取短信模板列表失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取短信模板列表失败'
        });
    }
});

// 获取单个短信模板
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const template = await SmsTemplate.findByPk(id);

        if (!template) {
            return res.status(404).json({
                code: 1,
                message: '短信模板不存在'
            });
        }

        res.json({
            code: 0,
            message: '获取成功',
            data: template
        });
    } catch (error) {
        console.error('获取短信模板失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取短信模板失败'
        });
    }
});

// 创建短信模板
router.post('/', authenticateToken, async (req, res) => {
    try {
        const templateData = req.body;

        // 数据验证
        if (!templateData.name || !templateData.content || !templateData.type) {
            return res.status(400).json({
                code: 1,
                message: '模板名称、内容和类型不能为空'
            });
        }

        // 验证模板类型
        if (!['verification', 'notification', 'marketing'].includes(templateData.type)) {
            return res.status(400).json({
                code: 1,
                message: '模板类型必须是verification、notification或marketing之一'
            });
        }

        // 验证内容长度
        if (templateData.content.length > 500) {
            return res.status(400).json({
                code: 1,
                message: '短信内容不能超过500字符'
            });
        }

        const template = await SmsTemplate.create({
            name: templateData.name,
            content: templateData.content,
            type: templateData.type,
            status: templateData.status || 'active'
        });

        res.json({
            code: 0,
            message: '创建成功',
            data: template
        });
    } catch (error) {
        console.error('创建短信模板失败:', error);
        res.status(500).json({
            code: 1,
            message: '创建短信模板失败'
        });
    }
});

// 更新短信模板
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const templateData = req.body;

        const template = await SmsTemplate.findByPk(id);
        if (!template) {
            return res.status(404).json({
                code: 1,
                message: '短信模板不存在'
            });
        }

        // 验证内容长度
        if (templateData.content && templateData.content.length > 500) {
            return res.status(400).json({
                code: 1,
                message: '短信内容不能超过500字符'
            });
        }

        // 更新模板
        await template.update({
            name: templateData.name || template.name,
            content: templateData.content || template.content,
            type: templateData.type || template.type,
            status: templateData.status !== undefined ? templateData.status : template.status
        });

        res.json({
            code: 0,
            message: '更新成功',
            data: template
        });
    } catch (error) {
        console.error('更新短信模板失败:', error);
        res.status(500).json({
            code: 1,
            message: '更新短信模板失败'
        });
    }
});

// 删除短信模板
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const template = await SmsTemplate.findByPk(id);
        if (!template) {
            return res.status(404).json({
                code: 1,
                message: '短信模板不存在'
            });
        }

        await template.destroy();

        res.json({
            code: 0,
            message: '删除成功'
        });
    } catch (error) {
        console.error('删除短信模板失败:', error);
        res.status(500).json({
            code: 1,
            message: '删除短信模板失败'
        });
    }
});

// 测试短信模板
router.post('/test', authenticateToken, async (req, res) => {
    try {
        const { templateId, phoneNumber } = req.body;

        if (!templateId || !phoneNumber) {
            return res.status(400).json({
                code: 1,
                message: '模板ID和手机号不能为空'
            });
        }

        // 验证手机号格式
        if (!/^1[3-9]\d{9}$/.test(phoneNumber)) {
            return res.status(400).json({
                code: 1,
                message: '手机号格式不正确'
            });
        }

        const template = await SmsTemplate.findByPk(templateId);
        if (!template) {
            return res.status(404).json({
                code: 1,
                message: '短信模板不存在'
            });
        }

        if (template.status !== 'active') {
            return res.status(400).json({
                code: 1,
                message: '模板已禁用，无法发送'
            });
        }

        // 这里应该调用实际的短信服务API
        // 目前只是模拟发送成功
        console.log(`发送测试短信到 ${phoneNumber}: ${template.content}`);
        
        // 模拟发送延迟
        await new Promise(resolve => setTimeout(resolve, 1000));

        res.json({
            code: 0,
            message: '测试短信发送成功',
            data: {
                phoneNumber: phoneNumber,
                content: template.content,
                sentAt: new Date()
            }
        });
    } catch (error) {
        console.error('测试短信发送失败:', error);
        res.status(500).json({
            code: 1,
            message: '测试短信发送失败'
        });
    }
});

// 批量发送短信
router.post('/send', authenticateToken, async (req, res) => {
    try {
        const { templateId, phoneNumbers, variables = {} } = req.body;

        if (!templateId || !phoneNumbers || !Array.isArray(phoneNumbers)) {
            return res.status(400).json({
                code: 1,
                message: '模板ID和手机号列表不能为空'
            });
        }

        if (phoneNumbers.length === 0) {
            return res.status(400).json({
                code: 1,
                message: '手机号列表不能为空'
            });
        }

        // 验证手机号格式
        const invalidPhones = phoneNumbers.filter(phone => !/^1[3-9]\d{9}$/.test(phone));
        if (invalidPhones.length > 0) {
            return res.status(400).json({
                code: 1,
                message: `以下手机号格式不正确：${invalidPhones.join(', ')}`
            });
        }

        const template = await SmsTemplate.findByPk(templateId);
        if (!template) {
            return res.status(404).json({
                code: 1,
                message: '短信模板不存在'
            });
        }

        if (template.status !== 'active') {
            return res.status(400).json({
                code: 1,
                message: '模板已禁用，无法发送'
            });
        }

        // 处理变量替换
        let content = template.content;
        Object.keys(variables).forEach(key => {
            content = content.replace(new RegExp(`\\{${key}\\}`, 'g'), variables[key]);
        });

        // 这里应该调用实际的短信服务API
        // 目前只是模拟发送成功
        console.log(`批量发送短信到 ${phoneNumbers.length} 个手机号: ${content}`);
        
        // 模拟发送延迟
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 实际项目中应该记录发送结果到数据库
        const sendResults = phoneNumbers.map(phone => ({
            phoneNumber: phone,
            status: 'success', // 实际项目中应该根据发送结果设置
            sentAt: new Date()
        }));

        res.json({
            code: 0,
            message: '短信发送成功',
            data: {
                sentCount: phoneNumbers.length,
                totalCount: phoneNumbers.length,
                results: sendResults
            }
        });
    } catch (error) {
        console.error('批量发送短信失败:', error);
        res.status(500).json({
            code: 1,
            message: '批量发送短信失败'
        });
    }
});

module.exports = router;