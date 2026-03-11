const express = require('express');
const { Op } = require('sequelize');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Category } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const cosStorage = require('../services/cosStorage');
const wxCloudStorage = require('../services/wxCloudStorage');

const router = express.Router();

async function resolveIconUrl(icon) {
    const raw = (icon && String(icon).trim()) || '';
    if (!raw) return null;
    // COS 私有桶：返回签名 URL，避免 403
    if (cosStorage.isConfigured()) {
        const objectKey = cosStorage.parseObjectKeyFromUrl(raw);
        if (objectKey) {
            try {
                const signed = await cosStorage.getSignedUrl(objectKey, 86400);
                if (signed) return signed;
            } catch (_) {}
        }
    }
    // 云托管对象存储 file_id：换临时下载链接，避免 H5/小程序无法直接访问
    if (wxCloudStorage.isConfigured() && raw.startsWith('cloud://')) {
        try {
            const temp = await wxCloudStorage.getTempDownloadUrl(raw, 86400);
            if (temp) return temp;
        } catch (_) {}
    }
    // 本地静态资源或已是可访问 URL
    return raw;
}

const categoryIconDir = path.join(__dirname, '../public/uploads/categories');
if (!fs.existsSync(categoryIconDir)) {
    fs.mkdirSync(categoryIconDir, { recursive: true });
}
const uploadIcon = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => (file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('只允许上传图片')))
});

// 获取所有分类
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '' } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = {};
        if (search) {
            whereClause = {
                [Op.or]: [
                    { name: { [Op.like]: `%${search}%` } },
                    { description: { [Op.like]: `%${search}%` } }
                ]
            };
        }

        const { count, rows } = await Category.findAndCountAll({
            where: whereClause,
            order: [['sortOrder', 'ASC'], ['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
        const categories = await Promise.all((rows || []).map(async (c) => {
            const json = c && c.toJSON ? c.toJSON() : c;
            return { ...json, icon: await resolveIconUrl(json.icon) };
        }));

        res.json({
            code: 0,
            data: {
                categories,
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(count / limit)
            }
        });
    } catch (error) {
        console.error('获取分类列表错误:', error);
        res.status(500).json({
            code: 1,
            message: '获取分类列表失败'
        });
    }
});

// 上传分类图标（返回 URL 供创建/编辑时使用）
router.post('/upload-icon', authenticateToken, (req, res, next) => {
    uploadIcon.single('icon')(req, res, (err) => {
        if (err) {
            if (err.message === '只允许上传图片') return res.status(400).json({ code: 1, message: '只允许上传图片' });
            if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ code: 1, message: '图片大小不能超过 2MB' });
            return res.status(400).json({ code: 1, message: err.message || '上传失败' });
        }
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file || !req.file.buffer) return res.status(400).json({ code: 1, message: '未上传文件' });

        const ext = path.extname(req.file.originalname || '') || '.png';
        const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext.toLowerCase()) ? ext : '.png';
        const filename = 'cat-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + safeExt;

        // 优先对象存储：COS（可在后台直接展示 URL），其次云托管对象存储（返回 cloud:// file_id），最后本地
        if (cosStorage.isConfigured()) {
            const objectKey = `categories/${filename}`;
            await cosStorage.putObjectBuffer(objectKey, req.file.buffer);
            const url = cosStorage.getPublicUrl(objectKey);
            return res.json({ code: 0, message: '上传成功', data: { url } });
        }

        if (wxCloudStorage.isConfigured()) {
            const tempPath = path.join(categoryIconDir, filename);
            fs.writeFileSync(tempPath, req.file.buffer);
            try {
                const cloudPath = (process.env.WX_CLOUD_STORAGE_PREFIX || 'categories').replace(/^\/+/, '').replace(/\/+$/, '') + '/' + filename;
                const fileId = await wxCloudStorage.uploadFromPath(tempPath, cloudPath);
                return res.json({ code: 0, message: '上传成功', data: { url: fileId } });
            } finally {
                try { fs.unlinkSync(tempPath); } catch (_) {}
            }
        }

        const localPath = path.join(categoryIconDir, filename);
        fs.writeFileSync(localPath, req.file.buffer);
        const url = '/uploads/categories/' + filename;
        return res.json({ code: 0, message: '上传成功', data: { url } });
    } catch (e) {
        console.error('上传分类图标失败:', e);
        return res.status(500).json({ code: 1, message: e.message || '上传失败' });
    }
});

// 创建分类
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { name, description, parentId, sortOrder, status, icon, showOnHomepage } = req.body;

        if (!name) {
            return res.status(400).json({
                code: 1,
                message: '分类名称不能为空'
            });
        }

        const category = await Category.create({
            name,
            description: description || null,
            parentId: parentId || null,
            sortOrder: sortOrder || 0,
            icon: (icon && String(icon).trim()) || null,
            showOnHomepage: showOnHomepage !== false && showOnHomepage !== 'false',
            status: status || 'active'
        });

        res.json({
            code: 0,
            message: '分类创建成功',
            data: category
        });
    } catch (error) {
        console.error('创建分类错误:', error);
        if (error.name === 'SequelizeUniqueConstraintError') {
            res.status(400).json({
                code: 1,
                message: '分类名称已存在'
            });
        } else {
            res.status(500).json({
                code: 1,
                message: '创建分类失败'
            });
        }
    }
});

// 获取单个分类信息
router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const category = await Category.findByPk(id);
      
      if (!category) {
        return res.status(404).json({
          code: 1,
          message: '分类不存在'
        });
      }
      
      res.json({
        code: 0,
        message: '获取成功',
        data: Object.assign(category.toJSON ? category.toJSON() : category, {
            icon: await resolveIconUrl(category.icon)
        })
      });
    } catch (error) {
      console.error('获取分类失败:', error);
      res.status(500).json({
        code: 1,
        message: '服务器错误'
      });
    }
  });

// 更新分类
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, parentId, sortOrder, status, icon, showOnHomepage } = req.body;

        const category = await Category.findByPk(id);
        if (!category) {
            return res.status(404).json({
                code: 1,
                message: '分类不存在'
            });
        }

        const updates = {
            name,
            description: description || null,
            parentId: parentId || null,
            sortOrder: sortOrder || 0,
            status: status || 'active',
            icon: (icon !== undefined && icon !== null ? String(icon).trim() : category.icon) || null,
            showOnHomepage: showOnHomepage !== undefined ? (showOnHomepage !== false && showOnHomepage !== 'false') : category.showOnHomepage
        };
        await category.update(updates);

        res.json({
            code: 0,
            message: '分类更新成功',
            data: category
        });
    } catch (error) {
        console.error('更新分类错误:', error);
        if (error.name === 'SequelizeUniqueConstraintError') {
            res.status(400).json({
                code: 1,
                message: '分类名称已存在'
            });
        } else {
            res.status(500).json({
                code: 1,
                message: '更新分类失败'
            });
        }
    }
});

// 删除分类
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const category = await Category.findByPk(id);
        if (!category) {
            return res.status(404).json({
                code: 1,
                message: '分类不存在'
            });
        }

        await category.destroy();

        res.json({
            code: 0,
            message: '分类删除成功'
        });
    } catch (error) {
        console.error('删除分类错误:', error);
        res.status(500).json({
            code: 1,
            message: '删除分类失败'
        });
    }
});

module.exports = router;