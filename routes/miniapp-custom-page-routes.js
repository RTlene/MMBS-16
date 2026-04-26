const express = require('express');
const { Op } = require('sequelize');
const { CustomPage } = require('../db');

const router = express.Router();

router.get('/custom-pages/:slug', async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim();
    if (!slug) return res.status(400).json({ code: 1, message: '页面标识不能为空' });
    const now = new Date();
    const page = await CustomPage.findOne({
      where: {
        slug,
        status: 'published',
        [Op.and]: [
          { [Op.or]: [{ startTime: null }, { startTime: { [Op.lte]: now } }] },
          { [Op.or]: [{ endTime: null }, { endTime: { [Op.gte]: now } }] }
        ]
      }
    });
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

