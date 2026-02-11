/**
 * 存储相关接口：云托管 file_id 换临时链接；COS 私有桶 URL 换签名链接（供 H5 展示）
 */
const express = require('express');
const wxCloudStorage = require('../services/wxCloudStorage');
const cosStorage = require('../services/cosStorage');
const router = express.Router();

/** COS 私有桶：根据公网 URL 生成签名 URL。默认 302 跳转（H5 图片）；format=json 时返回 { url }（小程序 video 等不跟重定向的场景） */
router.get('/cos-url', async (req, res) => {
    const rawUrl = req.query.url;
    const asJson = req.query.format === 'json';
    if (!rawUrl || typeof rawUrl !== 'string') {
        return res.status(400).json({ code: 1, message: '缺少参数 url' });
    }
    if (!cosStorage.isConfigured()) {
        return res.status(503).json({ code: 1, message: '未配置 COS' });
    }
    const objectKey = cosStorage.parseObjectKeyFromUrl(rawUrl.trim());
    if (!objectKey) {
        return res.status(400).json({ code: 1, message: 'url 不是当前配置的 COS 地址' });
    }
    try {
        const signedUrl = await cosStorage.getSignedUrl(objectKey, 3600);
        if (!signedUrl) {
            return res.status(502).json({ code: 1, message: '生成签名链接失败' });
        }
        if (asJson) {
            return res.json({ code: 0, url: signedUrl });
        }
        res.redirect(302, signedUrl);
    } catch (err) {
        console.warn('[Storage] getSignedUrl 失败:', err.message);
        res.status(500).json({ code: 1, message: err.message || '获取 COS 签名链接失败' });
    }
});

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
