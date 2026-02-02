const express = require('express');
const { MemberAddress, sequelize } = require('../db');
const { authenticateMiniappUser } = require('../middleware/miniapp-auth');

const router = express.Router();

function validatePayload(body = {}) {
  const name = (body.name || '').trim();
  const phone = (body.phone || '').replace(/\s+/g, '');
  const region = (body.region || '').trim();
  const detail = (body.detail || '').trim();
  if (!name) return { error: '收货人不能为空' };
  if (!/^1\d{10}$/.test(phone)) return { error: '手机号格式不正确' };
  if (!region) return { error: '省市区不能为空' };
  if (!detail) return { error: '详细地址不能为空' };
  return {
    error: null,
    data: {
      name,
      phone,
      region,
      detail,
      latitude: body.latitude || null,
      longitude: body.longitude || null,
      locationName: body.locationName || null,
      isDefault: !!body.isDefault,
    },
  };
}

// 地址列表
router.get('/addresses', authenticateMiniappUser, async (req, res) => {
  try {
    const memberId = req.member.id;
    const list = await MemberAddress.findAll({
      where: { memberId },
      order: [
        ['isDefault', 'DESC'],
        ['updatedAt', 'DESC'],
      ],
      attributes: ['id', 'name', 'phone', 'region', 'detail', 'latitude', 'longitude', 'locationName', 'isDefault', 'createdAt', 'updatedAt'],
    });
    res.json({ code: 0, message: '获取成功', data: list });
  } catch (err) {
    console.error('[Address] 列表失败:', err);
    res.status(500).json({ code: 1, message: '获取失败', error: err.message });
  }
});

// 获取单条
router.get('/addresses/:id', authenticateMiniappUser, async (req, res) => {
  try {
    const memberId = req.member.id;
    const { id } = req.params;
    const item = await MemberAddress.findOne({
      where: { id, memberId },
      attributes: ['id', 'name', 'phone', 'region', 'detail', 'latitude', 'longitude', 'locationName', 'isDefault', 'createdAt', 'updatedAt'],
    });
    if (!item) {
      return res.status(404).json({ code: 1, message: '地址不存在' });
    }
    res.json({ code: 0, message: '获取成功', data: item });
  } catch (err) {
    console.error('[Address] 获取失败:', err);
    res.status(500).json({ code: 1, message: '获取失败', error: err.message });
  }
});

// 新增
router.post('/addresses', authenticateMiniappUser, async (req, res) => {
  const { error, data } = validatePayload(req.body || {});
  if (error) return res.status(400).json({ code: 1, message: error });
  const memberId = req.member.id;
  const t = await sequelize.transaction();
  try {
    if (data.isDefault) {
      await MemberAddress.update({ isDefault: false }, { where: { memberId }, transaction: t });
    }
    const created = await MemberAddress.create({ ...data, memberId }, { transaction: t });
    await t.commit();
    res.json({ code: 0, message: '创建成功', data: created });
  } catch (err) {
    await t.rollback();
    console.error('[Address] 创建失败:', err);
    res.status(500).json({ code: 1, message: '创建失败', error: err.message });
  }
});

// 更新
router.put('/addresses/:id', authenticateMiniappUser, async (req, res) => {
  const { error, data } = validatePayload(req.body || {});
  if (error) return res.status(400).json({ code: 1, message: error });
  const memberId = req.member.id;
  const { id } = req.params;
  const t = await sequelize.transaction();
  try {
    const existing = await MemberAddress.findOne({ where: { id, memberId }, transaction: t });
    if (!existing) {
      await t.rollback();
      return res.status(404).json({ code: 1, message: '地址不存在' });
    }
    if (data.isDefault) {
      await MemberAddress.update({ isDefault: false }, { where: { memberId }, transaction: t });
    }
    await existing.update(data, { transaction: t });
    await t.commit();
    res.json({ code: 0, message: '更新成功' });
  } catch (err) {
    await t.rollback();
    console.error('[Address] 更新失败:', err);
    res.status(500).json({ code: 1, message: '更新失败', error: err.message });
  }
});

// 删除
router.delete('/addresses/:id', authenticateMiniappUser, async (req, res) => {
  try {
    const memberId = req.member.id;
    const { id } = req.params;
    const deleted = await MemberAddress.destroy({ where: { id, memberId } });
    if (!deleted) {
      return res.status(404).json({ code: 1, message: '地址不存在' });
    }
    res.json({ code: 0, message: '删除成功' });
  } catch (err) {
    console.error('[Address] 删除失败:', err);
    res.status(500).json({ code: 1, message: '删除失败', error: err.message });
  }
});

// 设为默认
router.put('/addresses/:id/default', authenticateMiniappUser, async (req, res) => {
  const memberId = req.member.id;
  const { id } = req.params;
  const t = await sequelize.transaction();
  try {
    const target = await MemberAddress.findOne({ where: { id, memberId }, transaction: t });
    if (!target) {
      await t.rollback();
      return res.status(404).json({ code: 1, message: '地址不存在' });
    }
    await MemberAddress.update({ isDefault: false }, { where: { memberId }, transaction: t });
    await target.update({ isDefault: true }, { transaction: t });
    await t.commit();
    res.json({ code: 0, message: '设置成功' });
  } catch (err) {
    await t.rollback();
    console.error('[Address] 设置默认失败:', err);
    res.status(500).json({ code: 1, message: '设置默认失败', error: err.message });
  }
});

module.exports = router;

