const express = require('express');
const { Op } = require('sequelize');
const { PointProduct, PointExchange, Member, PointRecord } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// 获取积分商城统计
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const totalProducts = await PointProduct.count();
        const totalExchanges = await PointExchange.count();
        const pendingExchanges = await PointExchange.count({ where: { status: 'pending' } });
        const totalPoints = await PointExchange.sum('points') || 0;

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                totalProducts,
                totalExchanges,
                pendingExchanges,
                totalPoints
            }
        });
    } catch (error) {
        console.error('获取积分商城统计失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取积分商城统计失败'
        });
    }
});

// 获取商品列表
router.get('/products', authenticateToken, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            category = '',
            status = '',
            sortBy = 'sortOrder',
            sortOrder = 'ASC'
        } = req.query;

        const offset = (page - 1) * limit;
        const where = {};

        // 搜索条件
        if (search) {
            where[Op.or] = [
                { name: { [Op.like]: `%${search}%` } },
                { description: { [Op.like]: `%${search}%` } }
            ];
        }

        if (category) {
            where.category = category;
        }

        if (status) {
            where.status = status;
        }

        const { count, rows } = await PointProduct.findAndCountAll({
            where,
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [[sortBy, sortOrder.toUpperCase()]]
        });

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                products: rows,
                total: count,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page)
            }
        });
    } catch (error) {
        console.error('获取商品列表失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取商品列表失败'
        });
    }
});

// 获取单个商品
router.get('/products/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const product = await PointProduct.findByPk(id);

        if (!product) {
            return res.status(404).json({
                code: 1,
                message: '商品不存在'
            });
        }

        res.json({
            code: 0,
            message: '获取成功',
            data: product
        });
    } catch (error) {
        console.error('获取商品失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取商品失败'
        });
    }
});

// 创建商品
router.post('/products', authenticateToken, async (req, res) => {
    try {
        const productData = req.body;

        // 数据验证
        if (!productData.name || !productData.points || !productData.stock) {
            return res.status(400).json({
                code: 1,
                message: '商品名称、所需积分和库存不能为空'
            });
        }

        const product = await PointProduct.create({
            name: productData.name,
            description: productData.description || '',
            imageUrl: productData.imageUrl || '',
            points: parseInt(productData.points),
            stock: parseInt(productData.stock),
            category: productData.category || 'digital',
            status: productData.status || 'active',
            sortOrder: parseInt(productData.sortOrder) || 0
        });

        res.json({
            code: 0,
            message: '创建成功',
            data: product
        });
    } catch (error) {
        console.error('创建商品失败:', error);
        res.status(500).json({
            code: 1,
            message: '创建商品失败'
        });
    }
});

// 更新商品
router.put('/products/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const productData = req.body;

        const product = await PointProduct.findByPk(id);
        if (!product) {
            return res.status(404).json({
                code: 1,
                message: '商品不存在'
            });
        }

        // 更新商品信息
        await product.update({
            name: productData.name,
            description: productData.description || '',
            imageUrl: productData.imageUrl || '',
            points: parseInt(productData.points),
            stock: parseInt(productData.stock),
            category: productData.category || 'digital',
            status: productData.status || 'active',
            sortOrder: parseInt(productData.sortOrder) || 0
        });

        res.json({
            code: 0,
            message: '更新成功',
            data: product
        });
    } catch (error) {
        console.error('更新商品失败:', error);
        res.status(500).json({
            code: 1,
            message: '更新商品失败'
        });
    }
});

// 删除商品
router.delete('/products/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const product = await PointProduct.findByPk(id);
        if (!product) {
            return res.status(404).json({
                code: 1,
                message: '商品不存在'
            });
        }

        // 检查是否有未完成的兑换记录
        const pendingExchanges = await PointExchange.count({
            where: {
                productId: id,
                status: { [Op.in]: ['pending', 'shipped'] }
            }
        });

        if (pendingExchanges > 0) {
            return res.status(400).json({
                code: 1,
                message: '该商品还有未完成的兑换记录，无法删除'
            });
        }

        await product.destroy();

        res.json({
            code: 0,
            message: '删除成功'
        });
    } catch (error) {
        console.error('删除商品失败:', error);
        res.status(500).json({
            code: 1,
            message: '删除商品失败'
        });
    }
});

// 获取兑换记录列表
router.get('/exchanges', authenticateToken, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            status = '',
            sortBy = 'createdAt',
            sortOrder = 'DESC'
        } = req.query;

        const offset = (page - 1) * limit;
        const where = {};

        // 搜索条件
        if (search) {
            where[Op.or] = [
                { memberId: { [Op.like]: `%${search}%` } },
                { '$product.name$': { [Op.like]: `%${search}%` } }
            ];
        }

        if (status) {
            where.status = status;
        }

        const { count, rows } = await PointExchange.findAndCountAll({
            where,
            include: [
                {
                    model: PointProduct,
                    as: 'product',
                    attributes: ['id', 'name', 'description', 'imageUrl', 'points']
                },
                {
                    model: Member,
                    as: 'member',
                    attributes: ['id', 'nickname', 'realName']
                }
            ],
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [[sortBy, sortOrder.toUpperCase()]]
        });

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                exchanges: rows,
                total: count,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page)
            }
        });
    } catch (error) {
        console.error('获取兑换记录失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取兑换记录失败'
        });
    }
});

// 获取单个兑换记录
router.get('/exchanges/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const exchange = await PointExchange.findByPk(id, {
            include: [
                {
                    model: PointProduct,
                    as: 'product',
                    attributes: ['id', 'name', 'description', 'imageUrl', 'points']
                },
                {
                    model: Member,
                    as: 'member',
                    attributes: ['id', 'nickname', 'realName']
                }
            ]
        });

        if (!exchange) {
            return res.status(404).json({
                code: 1,
                message: '兑换记录不存在'
            });
        }

        res.json({
            code: 0,
            message: '获取成功',
            data: exchange
        });
    } catch (error) {
        console.error('获取兑换记录失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取兑换记录失败'
        });
    }
});

// 更新兑换记录
router.put('/exchanges/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const exchangeData = req.body;

        const exchange = await PointExchange.findByPk(id);
        if (!exchange) {
            return res.status(404).json({
                code: 1,
                message: '兑换记录不存在'
            });
        }

        // 更新兑换记录
        const updateData = {
            status: exchangeData.status,
            trackingNumber: exchangeData.trackingNumber || null,
            shippingAddress: exchangeData.shippingAddress || null
        };

        // 如果状态变更为已发货，记录发货时间
        if (exchangeData.status === 'shipped' && exchange.status !== 'shipped') {
            updateData.shippedAt = new Date();
        }

        // 如果状态变更为已收货，记录收货时间
        if (exchangeData.status === 'delivered' && exchange.status !== 'delivered') {
            updateData.deliveredAt = new Date();
        }

        await exchange.update(updateData);

        res.json({
            code: 0,
            message: '更新成功',
            data: exchange
        });
    } catch (error) {
        console.error('更新兑换记录失败:', error);
        res.status(500).json({
            code: 1,
            message: '更新兑换记录失败'
        });
    }
});

// 会员兑换商品（前端接口）
router.post('/exchange', authenticateToken, async (req, res) => {
    try {
        const { productId, quantity = 1, shippingAddress } = req.body;
        const memberId = req.user.id; // 从认证中间件获取会员ID

        // 获取商品信息
        const product = await PointProduct.findByPk(productId);
        if (!product) {
            return res.status(404).json({
                code: 1,
                message: '商品不存在'
            });
        }

        if (product.status !== 'active') {
            return res.status(400).json({
                code: 1,
                message: '商品已下架'
            });
        }

        if (product.stock < quantity) {
            return res.status(400).json({
                code: 1,
                message: '库存不足'
            });
        }

        // 计算所需积分
        const totalPoints = product.points * quantity;

        // 检查会员积分是否足够
        const member = await Member.findByPk(memberId);
        if (!member) {
            return res.status(404).json({
                code: 1,
                message: '会员不存在'
            });
        }

        if (member.points < totalPoints) {
            return res.status(400).json({
                code: 1,
                message: '积分不足'
            });
        }

        // 开始事务
        const transaction = await sequelize.transaction();

        try {
            // 创建兑换记录
            const exchange = await PointExchange.create({
                memberId: memberId,
                productId: productId,
                points: totalPoints,
                quantity: quantity,
                status: 'pending',
                shippingAddress: shippingAddress
            }, { transaction });

            // 扣除会员积分
            await member.update({
                points: member.points - totalPoints
            }, { transaction });

            // 记录积分变化
            await PointRecord.create({
                memberId: memberId,
                points: -totalPoints,
                type: 'spend',
                source: 'point_exchange',
                description: `兑换商品：${product.name} x${quantity}`,
                orderId: exchange.id
            }, { transaction });

            // 更新商品库存
            await product.update({
                stock: product.stock - quantity,
                sold: product.sold + quantity
            }, { transaction });

            // 如果库存为0，更新状态为售罄
            if (product.stock - quantity === 0) {
                await product.update({
                    status: 'sold_out'
                }, { transaction });
            }

            await transaction.commit();

            res.json({
                code: 0,
                message: '兑换成功',
                data: exchange
            });
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (error) {
        console.error('兑换商品失败:', error);
        res.status(500).json({
            code: 1,
            message: '兑换商品失败'
        });
    }
});

module.exports = router;