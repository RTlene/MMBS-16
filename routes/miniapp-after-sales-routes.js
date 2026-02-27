/**
 * 售后（退款/退货）图片上传：上传到对象存储（COS）或本地，供用户提交售后单时使用
 * 临时存储，超期后由通用设置中的「售后图片保留天数」触发清理，转为轻量化（清除图片）
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateMiniappUser } = require('../middleware/miniapp-auth');
const cosStorage = require('../services/cosStorage');

const router = express.Router();

const LOCAL_UPLOAD_DIR = path.join(__dirname, '../public/uploads/aftersales');
if (!fs.existsSync(LOCAL_UPLOAD_DIR)) {
    fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
}

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('只允许上传图片'));
        }
    }
});

// POST /after-sales/upload-image  小程序用户上传售后凭证图，存入对象存储或本地
router.post('/after-sales/upload-image', authenticateMiniappUser, (req, res, next) => {
    upload.single('image')(req, res, (err) => {
        if (err) {
            if (err.message === '只允许上传图片') return res.status(400).json({ code: 1, message: '只允许上传图片' });
            if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ code: 1, message: '图片不能超过 5MB' });
            return res.status(400).json({ code: 1, message: err.message || '上传失败' });
        }
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ code: 1, message: '未上传文件' });
        }
        const memberId = req.member.id;
        const ext = path.extname(req.file.originalname || '') || '.jpg';
        const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext.toLowerCase()) ? ext : '.jpg';
        const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`;

        if (cosStorage.isConfigured()) {
            const objectKey = `aftersales/${memberId}/${filename}`;
            await cosStorage.putObjectBuffer(objectKey, req.file.buffer);
            const url = cosStorage.getPublicUrl(objectKey);
            return res.json({ code: 0, message: '上传成功', data: { url } });
        }

        const localPath = path.join(LOCAL_UPLOAD_DIR, filename);
        fs.writeFileSync(localPath, req.file.buffer);
        const url = `/uploads/aftersales/${filename}`;
        return res.json({ code: 0, message: '上传成功', data: { url } });
    } catch (e) {
        console.error('售后图片上传失败:', e);
        return res.status(500).json({ code: 1, message: e.message || '上传失败' });
    }
});

module.exports = router;
