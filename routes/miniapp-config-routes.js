const express = require('express');
const configStore = require('../services/configStore');

const router = express.Router();

/**
 * 小程序公开配置（无需鉴权）
 * GET /api/miniapp/config
 */
router.get('/config', async (req, res) => {
  try {
    const system = configStore.getSection('system') || {};
    const mallName = system.mallName != null ? String(system.mallName).trim() : '';
    res.json({
      code: 0,
      message: '获取成功',
      data: {
        mallName
      }
    });
  } catch (e) {
    console.error('[MiniappConfig] 获取失败:', e.message);
    res.status(500).json({ code: 1, message: '获取配置失败', error: e.message });
  }
});

module.exports = router;

