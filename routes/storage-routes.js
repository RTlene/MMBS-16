/**
 * 存储相关接口：云托管 file_id 换临时下载链接（供 H5 后台展示 cloud:// 图片/视频）
 */
const express = require('express');
const wxCloudStorage = require('../services/wxCloudStorage');
const router = express.Router();

router.get('/temp-url', async (req, res) => {
    const fileId = req.query.fileId;
    if (!fileId || typeof fileId !== 'string' || !fileId.startsWith('cloud://')) {
        return res.status(400).json({ code: 1, message: '缺少或无效的 fileId（需为 cloud:// 开头）' });
    }
    if (!wxCloudStorage.isConfigured()) {
        return res.status(503).json({ code: 1, message: '未配置云托管存储' });
    }
    try {
        const downloadUrl = await wxCloudStorage.getTempDownloadUrl(fileId.trim(), 86400);
        if (!downloadUrl) {
            return res.status(404).json({ code: 1, message: '无法获取下载链接' });
        }
        res.redirect(302, downloadUrl);
    } catch (err) {
        console.warn('[Storage] getTempDownloadUrl 失败:', err.message);
        res.status(500).json({ code: 1, message: err.message || '获取临时链接失败' });
    }
});

module.exports = router;
