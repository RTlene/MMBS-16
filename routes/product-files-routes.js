const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Product } = require('../db');
const { compressImage } = require('../utils/imageCompress');
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

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB限制
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

        // 压缩图片文件
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
            
            // 获取最终文件大小（可能已被压缩）
            const finalStats = fs.statSync(filePath);
            
            return {
                url: `/uploads/products/${productId}/${file.filename}`,
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

// 删除商品文件
router.delete('/:productId/:filename', async (req, res) => {
    try {
        const { productId, filename } = req.params;
        const { type } = req.body; // 'mainImages', 'detailImages', 'videos'
        
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
        const currentData = product[type] || [];
        const fileUrl = `/uploads/products/${productId}/${filename}`;
        const newData = currentData.filter(url => url !== fileUrl);
        
        await product.update({
            [type]: newData
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

// 删除商品所有文件
router.delete('/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        
        // 获取商品信息
        const product = await Product.findByPk(productId);
        if (!product) {
            return res.status(404).json({
                code: 1,
                message: '商品不存在'
            });
        }

        // 删除商品目录
        const productDir = path.join(uploadDir, productId.toString());
        if (fs.existsSync(productDir)) {
            fs.rmSync(productDir, { recursive: true, force: true });
        }

        // 清空商品文件数据
        await product.update({
            images: [],
            detailImages: [],
            videos: []
        });
        
        res.json({
            code: 0,
            message: '删除成功'
        });
    } catch (error) {
        console.error('删除文件失败:', error);
        res.status(500).json({
            code: 1,
            message: '删除失败: ' + error.message
        });
    }
});

module.exports = router;