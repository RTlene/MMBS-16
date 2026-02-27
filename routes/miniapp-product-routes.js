const express = require('express');
const { Op, Sequelize } = require('sequelize');
const { Product, Category, ProductSKU, ProductAttribute, sequelize } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { optionalAuthenticate } = require('../middleware/miniapp-auth');
const PromotionService = require('../services/promotionService');

const router = express.Router();

// 获取商品列表（小程序端）
router.get('/products', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            categoryId = '',
            keyword = '',
            sortBy = 'createdAt',
            sortOrder = 'DESC',
            minPrice = '',
            maxPrice = '',
            status = 'active',
            isHot = ''
        } = req.query;

        const offset = (page - 1) * limit;
        const where = { status };

        // 热门商品筛选
        if (isHot === 'true' || isHot === true) {
            where.isHot = true;
        }

        // 分类筛选
        if (categoryId) {
            const categoryIdNum = parseInt(categoryId);
            if (!isNaN(categoryIdNum)) {
                where.categoryId = categoryIdNum;
            }
        }

        // 关键词搜索
        if (keyword) {
            where[Op.or] = [
                { name: { [Op.like]: `%${keyword}%` } },
                { description: { [Op.like]: `%${keyword}%` } },
                { brand: { [Op.like]: `%${keyword}%` } }
            ];
        }

        // 价格筛选（注意：Product模型没有price字段，价格在SKU中，这里暂时不处理）
        // if (minPrice || maxPrice) {
        //     where.price = {};
        //     if (minPrice) where.price[Op.gte] = parseFloat(minPrice);
        //     if (maxPrice) where.price[Op.lte] = parseFloat(maxPrice);
        // }

        // 排序
        const order = [];
        if (isHot === 'true' || isHot === true) {
            // 热门商品按排序值、创建时间排序
            order.push(['sortOrder', 'ASC']);
            order.push(['createdAt', 'DESC']);
        } else if (sortBy === 'price') {
            // 价格排序需要从SKU中获取，这里暂时按创建时间排序
            order.push(['createdAt', sortOrder.toUpperCase()]);
        } else if (sortBy === 'sales') {
            // Product模型没有sales字段，按创建时间排序
            order.push(['createdAt', 'DESC']);
        } else {
            order.push([sortBy, sortOrder.toUpperCase()]);
        }

        const { count, rows } = await Product.findAndCountAll({
            where,
            include: [
                { 
                    model: Category, 
                    as: 'category', 
                    attributes: ['id', 'name'],
                    required: false
                },
                {
                    model: ProductSKU,
                    as: 'skus',
                    attributes: ['id', 'sku', 'name', 'price', 'stock', 'images', 'status'],
                    where: { status: 'active' },
                    required: false
                }
            ],
            limit: parseInt(limit),
            offset: parseInt(offset),
            order,
            distinct: true
        });

        // 处理商品数据，适配小程序展示
        const products = rows.map(product => {
            // 从SKU中获取最低价格和库存
            const activeSkus = (product.skus || []).filter(sku => sku && sku.status === 'active');
            const primarySku = getSkuWithMostStock(activeSkus);
            const displayPrice = primarySku ? parseFloat(primarySku.price) || 0 : 0;
            const totalStock = activeSkus.reduce((sum, sku) => sum + (parseInt(sku.stock) || 0), 0);
            
            // 如果商品有图片，确保是数组格式
            let productImages = product.images || [];
            if (typeof productImages === 'string') {
                try {
                    productImages = JSON.parse(productImages);
                } catch (e) {
                    productImages = [productImages];
                }
            }
            if (!Array.isArray(productImages)) {
                productImages = [];
            }
            
            return {
                id: product.id,
                name: product.name,
                description: product.description,
                images: productImages,
                price: displayPrice, // 使用库存最多的SKU价格
                originalPrice: null, // Product模型没有originalPrice字段
                brand: product.brand,
                category: product.category ? {
                    id: product.category.id,
                    name: product.category.name
                } : null,
                skus: activeSkus.map(sku => ({
                    id: sku.id,
                    sku: sku.sku,
                    name: sku.name,
                    price: parseFloat(sku.price) || 0,
                    stock: parseInt(sku.stock) || 0,
                    images: (sku.images && Array.isArray(sku.images)) ? sku.images : []
                })),
                stock: totalStock,
                sales: 0, // Product模型没有sales字段，可以根据订单统计
                isFeatured: product.isFeatured || false,
                isHot: product.isHot || false,
                status: product.status,
                createdAt: product.createdAt
            };
        });

        // 数据库为空时正常返回空数组，不是错误
        res.json({
            code: 0,
            message: '获取成功',
            data: {
                products: products || [],
                total: count || 0,
                totalPages: Math.ceil((count || 0) / limit),
                currentPage: parseInt(page),
                hasMore: parseInt(page) < Math.ceil((count || 0) / limit)
            }
        });
    } catch (error) {
        console.error('获取商品列表失败:', error);
        
        // 区分数据库连接错误和其他错误
        const isConnectionError = error.name === 'SequelizeConnectionError' || 
                                  error.name === 'SequelizeConnectionRefusedError' ||
                                  error.message.includes('ECONNREFUSED') ||
                                  error.message.includes('connect');
        
        res.status(500).json({
            code: 1,
            message: isConnectionError ? '数据库连接失败，请稍后重试' : '获取商品列表失败',
            error: error.message,
            errorType: isConnectionError ? 'connection_error' : 'server_error'
        });
    }
});

// 获取推荐商品（小程序端）- 必须在 /products/:id 之前定义
router.get('/products/recommended', async (req, res) => {
    try {
        const { limit = 10, type = 'featured' } = req.query;

        let where = { status: 'active' };
        
        if (type === 'featured') {
            where.isFeatured = true;
        } else if (type === 'hot') {
            where.isHot = true;
        }

        const products = await Product.findAll({
            where,
            include: [
                { 
                    model: Category, 
                    as: 'category', 
                    attributes: ['id', 'name']
                },
                {
                    model: ProductSKU,
                    as: 'skus',
                    attributes: ['id', 'price', 'images', 'stock', 'status'],
                    where: { status: 'active' },
                    required: false
                }
            ],
            limit: parseInt(limit),
            order: [['sortOrder', 'ASC'], ['createdAt', 'DESC']]
        });

        // 处理推荐商品数据
        const recommendedProducts = products.map(product => {
            const activeSkus = (product.skus || []).filter(sku => sku && sku.status === 'active');
            const primarySku = getSkuWithMostStock(activeSkus);
            return {
                id: product.id,
                name: product.name,
                images: product.images || [],
                price: primarySku ? parseFloat(primarySku.price) || 0 : 0,
                originalPrice: product.originalPrice,
                category: product.category ? {
                    id: product.category.id,
                    name: product.category.name
                } : null,
                sku: primarySku ? {
                    id: primarySku.id,
                    price: primarySku.price,
                    images: primarySku.images || []
                } : null,
                sales: product.sales || 0,
                isFeatured: product.isFeatured
            };
        });

        // 数据库为空时正常返回空数组，不是错误
        res.json({
            code: 0,
            message: '获取成功',
            data: { products: recommendedProducts || [] }
        });
    } catch (error) {
        console.error('获取推荐商品失败:', error);
        
        // 区分数据库连接错误和其他错误
        const isConnectionError = error.name === 'SequelizeConnectionError' || 
                                  error.name === 'SequelizeConnectionRefusedError' ||
                                  error.message.includes('ECONNREFUSED') ||
                                  error.message.includes('connect');
        
        res.status(500).json({
            code: 1,
            message: isConnectionError ? '数据库连接失败，请稍后重试' : '获取推荐商品失败',
            error: error.message,
            errorType: isConnectionError ? 'connection_error' : 'server_error'
        });
    }
});

// 搜索商品（小程序端）- 必须在 /products/:id 之前定义
router.get('/products/search', async (req, res) => {
    try {
        const {
            keyword = '',
            page = 1,
            limit = 20,
            categoryId = '',
            sortBy = 'relevance'
        } = req.query;

        if (!keyword.trim()) {
            return res.status(400).json({
                code: 1,
                message: '搜索关键词不能为空'
            });
        }

        const offset = (page - 1) * limit;
        const where = {
            status: 'active',
            [Op.or]: [
                { name: { [Op.like]: `%${keyword}%` } },
                { description: { [Op.like]: `%${keyword}%` } },
                { brand: { [Op.like]: `%${keyword}%` } }
            ]
        };

        if (categoryId) {
            where.categoryId = categoryId;
        }

        // 排序逻辑
        let order = [];
        if (sortBy === 'relevance') {
            // 按相关性排序（名称匹配度高的在前）
            const escapedKeyword = keyword.replace(/'/g, "\\'");
            order.push([
                Sequelize.literal(`CASE 
                    WHEN \`Product\`.\`name\` LIKE '%${escapedKeyword}%' THEN 1 
                    WHEN \`Product\`.\`description\` LIKE '%${escapedKeyword}%' THEN 2 
                    WHEN \`Product\`.\`brand\` LIKE '%${escapedKeyword}%' THEN 3 
                    ELSE 4 
                END`)
            ]);
        } else if (sortBy === 'price') {
            order.push(['price', 'ASC']);
        } else if (sortBy === 'sales') {
            order.push(['sales', 'DESC']);
        } else {
            order.push(['createdAt', 'DESC']);
        }

        const { count, rows } = await Product.findAndCountAll({
            where,
            include: [
                { 
                    model: Category, 
                    as: 'category', 
                    attributes: ['id', 'name']
                },
                {
                    model: ProductSKU,
                    as: 'skus',
                    attributes: ['id', 'price', 'images', 'stock', 'status'],
                    where: { status: 'active' },
                    required: false
                }
            ],
            limit: parseInt(limit),
            offset: parseInt(offset),
            order,
            distinct: true
        });

        // 处理搜索结果
        const searchResults = rows.map(product => {
            const activeSkus = (product.skus || []).filter(sku => sku && sku.status === 'active');
            const primarySku = getSkuWithMostStock(activeSkus);
            return {
                id: product.id,
                name: product.name,
                description: product.description,
                images: product.images || [],
                price: primarySku ? parseFloat(primarySku.price) || 0 : 0,
                originalPrice: product.originalPrice,
                brand: product.brand,
                category: product.category ? {
                    id: product.category.id,
                    name: product.category.name
                } : null,
                sku: primarySku ? {
                    id: primarySku.id,
                    price: primarySku.price,
                    images: primarySku.images || []
                } : null,
                sales: product.sales || 0
            };
        });

        res.json({
            code: 0,
            message: '搜索成功',
            data: {
                products: searchResults,
                total: count,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page),
                hasMore: parseInt(page) < Math.ceil(count / limit),
                keyword
            }
        });
    } catch (error) {
        console.error('搜索商品失败:', error);
        res.status(500).json({
            code: 1,
            message: '搜索商品失败',
            error: error.message
        });
    }
});

// 分段加载路由 - 必须放在 /products/:id 之前，因为更具体的路由要优先匹配

// 获取商品详情图（分段加载）
router.get('/products/:id/detail-images', async (req, res) => {
    const start = Date.now();
    const requestId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    
    // 设置响应超时
    const timeout = setTimeout(() => {
        if (!res.headersSent) {
            console.error(`[DetailImages] [${requestId}] 响应超时: productId=${req.params.id}`);
            res.status(504).json({
                code: 1,
                message: '请求超时'
            });
        }
    }, 25000); // 25秒超时
    
    try {
        const { id } = req.params;
        console.log(`[DetailImages] [${requestId}] 收到请求: productId=${id}`);
        
        // 使用原始SQL查询，只获取JSON字段，避免Sequelize序列化开销
        const [results] = await sequelize.query(
            'SELECT `id`, `detailImages`, `images` FROM `Products` WHERE `id` = :id LIMIT 1',
            {
                replacements: { id: parseInt(id) },
                type: sequelize.QueryTypes.SELECT
            }
        );
        
        if (!results || !results.id) {
            clearTimeout(timeout);
            console.log(`[DetailImages] [${requestId}] 商品不存在: productId=${id}`);
            return res.status(404).json({
                code: 1,
                message: '商品不存在'
            });
        }
        
        // 解析JSON字段
        let detailImages = [];
        let images = [];
        
        const parseJsonField = (value, fieldName) => {
            if (!value) return [];
            try {
                if (Buffer.isBuffer(value)) {
                    return JSON.parse(value.toString('utf8'));
                }
                if (typeof value === 'string') {
                    return JSON.parse(value);
                }
                if (Array.isArray(value)) return value;
                return [];
            } catch (err) {
                console.warn(`[DetailImages] [${requestId}] JSON解析失败 (${fieldName}):`, err);
                return [];
            }
        };

        detailImages = parseJsonField(results.detailImages, 'detailImages');
        images = parseJsonField(results.images, 'images');

        // 若无详情图但有主图，用主图兜底，避免前端空列表
        if (detailImages.length === 0 && images.length > 0) {
            console.log(`[DetailImages] [${requestId}] detailImages为空，使用images兜底，count=${images.length}`);
            detailImages = images;
        }
        
        const duration = Date.now() - start;
        clearTimeout(timeout);
        
        console.log(`[DetailImages] [${requestId}] 成功: productId=${id}, detailImages=${detailImages.length}, images=${images.length}, duration=${duration}ms`);
        if (detailImages.length === 0 && images.length === 0) {
            console.warn(`[DetailImages] [${requestId}] 警告：detailImages 与 images 皆为空，检查数据库字段存储`);
        }
        
        // 返回详情图和主图（用于详情页展示）
        res.json({
            code: 0,
            message: '获取成功',
            data: {
                detailImages: detailImages,
                images: images
            }
        });
    } catch (error) {
        clearTimeout(timeout);
        const duration = Date.now() - start;
        console.error(`[DetailImages] [${requestId}] 失败: duration=${duration}ms`, error);
        
        if (!res.headersSent) {
            res.status(500).json({
                code: 1,
                message: '获取商品详情图失败',
                error: error.message
            });
        }
    }
});

// 获取商品SKU图片（分段加载）
router.get('/products/:id/sku-images', async (req, res) => {
    const start = Date.now();
    const requestId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    try {
        const { id } = req.params;
        const { skuIds } = req.query; // 可选：指定SKU ID列表，用逗号分隔
        
        console.log(`[SkuImages] [${requestId}] 收到请求: productId=${id}, skuIds=${skuIds || 'all'}`);
        
        const where = {
            productId: id,
            status: 'active'
        };
        
        // 如果指定了SKU IDs，只返回这些SKU的图片
        if (skuIds) {
            const skuIdArray = skuIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
            if (skuIdArray.length > 0) {
                where.id = { [Op.in]: skuIdArray };
                console.log(`[SkuImages] [${requestId}] 过滤SKU IDs:`, skuIdArray);
            }
        }
        
        const skus = await ProductSKU.findAll({
            where,
            attributes: ['id', 'images'],
            limit: 50 // 限制最多50个SKU
        });
        
        // 构建SKU图片映射
        const skuImagesMap = {};
        skus.forEach(sku => {
            if (sku.images && Array.isArray(sku.images) && sku.images.length > 0) {
                skuImagesMap[sku.id] = sku.images;
            }
        });
        
        const duration = Date.now() - start;
        console.log(`[SkuImages] [${requestId}] 成功: productId=${id}, skuCount=${skus.length}, imagesCount=${Object.keys(skuImagesMap).length}, duration=${duration}ms`);
        
        res.json({
            code: 0,
            message: '获取成功',
            data: {
                skuImages: skuImagesMap
            }
        });
    } catch (error) {
        const duration = Date.now() - start;
        console.error(`[SkuImages] [${requestId}] 失败: duration=${duration}ms`, error);
        res.status(500).json({
            code: 1,
            message: '获取商品SKU图片失败',
            error: error.message
        });
    }
});

// 获取商品详情（应用运营工具）- 必须放在 /products/:id 之前，因为更具体的路由要优先匹配
router.get('/products/:id/detail', optionalAuthenticate, async (req, res) => {
    const start = Date.now();
    const requestId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    console.log(`[ProductDetail] [${requestId}] 收到请求: productId=${req.params.id}, memberId=${req.query.memberId}, skuId=${req.query.skuId || ''}, quantity=${req.query.quantity || 1}`);
    console.log(`[ProductDetail] [${requestId}] 请求URL: ${req.originalUrl}, 请求方法: ${req.method}`);
    console.log(`[ProductDetail] [${requestId}] 请求头:`, JSON.stringify(req.headers));
    
    try {
        const { id } = req.params;
        const { memberId, skuId, quantity = 1 } = req.query;

        console.log(`[ProductDetail] [${requestId}] 开始处理: id=${id}, memberId=${memberId}, skuId=${skuId || ''}, quantity=${quantity}`);

        if (!memberId) {
            console.log(`[ProductDetail] [${requestId}] 缺少会员ID，返回400`);
            return res.status(400).json({
                code: 1,
                message: '缺少会员ID'
            });
        }

        console.log(`[ProductDetail] [${requestId}] 调用 PromotionService.getProductWithPromotions`);
        const serviceStartTime = Date.now();
        const productDetail = await PromotionService.getProductWithPromotions(
            parseInt(id),
            parseInt(memberId),
            skuId ? parseInt(skuId) : null,
            parseInt(quantity)
        );
        const serviceDuration = Date.now() - serviceStartTime;
        console.log(`[ProductDetail] [${requestId}] PromotionService 返回成功，耗时: ${serviceDuration}ms`);

        // 计算响应体大小（字节）
        const payloadSize = Buffer.byteLength(JSON.stringify(productDetail), 'utf8');
        const duration = Date.now() - start;
        console.log(`[ProductDetail] [${requestId}] 成功 productId=${id} memberId=${memberId} skuId=${skuId || ''} quantity=${quantity} size=${payloadSize}B duration=${duration}ms`);

        console.log(`[ProductDetail] [${requestId}] 准备发送响应，状态码: 200`);
        
        // 设置响应头，确保正确传输
        // 注意：不设置 Content-Length，让 Express 自动处理，避免计算错误
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        // 使用 chunked 传输编码，避免一次性发送大响应
        res.setHeader('Transfer-Encoding', 'chunked');
        
        // 记录响应发送前的状态
        const payloadSizeMB = (payloadSize / 1024 / 1024).toFixed(2);
        console.log(`[ProductDetail] [${requestId}] 响应头已设置，准备发送 ${payloadSize} 字节 (${payloadSizeMB} MB) 数据`);
        
        // 检查响应体大小，如果过大给出警告
        if (payloadSize > 2 * 1024 * 1024) {
            console.warn(`[ProductDetail] [${requestId}] ⚠️ 警告：响应体过大 (${payloadSizeMB} MB)，可能导致小程序端传输超时`);
            console.warn(`[ProductDetail] [${requestId}] ⚠️ 建议：优化响应数据，减少不必要字段，或考虑分页加载`);
        }
        
        const responseStartTime = Date.now();
        
        // 使用 try-catch 确保响应发送不会出错
        try {
            res.json({
                code: 0,
                message: '获取成功',
                data: productDetail
            });
            console.log(`[ProductDetail] [${requestId}] res.json() 已调用`);
        } catch (jsonError) {
            console.error(`[ProductDetail] [${requestId}] ❌ res.json() 调用失败:`, jsonError);
            throw jsonError;
        }
        
        // 监听响应完成事件
        res.on('finish', () => {
            const responseDuration = Date.now() - responseStartTime;
            console.log(`[ProductDetail] [${requestId}] ✅ 响应已完全发送到客户端，发送耗时: ${responseDuration}ms`);
        });
        
        res.on('close', () => {
            console.log(`[ProductDetail] [${requestId}] 客户端连接已关闭`);
        });
        
        res.on('error', (error) => {
            console.error(`[ProductDetail] [${requestId}] ❌ 响应发送错误:`, error);
        });
        
        console.log(`[ProductDetail] [${requestId}] res.json() 已调用，等待响应发送完成`);
    } catch (error) {
        const duration = Date.now() - start;
        console.error(`[ProductDetail] [${requestId}] 失败 duration=${duration}ms productId=${req.params.id} memberId=${req.query.memberId} skuId=${req.query.skuId || ''} quantity=${req.query.quantity || ''}`);
        console.error(`[ProductDetail] [${requestId}] 错误详情:`, error);
        console.error(`[ProductDetail] [${requestId}] 错误堆栈:`, error.stack);
        res.status(500).json({
            code: 1,
            message: '获取商品详情失败',
            error: error.message
        });
        console.log(`[ProductDetail] [${requestId}] 错误响应已发送`);
    }
});

// 获取商品详情（小程序端）- 放在 /products/:id/detail 之后
router.get('/products/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const product = await Product.findByPk(id, {
            include: [
                { 
                    model: Category, 
                    as: 'category', 
                    attributes: ['id', 'name', 'description']
                },
                {
                    model: ProductSKU,
                    as: 'skus',
                    where: { status: 'active' },
                    required: false,
                    order: [['sortOrder', 'ASC']]
                },
                {
                    model: ProductAttribute,
                    as: 'attributes',
                    required: false,
                    order: [['sortOrder', 'ASC']]
                }
            ]
        });

        if (!product) {
            return res.status(404).json({
                code: 1,
                message: '商品不存在'
            });
        }

        if (product.status !== 'active') {
            return res.status(404).json({
                code: 1,
                message: '商品已下架'
            });
        }

        // 处理商品详情数据
        const productDetail = {
            id: product.id,
            name: product.name,
            description: product.description,
            images: product.images || [],
            detailImages: product.detailImages || [],
            videos: product.videos || [],
            detailContent: product.detailContent,
            price: product.price,
            originalPrice: product.originalPrice,
            brand: product.brand,
            category: product.category ? {
                id: product.category.id,
                name: product.category.name,
                description: product.category.description
            } : null,
            skus: product.skus.map(sku => ({
                id: sku.id,
                sku: sku.sku,
                name: sku.name,
                price: sku.price,
                originalPrice: sku.originalPrice,
                stock: sku.stock,
                images: sku.images || [],
                attributes: sku.attributes || {},
                weight: sku.weight,
                dimensions: sku.dimensions
            })),
            attributes: product.attributes.map(attr => ({
                id: attr.id,
                name: attr.name,
                type: attr.type,
                options: attr.options || [],
                isRequired: attr.isRequired
            })),
            stock: product.stock || 0,
            sales: product.sales || 0,
            isFeatured: product.isFeatured,
            status: product.status,
            createdAt: product.createdAt,
            updatedAt: product.updatedAt
        };

        res.json({
            code: 0,
            message: '获取成功',
            data: { product: productDetail }
        });
    } catch (error) {
        console.error('获取商品详情失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取商品详情失败',
            error: error.message
        });
    }
});

// 获取商品分类（小程序端）；homepage=1 时仅返回“展示在首页”的分类
router.get('/categories', async (req, res) => {
    try {
        const { parentId, level = 0, homepage } = req.query;

        const where = { status: 'active' };
        if (homepage === '1' || homepage === 1) {
            where.showOnHomepage = true;
        }
        // 处理 parentId 参数，确保 null 值正确处理
        let parsedParentId = null;
        if (parentId !== undefined && parentId !== null && parentId !== 'null' && parentId !== '') {
            parsedParentId = parseInt(parentId);
            if (!isNaN(parsedParentId)) {
                where.parentId = parsedParentId;
            }
        } else {
            // 如果 parentId 为空，查询顶级分类（parentId 为 null）
            where.parentId = null;
        }

        const categories = await Category.findAll({
            where,
            attributes: ['id', 'name', 'description', 'parentId', 'sortOrder', 'icon', 'showOnHomepage'],
            order: [['sortOrder', 'ASC'], ['createdAt', 'ASC']]
        });

        // 构建分类树结构（如果 categories 为空数组，buildCategoryTree 会返回空数组）
        const categoryTree = buildCategoryTree(categories, parsedParentId);

        // 数据库为空时正常返回空数组，不是错误
        res.json({
            code: 0,
            message: '获取成功',
            data: { categories: Array.isArray(categoryTree) ? categoryTree : [] }
        });
    } catch (error) {
        console.error('获取商品分类失败:', error);
        console.error('错误详情:', error.stack);
        
        // 区分数据库连接错误和其他错误
        const isConnectionError = error.name === 'SequelizeConnectionError' || 
                                  error.name === 'SequelizeConnectionRefusedError' ||
                                  error.message.includes('ECONNREFUSED') ||
                                  error.message.includes('connect');
        
        res.status(500).json({
            code: 1,
            message: isConnectionError ? '数据库连接失败，请稍后重试' : '获取商品分类失败',
            error: error.message,
            errorType: isConnectionError ? 'connection_error' : 'server_error'
        });
    }
});

// 获取商品SKU详情（小程序端）
router.get('/products/:productId/skus', async (req, res) => {
    try {
        const { productId } = req.params;
        const { skuId = '' } = req.query;

        const where = { 
            productId,
            status: 'active'
        };

        if (skuId) {
            where.id = skuId;
        }

        const skus = await ProductSKU.findAll({
            where,
            attributes: ['id', 'sku', 'name', 'price', 'originalPrice', 'stock', 'images', 'attributes', 'weight', 'dimensions'],
            order: [['sortOrder', 'ASC']]
        });

        res.json({
            code: 0,
            message: '获取成功',
            data: { skus }
        });
    } catch (error) {
        console.error('获取商品SKU失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取商品SKU失败',
            error: error.message
        });
    }
});

// 构建分类树结构
function buildCategoryTree(categories, parentId = null) {
    const tree = [];
    
    categories.forEach(category => {
        if (category.parentId == parentId) {
            const children = buildCategoryTree(categories, category.id);
            const node = {
                id: category.id,
                name: category.name,
                description: category.description,
                parentId: category.parentId,
                sortOrder: category.sortOrder,
                icon: category.icon,
                showOnHomepage: category.showOnHomepage,
                children: children.length > 0 ? children : undefined
            };
            tree.push(node);
        }
    });
    
    return tree;
}

// 计算商品价格（应用运营工具）
router.post('/products/calculate-price', async (req, res) => {
    try {
        const { productId, skuId, quantity, memberId: memberIdRaw, appliedCoupons = [], appliedPromotions = [], pointUsage = null } = req.body;

        if (!productId || quantity == null || quantity === '') {
            return res.status(400).json({
                code: 1,
                message: '缺少必填参数'
            });
        }
        const memberId = memberIdRaw != null && memberIdRaw !== '' ? Number(memberIdRaw) : 0;
        // 归一化为数字数组，避免字符串或单值导致查询/校验异常
        const norm = (v) => (Array.isArray(v) ? v : (v != null ? [v] : [])).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
        const couponIds = norm(appliedCoupons);
        const promotionIds = norm(appliedPromotions);
        if (process.env.NODE_ENV !== 'production' || req.query.debug === '1') {
            console.log('[calculate-price] body appliedCoupons=', appliedCoupons, 'appliedPromotions=', appliedPromotions, '-> couponIds=', couponIds, 'promotionIds=', promotionIds);
        }

        const orderData = { productId, skuId, quantity };
        const finalOrderData = await PromotionService.applyPromotionsToOrder(
            orderData,
            memberId,
            couponIds,
            promotionIds,
            pointUsage
        );

        if (req.query.debug === '1') {
            console.log('[calculate-price] result totalAmount=', finalOrderData.totalAmount, 'discounts=', (finalOrderData.discounts || []).length, finalOrderData.discounts);
        }

        const originalAmount = Number(finalOrderData.originalAmount) || 0;
        const finalPrice = Number.isFinite(Number(finalOrderData.totalAmount)) ? Number(finalOrderData.totalAmount) : originalAmount;
        const savings = originalAmount - finalPrice;
        const savingsRate = originalAmount > 0 ? Math.round((savings / originalAmount) * 10000) / 100 : 0;

        res.json({
            code: 0,
            message: '计算成功',
            data: {
                pricing: {
                    originalAmount: finalOrderData.originalAmount,
                    finalPrice,
                    discounts: finalOrderData.discounts || [],
                    savings,
                    savingsRate
                },
                appliedCoupons: finalOrderData.appliedCoupons,
                appliedPromotions: finalOrderData.appliedPromotions,
                pointUsage: finalOrderData.pointUsage
            }
        });
    } catch (error) {
        console.error('计算价格失败:', error);
        res.status(500).json({
            code: 1,
            message: '计算价格失败',
            error: error.message
        });
    }
});

function getSkuWithMostStock(skus = []) {
    if (!Array.isArray(skus) || skus.length === 0) {
        return null;
    }

    return skus.reduce((best, sku) => {
        const currentStock = parseInt(sku.stock) || 0;
        if (!best) return sku;
        const bestStock = parseInt(best.stock) || 0;
        return currentStock > bestStock ? sku : best;
    }, null);
}

module.exports = router;