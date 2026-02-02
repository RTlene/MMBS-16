const express = require('express');
const { Op } = require('sequelize');
const { EmailTemplate } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// 获取邮件模板统计
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const total = await EmailTemplate.count();
        const active = await EmailTemplate.count({ where: { status: 'active' } });

        // 这里应该从邮件发送记录表中统计，暂时使用模拟数据
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
        console.error('获取邮件模板统计失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取邮件模板统计失败'
        });
    }
});

// 获取邮件模板列表
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
                { subject: { [Op.like]: `%${search}%` } }
            ];
        }

        if (type) {
            where.type = type;
        }

        if (status) {
            where.status = status;
        }

        const { count, rows } = await EmailTemplate.findAndCountAll({
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
        console.error('获取邮件模板列表失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取邮件模板列表失败'
        });
    }
});

// 获取单个邮件模板
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const template = await EmailTemplate.findByPk(id);

        if (!template) {
            return res.status(404).json({
                code: 1,
                message: '邮件模板不存在'
            });
        }

        res.json({
            code: 0,
            message: '获取成功',
            data: template
        });
    } catch (error) {
        console.error('获取邮件模板失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取邮件模板失败'
        });
    }
});

// 创建邮件模板
router.post('/', authenticateToken, async (req, res) => {
    try {
        const templateData = req.body;

        // 数据验证
        if (!templateData.name || !templateData.subject || !templateData.content || !templateData.type) {
            return res.status(400).json({
                code: 1,
                message: '模板名称、主题、内容和类型不能为空'
            });
        }

        // 验证模板类型
        if (!['welcome', 'order', 'promotion', 'newsletter'].includes(templateData.type)) {
            return res.status(400).json({
                code: 1,
                message: '模板类型必须是welcome、order、promotion或newsletter之一'
            });
        }

        // 验证内容长度
        if (templateData.content.length > 10000) {
            return res.status(400).json({
                code: 1,
                message: '邮件内容不能超过10000字符'
            });
        }

        const template = await EmailTemplate.create({
            name: templateData.name,
            subject: templateData.subject,
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
        console.error('创建邮件模板失败:', error);
        res.status(500).json({
            code: 1,
            message: '创建邮件模板失败'
        });
    }
});

// 更新邮件模板
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const templateData = req.body;

        const template = await EmailTemplate.findByPk(id);
        if (!template) {
            return res.status(404).json({
                code: 1,
                message: '邮件模板不存在'
            });
        }

        // 验证内容长度
        if (templateData.content && templateData.content.length > 10000) {
            return res.status(400).json({
                code: 1,
                message: '邮件内容不能超过10000字符'
            });
        }

        // 更新模板
        await template.update({
            name: templateData.name || template.name,
            subject: templateData.subject || template.subject,
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
        console.error('更新邮件模板失败:', error);
        res.status(500).json({
            code: 1,
            message: '更新邮件模板失败'
        });
    }
});

// 删除邮件模板
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const template = await EmailTemplate.findByPk(id);
        if (!template) {
            return res.status(404).json({
                code: 1,
                message: '邮件模板不存在'
            });
        }

        await template.destroy();

        res.json({
            code: 0,
            message: '删除成功'
        });
    } catch (error) {
        console.error('删除邮件模板失败:', error);
        res.status(500).json({
            code: 1,
            message: '删除邮件模板失败'
        });
    }
});

// 测试邮件模板
router.post('/test', authenticateToken, async (req, res) => {
    try {
        const { templateId, email } = req.body;

        if (!templateId || !email) {
            return res.status(400).json({
                code: 1,
                message: '模板ID和邮箱地址不能为空'
            });
        }

        // 验证邮箱格式
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                code: 1,
                message: '邮箱格式不正确'
            });
        }

        const template = await EmailTemplate.findByPk(templateId);
        if (!template) {
            return res.status(404).json({
                code: 1,
                message: '邮件模板不存在'
            });
        }

        if (template.status !== 'active') {
            return res.status(400).json({
                code: 1,
                message: '模板已禁用，无法发送'
            });
        }

        // 这里应该调用实际的邮件服务API
        // 目前只是模拟发送成功
        console.log(`发送测试邮件到 ${email}: ${template.subject}`);

        // 模拟发送延迟
        await new Promise(resolve => setTimeout(resolve, 1000));

        res.json({
            code: 0,
            message: '测试邮件发送成功',
            data: {
                email: email,
                subject: template.subject,
                sentAt: new Date()
            }
        });
    } catch (error) {
        console.error('测试邮件发送失败:', error);
        res.status(500).json({
            code: 1,
            message: '测试邮件发送失败'
        });
    }
});

// 批量发送邮件
router.post('/send', authenticateToken, async (req, res) => {
    try {
        const { templateId, emails, variables = {} } = req.body;

        if (!templateId || !emails || !Array.isArray(emails)) {
            return res.status(400).json({
                code: 1,
                message: '模板ID和邮箱列表不能为空'
            });
        }

        if (emails.length === 0) {
            return res.status(400).json({
                code: 1,
                message: '邮箱列表不能为空'
            });
        }

        // 验证邮箱格式
        const invalidEmails = emails.filter(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
        if (invalidEmails.length > 0) {
            return res.status(400).json({
                code: 1,
                message: `以下邮箱格式不正确：${invalidEmails.join(', ')}`
            });
        }

        const template = await EmailTemplate.findByPk(templateId);
        if (!template) {
            return res.status(404).json({
                code: 1,
                message: '邮件模板不存在'
            });
        }

        if (template.status !== 'active') {
            return res.status(400).json({
                code: 1,
                message: '模板已禁用，无法发送'
            });
        }

        // 处理变量替换
        let subject = template.subject;
        let content = template.content;
        Object.keys(variables).forEach(key => {
            subject = subject.replace(new RegExp(`\\{${key}\\}`, 'g'), variables[key]);
            content = content.replace(new RegExp(`\\{${key}\\}`, 'g'), variables[key]);
        });

        // 这里应该调用实际的邮件服务API
        // 目前只是模拟发送成功
        console.log(`批量发送邮件到 ${emails.length} 个邮箱: ${subject}`);

        // 模拟发送延迟
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 实际项目中应该记录发送结果到数据库
        const sendResults = emails.map(email => ({
            email: email,
            status: 'success', // 实际项目中应该根据发送结果设置
            sentAt: new Date()
        }));

        res.json({
            code: 0,
            message: '邮件发送成功',
            data: {
                sentCount: emails.length,
                totalCount: emails.length,
                results: sendResults
            }
        });
    } catch (error) {
        console.error('批量发送邮件失败:', error);
        res.status(500).json({
            code: 1,
            message: '批量发送邮件失败'
        });
    }
});

module.exports = router;