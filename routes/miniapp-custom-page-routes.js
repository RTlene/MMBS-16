const express = require('express');
const { Op } = require('sequelize');
const { CustomPage } = require('../db');

const router = express.Router();

router.get('/custom-pages/:slug', async (req, res) => {
  try {
    const rawSlug = String(req.params.slug || '').trim();
    if (!rawSlug) return res.status(400).json({ code: 1, message: '页面标识不能为空' });
    const slugCandidates = [rawSlug];
    try {
      const d1 = decodeURIComponent(rawSlug);
      if (d1 && !slugCandidates.includes(d1)) slugCandidates.push(d1);
      try {
        const d2 = decodeURIComponent(d1);
        if (d2 && !slugCandidates.includes(d2)) slugCandidates.push(d2);
      } catch (_) {}
    } catch (_) {}
    const now = new Date();
    const candidateWhere = {
      [Op.or]: [
        { slug: { [Op.in]: slugCandidates } },
        // 兼容历史配置错误：把“页面名称”当成了 slug 传入
        { name: { [Op.in]: slugCandidates } },
        // 再兜底：部分历史配置可能传的是标题
        { title: { [Op.in]: slugCandidates } }
      ]
    };
    const onlineWhere = {
      status: 'published',
      [Op.and]: [
        { [Op.or]: [{ startTime: null }, { startTime: { [Op.lte]: now } }] },
        { [Op.or]: [{ endTime: null }, { endTime: { [Op.gte]: now } }] }
      ]
    };

    // 1) 首选：严格在线页（已发布 + 在有效期）且精确匹配
    let page = await CustomPage.findOne({
      where: {
        ...candidateWhere,
        ...onlineWhere
      }
    });
    // 2) 兼容：历史 jumpTarget 可能缺少完整值，做一次模糊匹配（仍限定在线页）
    if (!page) {
      page = await CustomPage.findOne({
        where: {
          [Op.or]: [
            { slug: { [Op.like]: `%${rawSlug}%` } },
            { name: { [Op.like]: `%${rawSlug}%` } },
            { title: { [Op.like]: `%${rawSlug}%` } }
          ],
          ...onlineWhere
        },
        order: [['updatedAt', 'DESC'], ['id', 'DESC']]
      });
    }
    // 3) 最后兜底：用于活动跳转兼容老配置（忽略发布状态/时间）
    if (!page) {
      page = await CustomPage.findOne({
        where: candidateWhere,
        order: [['updatedAt', 'DESC'], ['id', 'DESC']]
      });
    }
    if (!page) return res.status(404).json({ code: 1, message: '页面不存在或未发布' });
    return res.json({
      code: 0,
      message: '获取成功',
      data: {
        id: page.id,
        name: page.name,
        slug: page.slug,
        title: page.title || page.name,
        schemaJson: page.schemaJson || [],
        shareTitle: page.shareTitle || page.title || page.name,
        shareImage: page.shareImage || '',
        enableShare: page.enableShare !== false
      }
    });
  } catch (e) {
    console.error('小程序自定义页获取失败:', e);
    return res.status(500).json({ code: 1, message: '获取失败' });
  }
});

module.exports = router;

