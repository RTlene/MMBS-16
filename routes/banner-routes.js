const express = require('express');
const { Op } = require('sequelize');
const { Banner } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { compressImage } = require('../utils/imageCompress');

const router = express.Router();

// 配置multer用于文件上传
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '../public/uploads/banners');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'banner-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// 文件大小限制：10MB（横幅图片通常需要较高分辨率）
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: MAX_FILE_SIZE
    },
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('只允许上传图片文件'), false);
        }
    }
});

// 错误处理中间件：捕获 Multer 错误
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                code: 1,
                message: `文件大小超过限制，最大允许 ${MAX_FILE_SIZE / 1024 / 1024}MB`
            });
        } else if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                code: 1,
                message: '文件数量超过限制'
            });
        } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
                code: 1,
                message: '不支持的文件字段'
            });
        } else {
            return res.status(400).json({
                code: 1,
                message: `文件上传错误: ${err.message}`
            });
        }
    } else if (err) {
        // 其他错误（如 fileFilter 中的错误）
        return res.status(400).json({
            code: 1,
            message: err.message || '文件上传失败'
        });
    }
    next();
};

const POSITION_MAP = {
    homepage: 1,
    activity: 5,   // 首页活动横幅轮播（首图下方）
    product: 2,
    category: 3,
    member: 4
};

const POSITION_MAP_REVERSE = Object.entries(POSITION_MAP).reduce((acc, [key, value]) => {
    acc[value] = key;
    return acc;
}, {});

// 统一格式化横幅返回数据，兼容旧字段
const formatBannerResponse = (bannerInstance) => {
    const banner = bannerInstance?.toJSON ? bannerInstance.toJSON() : bannerInstance;
    return {
        id: banner.id,
        name: banner.name || banner.title || '',
        title: banner.title || '',
        position: typeof banner.position === 'string'
            ? banner.position
            : (POSITION_MAP_REVERSE[banner.position] || banner.position),
        sort: banner.sort ?? banner.order ?? 0,
        status: banner.status,
        startTime: banner.startTime,
        endTime: banner.endTime,
        linkType: banner.linkType || (banner.linkUrl ? 'external' : 'custom'),
        linkTarget: banner.linkTarget || banner.linkUrl || '',
        link: banner.link ?? banner.linkUrl ?? '',
        linkUrl: banner.linkUrl ?? banner.link ?? '',
        imageUrl: banner.imageUrl,
        createdAt: banner.createdAt,
        updatedAt: banner.updatedAt
    };
};

// 获取横幅统计
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const total = await Banner.count();
        const active = await Banner.count({ where: { status: 'active' } });
        const homepage = await Banner.count({ where: { position: POSITION_MAP.homepage } });
        const activity = await Banner.count({ where: { position: POSITION_MAP.activity } });
        const product = await Banner.count({ where: { position: POSITION_MAP.product } });

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                total,
                active,
                homepage,
                activity,
                product
            }
        });
    } catch (error) {
        console.error('获取横幅统计失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取横幅统计失败'
        });
    }
});

// 获取横幅列表
router.get('/', authenticateToken, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            position = '',
            status = '',
            sortBy = 'sort',
            sortOrder = 'ASC'
        } = req.query;

        const offset = (page - 1) * limit;
        const where = {};

        // 搜索条件
        if (search && search.trim()) {
            where[Op.or] = [
                { title: { [Op.like]: `%${search.trim()}%` } }
            ];
        }

        // 位置筛选（只处理非空值）
        if (position && position.trim()) {
            const positionValue = POSITION_MAP[position.trim()] ?? position.trim();
            // 如果是数字字符串，转换为数字
            if (!isNaN(positionValue)) {
                where.position = parseInt(positionValue);
            } else {
                where.position = positionValue;
            }
        }

        // 状态筛选（只处理非空值）
        if (status && status.trim()) {
            where.status = status.trim();
        }

        console.log('[Banner] 查询轮播图列表，条件:', JSON.stringify(where), 'page:', page, 'limit:', limit);

        const { count, rows } = await Banner.findAndCountAll({
            where,
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [[sortBy, sortOrder.toUpperCase()]]
        });

        console.log(`[Banner] 查询结果: 找到 ${count} 条记录，返回 ${rows.length} 条`);

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                banners: rows.map(formatBannerResponse),
                total: count,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page)
            }
        });
    } catch (error) {
        console.error('[Banner] 获取横幅列表失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取横幅列表失败',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// 获取前端展示的横幅列表（无需认证）
router.get('/public/:position', async (req, res) => {
    try {
        const { position } = req.params;
        const now = new Date();
        const positionValue = POSITION_MAP[position] ?? position;

        const banners = await Banner.findAll({
            where: {
                position: positionValue,
                status: 'active',
                [Op.and]: [
                    {
                        [Op.or]: [
                            { startTime: null },
                            { startTime: { [Op.lte]: now } }
                        ]
                    },
                    {
                        [Op.or]: [
                            { endTime: null },
                            { endTime: { [Op.gte]: now } }
                        ]
                    }
                ]
            },
            order: [['sort', 'ASC'], ['createdAt', 'DESC']]
        });
        
        console.log(`[Banner] 查询首页轮播图: position=${positionValue}, 找到 ${banners.length} 条记录`);

        res.json({
            code: 0,
            message: '获取成功',
            data: banners.map(formatBannerResponse)
        });
    } catch (error) {
        console.error('获取前端横幅失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取前端横幅失败'
        });
    }
});

// 获取单个横幅
router.get('/:id(\\d+)', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const banner = await Banner.findByPk(id);

        if (!banner) {
            return res.status(404).json({
                code: 1,
                message: '横幅不存在'
            });
        }

        res.json({
            code: 0,
            message: '获取成功',
            data: formatBannerResponse(banner)
        });
    } catch (error) {
        console.error('获取横幅失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取横幅失败'
        });
    }
});

// 创建横幅
router.post('/', authenticateToken, upload.single('image'), handleMulterError, async (req, res) => {
    try {
        const bannerData = req.body;

        // 数据验证
        const resolvedTitle = bannerData.title || bannerData.name;
        if (!resolvedTitle) {
            return res.status(400).json({
                code: 1,
                message: '横幅标题不能为空'
            });
        }
        if (!bannerData.position) {
            return res.status(400).json({
                code: 1,
                message: '横幅位置不能为空'
            });
        }

        // 验证位置
        if (!['homepage', 'activity', 'product', 'category', 'member'].includes(bannerData.position)) {
            return res.status(400).json({
                code: 1,
                message: '位置必须是homepage、activity、product、category或member之一'
            });
        }

        // 处理图片上传和压缩
        let imageUrl = '';
        if (req.file) {
            const filePath = path.join(__dirname, '../public/uploads/banners', req.file.filename);
            
            // 压缩图片
            try {
                const compressResult = await compressImage(filePath, null, {
                    quality: 85,
                    maxWidth: 1920,
                    maxHeight: 1080,
                    keepOriginal: false
                });
                
                if (compressResult.success && !compressResult.skipped) {
                    console.log(`[Banner] 图片压缩成功: ${req.file.filename}, 原始: ${(compressResult.originalSize / 1024).toFixed(2)}KB, 压缩后: ${(compressResult.compressedSize / 1024).toFixed(2)}KB, 节省: ${compressResult.savedPercent}%`);
                }
            } catch (error) {
                console.error(`[Banner] 图片压缩失败: ${req.file.filename}`, error);
            }
            
            imageUrl = `/uploads/banners/${req.file.filename}`;
        }

        const PRIMARY_POSITIONS = {
            homepage: 1,
            product: 2,
            category: 3,
            member: 4
        };

        const linkType = bannerData.linkType || 'external';
        const linkTarget = bannerData.linkTarget || bannerData.link || bannerData.linkUrl || '';

        const banner = await Banner.create({
            title: resolvedTitle,
            position: POSITION_MAP[bannerData.position] ?? bannerData.position,
            sort: bannerData.sort !== undefined ? parseInt(bannerData.sort, 10) || 0 : 0,
            startTime: bannerData.startTime ? new Date(bannerData.startTime) : null,
            endTime: bannerData.endTime ? new Date(bannerData.endTime) : null,
            linkType,
            linkTarget,
            linkUrl: linkType === 'external' ? linkTarget : '',
            imageUrl: imageUrl,
            status: bannerData.status || 'active'
        });

        res.json({
            code: 0,
            message: '创建成功',
            data: formatBannerResponse(banner)
        });
    } catch (error) {
        console.error('创建横幅失败:', error);
        res.status(500).json({
            code: 1,
            message: '创建横幅失败'
        });
    }
});

// 更新横幅
router.put('/:id', authenticateToken, upload.single('image'), handleMulterError, async (req, res) => {
    try {
        const { id } = req.params;
        const bannerData = req.body;

        const banner = await Banner.findByPk(id);
        if (!banner) {
            return res.status(404).json({
                code: 1,
                message: '横幅不存在'
            });
        }

        // 处理图片上传
        let imageUrl = banner.imageUrl;
        if (req.file) {
            // 删除旧图片
            if (banner.imageUrl) {
                const oldImagePath = path.join(__dirname, '../public', banner.imageUrl);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }
            imageUrl = `/uploads/banners/${req.file.filename}`;
        }

        const resolvedTitle = bannerData.title || bannerData.name || banner.title;
        const linkType = bannerData.linkType || banner.linkType || 'external';
        const linkTarget = bannerData.linkTarget !== undefined
            ? bannerData.linkTarget
            : (bannerData.link !== undefined ? bannerData.link : (bannerData.linkUrl !== undefined ? bannerData.linkUrl : banner.linkTarget));

        // 更新横幅
        await banner.update({
            title: resolvedTitle,
            position: bannerData.position
                ? (POSITION_MAP[bannerData.position] ?? bannerData.position)
                : banner.position,
            sort: bannerData.sort !== undefined ? parseInt(bannerData.sort, 10) : banner.sort,
            startTime: bannerData.startTime ? new Date(bannerData.startTime) : banner.startTime,
            endTime: bannerData.endTime ? new Date(bannerData.endTime) : banner.endTime,
            linkType,
            linkTarget,
            linkUrl: linkType === 'external' ? linkTarget : '',
            imageUrl: imageUrl,
            status: bannerData.status !== undefined ? bannerData.status : banner.status
        });

        res.json({
            code: 0,
            message: '更新成功',
            data: formatBannerResponse(banner)
        });
    } catch (error) {
        console.error('更新横幅失败:', error);
        res.status(500).json({
            code: 1,
            message: '更新横幅失败'
        });
    }
});

// 删除横幅
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const banner = await Banner.findByPk(id);
        if (!banner) {
            return res.status(404).json({
                code: 1,
                message: '横幅不存在'
            });
        }

        // 删除图片文件
        if (banner.imageUrl) {
            const imagePath = path.join(__dirname, '../public', banner.imageUrl);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }

        await banner.destroy();

        res.json({
            code: 0,
            message: '删除成功'
        });
    } catch (error) {
        console.error('删除横幅失败:', error);
        res.status(500).json({
            code: 1,
            message: '删除横幅失败'
        });
    }
});

module.exports = router;