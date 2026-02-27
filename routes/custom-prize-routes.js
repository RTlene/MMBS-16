/**
 * 自定义奖品管理（供抽奖活动“自定义奖品”类型使用）
 */
const express = require('express');
const { Op } = require('sequelize');
const { CustomPrize } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// 列表
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 100, search = '' } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const where = {};
        if (search) {
            where.name = { [Op.like]: '%' + search + '%' };
        }
        const { count, rows } = await CustomPrize.findAndCountAll({
            where,
            order: [['sortOrder', 'ASC'], ['id', 'ASC']],
            limit: parseInt(limit),
            offset
        });
        res.json({
            code: 0,
            message: '获取成功',
            data: { list: rows, total: count, page: parseInt(page), totalPages: Math.ceil(count / parseInt(limit)) }
        });
    } catch (e) {
        console.error('自定义奖品列表失败:', e);
        res.status(500).json({ code: 1, message: '获取失败', error: e.message });
    }
});

// 全部（下拉用，不分页）
router.get('/all', authenticateToken, async (req, res) => {
    try {
        const rows = await CustomPrize.findAll({
            order: [['sortOrder', 'ASC'], ['id', 'ASC']],
            attributes: ['id', 'name', 'description', 'image']
        });
        res.json({ code: 0, message: '获取成功', data: { list: rows } });
    } catch (e) {
        console.error('自定义奖品全部失败:', e);
        res.status(500).json({ code: 1, message: '获取失败', error: e.message });
    }
});

// 单条
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const row = await CustomPrize.findByPk(req.params.id);
        if (!row) return res.status(404).json({ code: 1, message: '不存在' });
        res.json({ code: 0, message: '获取成功', data: row });
    } catch (e) {
        console.error('自定义奖品详情失败:', e);
        res.status(500).json({ code: 1, message: '获取失败', error: e.message });
    }
});

// 新增
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { name, description, image, sortOrder } = req.body || {};
        if (!name || !String(name).trim()) {
            return res.status(400).json({ code: 1, message: '奖品名称不能为空' });
        }
        const row = await CustomPrize.create({
            name: String(name).trim(),
            description: description != null ? String(description).trim() : null,
            image: image != null ? String(image).trim() : null,
            sortOrder: parseInt(sortOrder, 10) || 0
        });
        res.json({ code: 0, message: '创建成功', data: row });
    } catch (e) {
        console.error('创建自定义奖品失败:', e);
        res.status(500).json({ code: 1, message: '创建失败', error: e.message });
    }
});

// 更新
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const row = await CustomPrize.findByPk(req.params.id);
        if (!row) return res.status(404).json({ code: 1, message: '不存在' });
        const { name, description, image, sortOrder } = req.body || {};
        if (name !== undefined) row.name = String(name).trim();
        if (description !== undefined) row.description = description != null ? String(description).trim() : null;
        if (image !== undefined) row.image = image != null ? String(image).trim() : null;
        if (sortOrder !== undefined) row.sortOrder = parseInt(sortOrder, 10) || 0;
        await row.save();
        res.json({ code: 0, message: '更新成功', data: row });
    } catch (e) {
        console.error('更新自定义奖品失败:', e);
        res.status(500).json({ code: 1, message: '更新失败', error: e.message });
    }
});

// 删除
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const row = await CustomPrize.findByPk(req.params.id);
        if (!row) return res.status(404).json({ code: 1, message: '不存在' });
        await row.destroy();
        res.json({ code: 0, message: '删除成功' });
    } catch (e) {
        console.error('删除自定义奖品失败:', e);
        res.status(500).json({ code: 1, message: '删除失败', error: e.message });
    }
});

module.exports = router;
