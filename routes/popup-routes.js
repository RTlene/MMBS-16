const express = require('express');
const { Op } = require('sequelize');
const { Popup } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// 配置multer用于文件上传
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '../public/uploads/popups');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'popup-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    },
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('只允许上传图片文件'), false);
        }
    }
});

// 获取弹窗统计
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const total = await Popup.count();
        const active = await Popup.count({ where: { status: 'active' } });
        const ad = await Popup.count({ where: { type: 'ad' } });
        const notice = await Popup.count({ where: { type: 'notice' } });

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                total,
                active,
                ad,
                notice
            }
        });
    } catch (error) {
        console.error('获取弹窗统计失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取弹窗统计失败'
        });
    }
});

// 获取弹窗列表
router.get('/', authenticateToken, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            type = '',
            status = '',
            sortBy = 'createdAt',
            sortOrder = 'DESC'
        } = req.query;

        const offset = (page - 1) * limit;
        const where = {};

        // 搜索条件
        if (search) {
            where[Op.or] = [
                { name: { [Op.like]: `%${search}%` } }
            ];
        }

        if (type) {
            where.type = type;
        }

        if (status) {
            where.status = status;
        }

        const { count, rows } = await Popup.findAndCountAll({
            where,
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [[sortBy, sortOrder.toUpperCase()]]
        });

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                popups: rows,
                total: count,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page)
            }
        });
    } catch (error) {
        console.error('获取弹窗列表失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取弹窗列表失败'
        });
    }
});

// 获取单个弹窗
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const popup = await Popup.findByPk(id);

        if (!popup) {
            return res.status(404).json({
                code: 1,
                message: '弹窗不存在'
            });
        }

        res.json({
            code: 0,
            message: '获取成功',
            data: popup
        });
    } catch (error) {
        console.error('获取弹窗失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取弹窗失败'
        });
    }
});

// 创建弹窗
router.post('/', authenticateToken, upload.single('image'), async (req, res) => {
    try {
        const popupData = req.body;

        // 数据验证
        if (!popupData.name || !popupData.type) {
            return res.status(400).json({
                code: 1,
                message: '弹窗名称和类型不能为空'
            });
        }

        // 验证类型
        if (!['ad', 'notice', 'promotion'].includes(popupData.type)) {
            return res.status(400).json({
                code: 1,
                message: '类型必须是ad、notice或promotion之一'
            });
        }

        // 验证频率
        if (!['once', 'daily', 'session', 'always'].includes(popupData.frequency)) {
            return res.status(400).json({
                code: 1,
                message: '频率必须是once、daily、session或always之一'
            });
        }

        // 处理图片上传
        let imageUrl = '';
        if (req.file) {
            imageUrl = `/uploads/popups/${req.file.filename}`;
        }

        // 处理显示条件
        let conditions = {};
        if (popupData.conditions) {
            try {
                conditions = JSON.parse(popupData.conditions);
            } catch (e) {
                console.warn('条件格式不正确，使用默认值');
            }
        }

        const popup = await Popup.create({
            name: popupData.name,
            type: popupData.type,
            frequency: popupData.frequency || 'once',
            startTime: popupData.startTime ? new Date(popupData.startTime) : null,
            endTime: popupData.endTime ? new Date(popupData.endTime) : null,
            link: popupData.link || '',
            imageUrl: imageUrl,
            conditions: conditions,
            status: popupData.status || 'active'
        });

        res.json({
            code: 0,
            message: '创建成功',
            data: popup
        });
    } catch (error) {
        console.error('创建弹窗失败:', error);
        res.status(500).json({
            code: 1,
            message: '创建弹窗失败'
        });
    }
});

// 更新弹窗
router.put('/:id', authenticateToken, upload.single('image'), async (req, res) => {
    try {
        const { id } = req.params;
        const popupData = req.body;

        const popup = await Popup.findByPk(id);
        if (!popup) {
            return res.status(404).json({
                code: 1,
                message: '弹窗不存在'
            });
        }

        // 处理图片上传
        let imageUrl = popup.imageUrl;
        if (req.file) {
            // 删除旧图片
            if (popup.imageUrl) {
                const oldImagePath = path.join(__dirname, '../public', popup.imageUrl);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }
            imageUrl = `/uploads/popups/${req.file.filename}`;
        }

        // 处理显示条件
        let conditions = popup.conditions || {};
        if (popupData.conditions) {
            try {
                conditions = JSON.parse(popupData.conditions);
            } catch (e) {
                console.warn('条件格式不正确，保持原值');
            }
        }

        // 更新弹窗
        await popup.update({
            name: popupData.name || popup.name,
            type: popupData.type || popup.type,
            frequency: popupData.frequency || popup.frequency,
            startTime: popupData.startTime ? new Date(popupData.startTime) : popup.startTime,
            endTime: popupData.endTime ? new Date(popupData.endTime) : popup.endTime,
            link: popupData.link !== undefined ? popupData.link : popup.link,
            imageUrl: imageUrl,
            conditions: conditions,
            status: popupData.status !== undefined ? popupData.status : popup.status
        });

        res.json({
            code: 0,
            message: '更新成功',
            data: popup
        });
    } catch (error) {
        console.error('更新弹窗失败:', error);
        res.status(500).json({
            code: 1,
            message: '更新弹窗失败'
        });
    }
});

// 删除弹窗
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const popup = await Popup.findByPk(id);
        if (!popup) {
            return res.status(404).json({
                code: 1,
                message: '弹窗不存在'
            });
        }

        // 删除图片文件
        if (popup.imageUrl) {
            const imagePath = path.join(__dirname, '../public', popup.imageUrl);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }

        await popup.destroy();

        res.json({
            code: 0,
            message: '删除成功'
        });
    } catch (error) {
        console.error('删除弹窗失败:', error);
        res.status(500).json({
            code: 1,
            message: '删除弹窗失败'
        });
    }
});

// 获取前端展示的弹窗列表（无需认证）
router.get('/public/active', async (req, res) => {
    try {
        const now = new Date();

        const popups = await Popup.findAll({
            where: {
                status: 'active',
                [Op.or]: [
                    { startTime: null },
                    { startTime: { [Op.lte]: now } }
                ],
                [Op.or]: [
                    { endTime: null },
                    { endTime: { [Op.gte]: now } }
                ]
            },
            order: [['createdAt', 'DESC']]
        });

        res.json({
            code: 0,
            message: '获取成功',
            data: popups
        });
    } catch (error) {
        console.error('获取前端弹窗失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取前端弹窗失败'
        });
    }
});

module.exports = router;