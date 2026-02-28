/**
 * 门店管理（后台）- CRUD
 */
const express = require('express');
const { Op } = require('sequelize');
const { Store } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// 列表
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 20, status, search } = req.query;
        const where = {};
        if (status) where.status = status;
        if (search && search.trim()) {
            where[Op.or] = [
                { name: { [Op.like]: `%${search.trim()}%` } },
                { address: { [Op.like]: `%${search.trim()}%` } },
                { region: { [Op.like]: `%${search.trim()}%` } }
            ];
        }
        const { count, rows } = await Store.findAndCountAll({
            where,
            order: [['sortOrder', 'ASC'], ['id', 'ASC']],
            limit: Math.min(parseInt(limit) || 20, 100),
            offset: (Math.max(1, parseInt(page)) - 1) * (parseInt(limit) || 20)
        });
        res.json({
            code: 0,
            message: '获取成功',
            data: {
                list: rows,
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil((count || 0) / (parseInt(limit) || 20))
            }
        });
    } catch (e) {
        console.error('门店列表失败:', e);
        res.status(500).json({ code: 1, message: e.message || '获取失败' });
    }
});

// 单条
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const store = await Store.findByPk(req.params.id);
        if (!store) return res.status(404).json({ code: 1, message: '门店不存在' });
        res.json({ code: 0, data: store });
    } catch (e) {
        res.status(500).json({ code: 1, message: e.message || '获取失败' });
    }
});

// 新增
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { name, address, region, latitude, longitude, phone, businessHours, status, sortOrder } = req.body || {};
        if (!name || !name.trim()) return res.status(400).json({ code: 1, message: '门店名称不能为空' });
        const store = await Store.create({
            name: name.trim(),
            address: address ? address.trim() : null,
            region: region ? region.trim() : null,
            latitude: latitude != null && latitude !== '' ? parseFloat(latitude) : null,
            longitude: longitude != null && longitude !== '' ? parseFloat(longitude) : null,
            phone: phone ? String(phone).trim() : null,
            businessHours: businessHours ? String(businessHours).trim() : null,
            status: status === 'inactive' ? 'inactive' : 'active',
            sortOrder: parseInt(sortOrder, 10) || 0
        });
        res.json({ code: 0, message: '创建成功', data: store });
    } catch (e) {
        console.error('门店创建失败:', e);
        res.status(500).json({ code: 1, message: e.message || '创建失败' });
    }
});

// 更新
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const store = await Store.findByPk(req.params.id);
        if (!store) return res.status(404).json({ code: 1, message: '门店不存在' });
        const { name, address, region, latitude, longitude, phone, businessHours, status, sortOrder } = req.body || {};
        if (name !== undefined) store.name = name ? name.trim() : store.name;
        if (address !== undefined) store.address = address ? address.trim() : null;
        if (region !== undefined) store.region = region ? region.trim() : null;
        if (latitude !== undefined) store.latitude = latitude != null && latitude !== '' ? parseFloat(latitude) : null;
        if (longitude !== undefined) store.longitude = longitude != null && longitude !== '' ? parseFloat(longitude) : null;
        if (phone !== undefined) store.phone = phone ? String(phone).trim() : null;
        if (businessHours !== undefined) store.businessHours = businessHours ? String(businessHours).trim() : null;
        if (status !== undefined) store.status = status === 'inactive' ? 'inactive' : 'active';
        if (sortOrder !== undefined) store.sortOrder = parseInt(sortOrder, 10) || 0;
        await store.save();
        res.json({ code: 0, message: '更新成功', data: store });
    } catch (e) {
        console.error('门店更新失败:', e);
        res.status(500).json({ code: 1, message: e.message || '更新失败' });
    }
});

// 删除
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const store = await Store.findByPk(req.params.id);
        if (!store) return res.status(404).json({ code: 1, message: '门店不存在' });
        await store.destroy();
        res.json({ code: 0, message: '删除成功' });
    } catch (e) {
        res.status(500).json({ code: 1, message: e.message || '删除失败' });
    }
});

module.exports = router;
