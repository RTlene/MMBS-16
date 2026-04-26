const express = require('express');
const { Op } = require('sequelize');
const { CampaignPopup, CampaignPopupExposure, Member } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { authenticateMiniappUser } = require('../middleware/miniapp-auth');

const router = express.Router();

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (!v) return [];
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return v.split(',').map((s) => String(s || '').trim()).filter(Boolean);
    }
  }
  return [];
}

function buildCycleKey(popup) {
  const s = popup.startTime ? new Date(popup.startTime).toISOString().slice(0, 10) : 'none';
  const e = popup.endTime ? new Date(popup.endTime).toISOString().slice(0, 10) : 'none';
  return `${popup.id}:${s}:${e}`;
}

// 管理端列表
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, status = '', search = '' } = req.query;
    const where = {};
    if (status) where.status = status;
    if (search && String(search).trim()) {
      where.name = { [Op.like]: `%${String(search).trim()}%` };
    }
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const { count, rows } = await CampaignPopup.findAndCountAll({
      where,
      limit: limitNum,
      offset: (pageNum - 1) * limitNum,
      order: [['priority', 'DESC'], ['id', 'DESC']]
    });
    res.json({
      code: 0,
      message: '获取成功',
      data: {
        list: rows,
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil((count || 0) / limitNum)
      }
    });
  } catch (e) {
    console.error('活动弹窗列表失败:', e);
    res.status(500).json({ code: 1, message: '获取失败' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const popup = await CampaignPopup.findByPk(req.params.id);
    if (!popup) return res.status(404).json({ code: 1, message: '活动弹窗不存在' });
    res.json({ code: 0, message: '获取成功', data: popup });
  } catch (e) {
    res.status(500).json({ code: 1, message: '获取失败' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) {
      return res.status(400).json({ code: 1, message: '活动名称不能为空' });
    }
    const popup = await CampaignPopup.create({
      name: String(b.name).trim(),
      title: b.title ? String(b.title).trim() : null,
      status: ['draft', 'active', 'inactive'].includes(String(b.status)) ? b.status : 'draft',
      startTime: b.startTime ? new Date(b.startTime) : null,
      endTime: b.endTime ? new Date(b.endTime) : null,
      priority: parseInt(b.priority, 10) || 0,
      showOncePerCycle: b.showOncePerCycle !== false,
      jumpType: ['none', 'miniapp_page', 'tab', 'webview', 'custom_page'].includes(String(b.jumpType)) ? b.jumpType : 'none',
      jumpTarget: b.jumpTarget ? String(b.jumpTarget).trim() : null,
      imageUrls: asArray(b.imageUrls),
      createdBy: req.user ? req.user.id : null,
      updatedBy: req.user ? req.user.id : null
    });
    res.json({ code: 0, message: '创建成功', data: popup });
  } catch (e) {
    console.error('活动弹窗创建失败:', e);
    res.status(500).json({ code: 1, message: '创建失败' });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const popup = await CampaignPopup.findByPk(req.params.id);
    if (!popup) return res.status(404).json({ code: 1, message: '活动弹窗不存在' });
    const b = req.body || {};
    const payload = {};
    if (b.name !== undefined) payload.name = String(b.name || popup.name).trim();
    if (b.title !== undefined) payload.title = b.title ? String(b.title).trim() : null;
    if (b.status !== undefined) payload.status = ['draft', 'active', 'inactive'].includes(String(b.status)) ? b.status : popup.status;
    if (b.startTime !== undefined) payload.startTime = b.startTime ? new Date(b.startTime) : null;
    if (b.endTime !== undefined) payload.endTime = b.endTime ? new Date(b.endTime) : null;
    if (b.priority !== undefined) payload.priority = parseInt(b.priority, 10) || 0;
    if (b.showOncePerCycle !== undefined) payload.showOncePerCycle = !!b.showOncePerCycle;
    if (b.jumpType !== undefined) payload.jumpType = ['none', 'miniapp_page', 'tab', 'webview', 'custom_page'].includes(String(b.jumpType)) ? b.jumpType : popup.jumpType;
    if (b.jumpTarget !== undefined) payload.jumpTarget = b.jumpTarget ? String(b.jumpTarget).trim() : null;
    if (b.imageUrls !== undefined) payload.imageUrls = asArray(b.imageUrls);
    payload.updatedBy = req.user ? req.user.id : null;
    await popup.update(payload);
    res.json({ code: 0, message: '更新成功', data: popup });
  } catch (e) {
    console.error('活动弹窗更新失败:', e);
    res.status(500).json({ code: 1, message: '更新失败' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const popup = await CampaignPopup.findByPk(req.params.id);
    if (!popup) return res.status(404).json({ code: 1, message: '活动弹窗不存在' });
    await popup.destroy();
    res.json({ code: 0, message: '删除成功' });
  } catch (e) {
    res.status(500).json({ code: 1, message: '删除失败' });
  }
});

// 小程序端：获取当前应弹活动（多活动轮播；每会员每周期一次）
router.get('/active', authenticateMiniappUser, async (req, res) => {
  try {
    const member = req.member || {};
    if (!member.id) {
      return res.json({ code: 0, message: '未登录不弹窗', data: null });
    }
    const now = new Date();
    const popups = await CampaignPopup.findAll({
      where: {
        status: 'active',
        [Op.and]: [
          { [Op.or]: [{ startTime: null }, { startTime: { [Op.lte]: now } }] },
          { [Op.or]: [{ endTime: null }, { endTime: { [Op.gte]: now } }] }
        ]
      },
      order: [['priority', 'DESC'], ['id', 'DESC']]
    });
    if (!Array.isArray(popups) || popups.length === 0) {
      return res.json({ code: 0, message: '无活动弹窗', data: [] });
    }

    const resultItems = [];
    for (const popup of popups) {
      const cycleKey = buildCycleKey(popup);
      if (popup.showOncePerCycle) {
        const existed = await CampaignPopupExposure.findOne({
          where: { popupId: popup.id, memberId: member.id, cycleKey },
          attributes: ['id']
        });
        if (existed) continue;
      }
      // 先记录曝光，再返回（并发重复插入可忽略）
      await CampaignPopupExposure.create({
        popupId: popup.id,
        memberId: member.id,
        cycleKey,
        viewedAt: new Date()
      }).catch(() => {});

      const images = asArray(popup.imageUrls);
      resultItems.push({
        id: popup.id,
        name: popup.name,
        title: popup.title || popup.name,
        imageUrls: images,
        coverImage: images[0] || '',
        jumpType: popup.jumpType || 'none',
        jumpTarget: popup.jumpTarget || ''
      });
    }

    if (resultItems.length === 0) {
      return res.json({ code: 0, message: '本周期已展示', data: [] });
    }

    res.json({
      code: 0,
      message: '获取成功',
      data: resultItems
    });
  } catch (e) {
    console.error('小程序活动弹窗获取失败:', e);
    // 兼容：不要让首页崩
    res.json({ code: 0, message: '忽略错误', data: null });
  }
});

module.exports = router;

