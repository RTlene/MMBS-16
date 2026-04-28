const express = require('express');
const { Op, QueryTypes } = require('sequelize');
const { sequelize, CustomPage } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

function parseSchema(v) {
  if (v == null || v === '') return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(String(v));
  } catch (_) {
    return [];
  }
}

function sanitizeCustomPageRecord(record) {
  if (!record) return record;
  const row = { ...record };
  row.schemaJson = parseSchema(row.schemaJson);
  return row;
}

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, status = '', search = '' } = req.query;
    const where = {};
    if (status) where.status = status;
    if (search && String(search).trim()) {
      const kw = `%${String(search).trim()}%`;
      where[Op.or] = [{ name: { [Op.like]: kw } }, { slug: { [Op.like]: kw } }, { title: { [Op.like]: kw } }];
    }
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const { count, rows } = await CustomPage.findAndCountAll({
      where,
      limit: limitNum,
      offset: (pageNum - 1) * limitNum,
      order: [['id', 'DESC']]
    });
    res.json({
      code: 0,
      message: '获取成功',
      data: { list: rows, total: count, page: pageNum, limit: limitNum, totalPages: Math.ceil((count || 0) / limitNum) }
    });
  } catch (e) {
    console.error('自定义页面列表失败:', e);
    res.status(500).json({ code: 1, message: '获取失败' });
  }
});

router.get('/:id(\\d+)', authenticateToken, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ code: 1, message: '页面ID无效' });
    }
    let page = null;
    try {
      page = await CustomPage.findByPk(id, { raw: true });
    } catch (innerErr) {
      // 兼容历史脏数据（如 schemaJson 非法）导致 ORM 反序列化异常，降级走原始 SQL
      console.warn('自定义页面详情 ORM 查询失败，尝试降级查询:', innerErr && innerErr.message);
      const rows = await sequelize.query(
        `SELECT id, name, slug, title, status, startTime, endTime, schemaJson, shareTitle, shareImage, enableShare, createdAt, updatedAt
         FROM custom_pages
         WHERE id = :id
         LIMIT 1`,
        {
          replacements: { id },
          type: QueryTypes.SELECT
        }
      );
      page = Array.isArray(rows) && rows.length ? rows[0] : null;
    }
    if (!page) return res.status(404).json({ code: 1, message: '页面不存在' });
    res.json({ code: 0, message: '获取成功', data: sanitizeCustomPageRecord(page) });
  } catch (e) {
    console.error('自定义页面详情失败:', e);
    res.status(500).json({ code: 1, message: '获取失败' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) return res.status(400).json({ code: 1, message: '页面名称不能为空' });
    if (!b.slug || !String(b.slug).trim()) return res.status(400).json({ code: 1, message: 'slug 不能为空' });
    const slug = String(b.slug).trim();
    const exists = await CustomPage.findOne({ where: { slug }, attributes: ['id'] });
    if (exists) return res.status(400).json({ code: 1, message: 'slug 已存在' });
    const page = await CustomPage.create({
      name: String(b.name).trim(),
      slug,
      title: b.title ? String(b.title).trim() : null,
      status: ['draft', 'published', 'offline'].includes(String(b.status)) ? b.status : 'draft',
      startTime: b.startTime ? new Date(b.startTime) : null,
      endTime: b.endTime ? new Date(b.endTime) : null,
      schemaJson: parseSchema(b.schemaJson),
      shareTitle: b.shareTitle ? String(b.shareTitle).trim() : null,
      shareImage: b.shareImage ? String(b.shareImage).trim() : null,
      enableShare: b.enableShare !== false,
      createdBy: req.user ? req.user.id : null,
      updatedBy: req.user ? req.user.id : null
    });
    res.json({ code: 0, message: '创建成功', data: page });
  } catch (e) {
    console.error('自定义页面创建失败:', e);
    res.status(500).json({ code: 1, message: '创建失败' });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const page = await CustomPage.findByPk(req.params.id);
    if (!page) return res.status(404).json({ code: 1, message: '页面不存在' });
    const b = req.body || {};
    const payload = {};
    if (b.name !== undefined) payload.name = String(b.name || page.name).trim();
    if (b.slug !== undefined) {
      const slug = String(b.slug || '').trim();
      if (!slug) return res.status(400).json({ code: 1, message: 'slug 不能为空' });
      const exists = await CustomPage.findOne({ where: { slug, id: { [Op.ne]: page.id } }, attributes: ['id'] });
      if (exists) return res.status(400).json({ code: 1, message: 'slug 已存在' });
      payload.slug = slug;
    }
    if (b.title !== undefined) payload.title = b.title ? String(b.title).trim() : null;
    if (b.status !== undefined) payload.status = ['draft', 'published', 'offline'].includes(String(b.status)) ? b.status : page.status;
    if (b.startTime !== undefined) payload.startTime = b.startTime ? new Date(b.startTime) : null;
    if (b.endTime !== undefined) payload.endTime = b.endTime ? new Date(b.endTime) : null;
    if (b.schemaJson !== undefined) payload.schemaJson = parseSchema(b.schemaJson);
    if (b.shareTitle !== undefined) payload.shareTitle = b.shareTitle ? String(b.shareTitle).trim() : null;
    if (b.shareImage !== undefined) payload.shareImage = b.shareImage ? String(b.shareImage).trim() : null;
    if (b.enableShare !== undefined) payload.enableShare = !!b.enableShare;
    payload.updatedBy = req.user ? req.user.id : null;
    await page.update(payload);
    res.json({ code: 0, message: '更新成功', data: page });
  } catch (e) {
    console.error('自定义页面更新失败:', e);
    res.status(500).json({ code: 1, message: '更新失败' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const page = await CustomPage.findByPk(req.params.id);
    if (!page) return res.status(404).json({ code: 1, message: '页面不存在' });
    await page.destroy();
    res.json({ code: 0, message: '删除成功' });
  } catch (e) {
    res.status(500).json({ code: 1, message: '删除失败' });
  }
});

module.exports = router;

