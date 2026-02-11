const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Product } = require('../db');
const { compressImage } = require('../utils/imageCompress');
const cosStorage = require('../services/cosStorage');
const router = express.Router();

// 确保上传目录存在
const uploadDir = path.join(__dirname, '../public/uploads/products');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const productId = req.params.productId;
        const productDir = path.join(uploadDir, productId.toString());
        
        // 为每个商品创建独立目录
        if (!fs.existsSync(productDir)) {
            fs.mkdirSync(productDir, { recursive: true });
        }
        
        cb(null, productDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// 单文件 10MB；若遇 413，多为网关限制（如 Cloud Run/TCB 请求体上限），可：1) 一次少传几个文件 2) 在部署侧提高 client_max_body_size
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB 单文件
    },
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('只允许上传图片和视频文件'));
        }
    }
});

// 上传商品文件
router.post('/:productId', upload.array('files', 20), async (req, res) => {
    try {
        const { productId } = req.params;
        const { type } = req.body; // 'images' | 'detailImages' | 'videos'
        const allowedTypes = ['images', 'detailImages', 'videos'];
        const targetField = allowedTypes.includes(type) ? type : 'images';
        
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                code: 1,
                message: '没有上传文件'
            });
        }

        // 获取商品信息
        const product = await Product.findByPk(productId);
        if (!product) {
            return res.status(404).json({
                code: 1,
                message: '商品不存在'
            });
        }

        // 压缩图片文件（仍写本地，供 COS 上传或本地回退）
        const files = await Promise.all(req.files.map(async (file) => {
            const filePath = path.join(uploadDir, productId.toString(), file.filename);

            // 只压缩图片文件
            if (file.mimetype.startsWith('image/')) {
                try {
                    const compressResult = await compressImage(filePath, null, {
                        quality: 80,
                        maxWidth: 1920,
                        maxHeight: 1920,
                        keepOriginal: false
                    });

                    if (compressResult.success && !compressResult.skipped) {
                        console.log(`[ProductFiles] 图片压缩成功: ${file.filename}, 原始: ${(compressResult.originalSize / 1024).toFixed(2)}KB, 压缩后: ${(compressResult.compressedSize / 1024).toFixed(2)}KB, 节省: ${compressResult.savedPercent}%`);
                    }
                } catch (error) {
                    console.error(`[ProductFiles] 图片压缩失败: ${file.filename}`, error);
                }
            }

            const finalStats = fs.statSync(filePath);
            let url = `/uploads/products/${productId}/${file.filename}`;

            // 若配置了 COS，上传到对象存储并返回 COS 公网 URL（持久化，再次编辑可加载）
            if (cosStorage.isConfigured()) {
                try {
                    const objectKey = cosStorage.getObjectKey(productId, file.filename);
                    url = await cosStorage.uploadFromPath(filePath, objectKey);
                    console.log(`[ProductFiles] 已上传至 COS: ${file.filename} -> ${url}`);
                } catch (err) {
                    console.error(`[ProductFiles] COS 上传失败，使用本地路径: ${file.filename}`, err.message);
                }
            }

            return {
                url,
                filename: file.filename,
                originalName: file.originalname,
                size: finalStats.size,
                mimetype: file.mimetype
            };
        }));

        // 更新商品数据
        const currentData = product[targetField] || [];
        const newData = [...currentData, ...files.map(f => f.url)];
        
        await product.update({
            [targetField]: newData
        });
        
        res.json({
            code: 0,
            message: '上传成功',
            data: {
                files: files,
                updatedData: newData
            }
        });
    } catch (error) {
        console.error('文件上传失败:', error);
        res.status(500).json({
            code: 1,
            message: '上传失败: ' + error.message
        });
    }
});

// 前端传 mainImages，数据库字段为 images
const TYPE_TO_FIELD = { mainImages: 'images', detailImages: 'detailImages', videos: 'videos' };

// 删除商品文件
router.delete('/:productId/:filename', async (req, res) => {
    try {
        const { productId, filename } = req.params;
        const { type } = req.body; // 'mainImages' | 'detailImages' | 'videos'
        const field = TYPE_TO_FIELD[type] || type;
        
        // 获取商品信息
        const product = await Product.findByPk(productId);
        if (!product) {
            return res.status(404).json({
                code: 1,
                message: '商品不存在'
            });
        }

        // 删除服务器文件
        const filePath = path.join(uploadDir, productId, filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // 更新商品数据
        const currentData = product[field] || [];
        const fileUrl = `/uploads/products/${productId}/${filename}`;
        const newData = currentData.filter(url => url !== fileUrl);
        
        await product.update({
            [field]: newData
        });
        
        res.json({
            code: 0,
            message: '删除成功',
            data: {
                updatedData: newData
            }
        });
    } catch (error) {
        console.error('删除文件失败:', error);
        res.status(500).json({
            code: 1,
            message: '删除失败: ' + error.message
        });
    }
});

/**
 * 删除指定商品的所有上传文件（磁盘目录 + 清空 DB 中的 images/detailImages/videos）
 * 供 product-routes 删除商品时直接调用，避免在 Cloud Run 等环境请求 localhost 导致 ECONNREFUSED。
 * @param {string|number} productId
 * @returns {{ ok: boolean, message?: string }}
 */
async function deleteProductFiles(productId) {
    const product = await Product.findByPk(productId);
    if (!product) {
        return { ok: false, message: '商品不存在' };
    }
    const productDir = path.join(uploadDir, String(productId));
    if (fs.existsSync(productDir)) {
        fs.rmSync(productDir, { recursive: true, force: true });
    }
    await product.update({
        images: [],
        detailImages: [],
        videos: []
    });
    return { ok: true };
}

// 删除商品所有文件
router.delete('/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const result = await deleteProductFiles(productId);
        if (!result.ok) {
            return res.status(404).json({ code: 1, message: result.message || '商品不存在' });
        }
        res.json({ code: 0, message: '删除成功' });
    } catch (error) {
        console.error('删除文件失败:', error);
        res.status(500).json({
            code: 1,
            message: '删除失败: ' + error.message
        });
    }
});

module.exports = router;
module.exports.deleteProductFiles = deleteProductFiles;