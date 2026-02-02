const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { User, Product, ProductSKU, Order, OrderItem, VerificationCode } = require('../db');
const { authenticateStaff } = require('../middleware/staff-auth');
const router = express.Router();

// 员工登录（小程序端）
router.post('/staff/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                code: 1,
                message: '用户名和密码不能为空'
            });
        }

        const user = await User.findOne({ where: { username } });
        if (!user) {
            return res.status(401).json({
                code: 1,
                message: '用户名或密码错误'
            });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({
                code: 1,
                message: '用户名或密码错误'
            });
        }

        if (user.status !== 'active') {
            return res.status(401).json({
                code: 1,
                message: '账户已被禁用'
            });
        }

        // 生成JWT token（与后台使用相同的密钥）
        const token = jwt.sign(
            {
                id: user.id,
                username: user.username,
                role: user.role,
                type: 'staff' // 标记为员工token
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' } // 7天有效期
        );

        // 更新最后登录时间
        await user.update({ lastLogin: new Date() });

        res.json({
            code: 0,
            message: '登录成功',
            data: {
                token,
                staff: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role
                }
            }
        });
    } catch (error) {
        console.error('[Staff] 登录失败:', error);
        res.status(500).json({
            code: 1,
            message: '登录失败',
            error: error.message
        });
    }
});

// 获取商品列表（用于库存管理）
router.get('/staff/products', authenticateStaff, async (req, res) => {
    try {
        const { keyword = '', page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        const where = {
            status: 'active'
        };

        if (keyword) {
            where[Op.or] = [
                { name: { [Op.like]: `%${keyword}%` } },
                { description: { [Op.like]: `%${keyword}%` } }
            ];
        }

        const { count, rows } = await Product.findAndCountAll({
            where,
            include: [{
                model: ProductSKU,
                as: 'skus',
                where: { status: 'active' },
                required: false,
                attributes: ['id', 'name', 'sku', 'price', 'stock', 'status']
            }],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        const products = rows.map(product => ({
            id: product.id,
            name: product.name,
            images: product.images,
            skus: product.skus || [],
            totalStock: (product.skus || []).reduce((sum, sku) => sum + (sku.stock || 0), 0)
        }));

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                products,
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                hasMore: offset + rows.length < count
            }
        });
    } catch (error) {
        console.error('[Staff] 获取商品列表失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取商品列表失败',
            error: error.message
        });
    }
});

// 更新SKU库存
router.put('/staff/skus/:id/stock', authenticateStaff, async (req, res) => {
    try {
        const { id } = req.params;
        const { stock, operation = 'set' } = req.body; // operation: 'set' | 'add' | 'subtract'

        if (stock === undefined || stock === null) {
            return res.status(400).json({
                code: 1,
                message: '库存数量不能为空'
            });
        }

        const sku = await ProductSKU.findByPk(id);
        if (!sku) {
            return res.status(404).json({
                code: 1,
                message: 'SKU不存在'
            });
        }

        let newStock;
        if (operation === 'set') {
            newStock = parseInt(stock);
        } else if (operation === 'add') {
            newStock = (sku.stock || 0) + parseInt(stock);
        } else if (operation === 'subtract') {
            newStock = Math.max(0, (sku.stock || 0) - parseInt(stock));
        } else {
            return res.status(400).json({
                code: 1,
                message: '无效的操作类型'
            });
        }

        await sku.update({ stock: newStock });

        res.json({
            code: 0,
            message: '库存更新成功',
            data: {
                sku: {
                    id: sku.id,
                    name: sku.name,
                    stock: newStock
                }
            }
        });
    } catch (error) {
        console.error('[Staff] 更新库存失败:', error);
        res.status(500).json({
            code: 1,
            message: '更新库存失败',
            error: error.message
        });
    }
});

// 获取订单列表（用于发货管理）
router.get('/staff/orders', authenticateStaff, async (req, res) => {
    try {
        const { status = '', page = 1, limit = 20, keyword = '' } = req.query;
        const offset = (page - 1) * limit;

        const where = {};
        if (status) {
            where.status = status;
        }
        if (keyword) {
            where[Op.or] = [
                { orderNo: { [Op.like]: `%${keyword}%` } },
                { receiverName: { [Op.like]: `%${keyword}%` } },
                { receiverPhone: { [Op.like]: `%${keyword}%` } }
            ];
        }

        const { count, rows } = await Order.findAndCountAll({
            where,
            include: [{
                model: OrderItem,
                as: 'items',
                attributes: ['id', 'productName', 'skuName', 'quantity', 'unitPrice', 'totalAmount']
            }],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        const orders = rows.map(order => ({
            id: order.id,
            orderNo: order.orderNo,
            status: order.status,
            statusText: getOrderStatusText(order.status),
            totalAmount: parseFloat(order.totalAmount),
            receiverName: order.receiverName,
            receiverPhone: order.receiverPhone,
            shippingAddress: order.shippingAddress,
            shippingCompany: order.shippingCompany,
            trackingNumber: order.trackingNumber,
            shippedAt: order.shippedAt,
            items: order.items || [],
            createdAt: order.createdAt
        }));

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                orders,
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                hasMore: offset + rows.length < count
            }
        });
    } catch (error) {
        console.error('[Staff] 获取订单列表失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取订单列表失败',
            error: error.message
        });
    }
});

// 订单发货
router.put('/staff/orders/:id/ship', authenticateStaff, async (req, res) => {
    try {
        const { id } = req.params;
        const { shippingCompany, trackingNumber, shippingMethod } = req.body;

        if (!shippingCompany || !trackingNumber) {
            return res.status(400).json({
                code: 1,
                message: '物流公司和物流单号不能为空'
            });
        }

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({
                code: 1,
                message: '订单不存在'
            });
        }

        if (order.status !== 'paid') {
            return res.status(400).json({
                code: 1,
                message: '只有已支付的订单才能发货'
            });
        }

        await order.update({
            status: 'shipped',
            shippingCompany,
            trackingNumber,
            shippingMethod: shippingMethod || 'express',
            shippedAt: new Date()
        });

        res.json({
            code: 0,
            message: '发货成功',
            data: {
                order: {
                    id: order.id,
                    orderNo: order.orderNo,
                    status: 'shipped',
                    shippingCompany,
                    trackingNumber,
                    shippedAt: new Date()
                }
            }
        });
    } catch (error) {
        console.error('[Staff] 订单发货失败:', error);
        res.status(500).json({
            code: 1,
            message: '订单发货失败',
            error: error.message
        });
    }
});

// 查询核销码
router.get('/staff/verification-codes/:code', authenticateStaff, async (req, res) => {
    try {
        const { code } = req.params;

        const verificationCode = await VerificationCode.findOne({
            where: { code },
            include: [
                {
                    model: Order,
                    as: 'order',
                    attributes: ['id', 'orderNo', 'status', 'totalAmount', 'createdAt']
                },
                {
                    model: Product,
                    as: 'product',
                    attributes: ['id', 'name', 'images']
                },
                {
                    model: ProductSKU,
                    as: 'sku',
                    attributes: ['id', 'name', 'price'],
                    required: false
                }
            ]
        });

        if (!verificationCode) {
            return res.status(404).json({
                code: 1,
                message: '核销码不存在'
            });
        }

        const codeData = {
            id: verificationCode.id,
            code: verificationCode.code,
            status: verificationCode.status,
            statusText: getVerificationStatusText(verificationCode.status),
            orderNo: verificationCode.order?.orderNo || '',
            productName: verificationCode.product?.name || '',
            productImage: verificationCode.product?.images?.[0] || '',
            skuName: verificationCode.sku?.name || '',
            expiredAt: verificationCode.expiredAt,
            usedAt: verificationCode.usedAt,
            createdAt: verificationCode.createdAt,
            isExpired: verificationCode.expiredAt ? new Date(verificationCode.expiredAt) < new Date() : false
        };

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                verificationCode: codeData
            }
        });
    } catch (error) {
        console.error('[Staff] 查询核销码失败:', error);
        res.status(500).json({
            code: 1,
            message: '查询核销码失败',
            error: error.message
        });
    }
});

// 核销核销码
router.put('/staff/verification-codes/:id/use', authenticateStaff, async (req, res) => {
    try {
        const { id } = req.params;
        const staff = req.staff;

        const verificationCode = await VerificationCode.findByPk(id);
        if (!verificationCode) {
            return res.status(404).json({
                code: 1,
                message: '核销码不存在'
            });
        }

        if (verificationCode.status === 'used') {
            return res.status(400).json({
                code: 1,
                message: '核销码已被使用'
            });
        }

        if (verificationCode.status === 'cancelled') {
            return res.status(400).json({
                code: 1,
                message: '核销码已取消'
            });
        }

        // 检查是否过期
        if (verificationCode.expiredAt && new Date(verificationCode.expiredAt) < new Date()) {
            await verificationCode.update({
                status: 'expired'
            });
            return res.status(400).json({
                code: 1,
                message: '核销码已过期'
            });
        }

        // 执行核销
        await verificationCode.update({
            status: 'used',
            usedAt: new Date(),
            usedBy: staff.id,
            remark: `由员工 ${staff.username} 核销`
        });

        res.json({
            code: 0,
            message: '核销成功',
            data: {
                verificationCode: {
                    id: verificationCode.id,
                    code: verificationCode.code,
                    status: 'used',
                    usedAt: new Date()
                }
            }
        });
    } catch (error) {
        console.error('[Staff] 核销失败:', error);
        res.status(500).json({
            code: 1,
            message: '核销失败',
            error: error.message
        });
    }
});

// 辅助函数
function getOrderStatusText(status) {
    const statusMap = {
        'pending': '待付款',
        'paid': '待发货',
        'shipped': '已发货',
        'delivered': '已收货',
        'completed': '已完成',
        'cancelled': '已取消',
        'refunded': '已退款',
        'returned': '已退货'
    };
    return statusMap[status] || status;
}

function getVerificationStatusText(status) {
    const statusMap = {
        'unused': '未使用',
        'used': '已使用',
        'expired': '已过期',
        'cancelled': '已取消'
    };
    return statusMap[status] || status;
}

module.exports = router;

