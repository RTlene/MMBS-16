const express = require('express');
const { Op } = require('sequelize');
const { VerificationCode, Order, Product, ProductSKU, Member } = require('../db');
const { authenticateMiniappUser } = require('../middleware/miniapp-auth');
const router = express.Router();

// 生成核销码
function generateVerificationCode() {
    // 生成格式：日期(6位) + 随机数(6位) = 12位核销码
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const randomStr = Math.floor(100000 + Math.random() * 900000).toString();
    return dateStr + randomStr;
}

// 获取我的核销码列表
router.get('/verification-codes', authenticateMiniappUser, async (req, res) => {
    try {
        const { status = 'all', page = 1, limit = 20 } = req.query;
        const member = req.member;
        const offset = (page - 1) * limit;

        const where = {
            memberId: member.id
        };

        if (status !== 'all') {
            where.status = status;
        }

        const { count, rows } = await VerificationCode.findAndCountAll({
            where,
            include: [
                {
                    model: Order,
                    as: 'order',
                    attributes: ['id', 'orderNo', 'status', 'totalAmount', 'createdAt']
                },
                {
                    model: Product,
                    as: 'product',
                    attributes: ['id', 'name', 'images', 'productType']
                },
                {
                    model: ProductSKU,
                    as: 'sku',
                    attributes: ['id', 'name', 'price'],
                    required: false
                }
            ],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        const codes = rows.map(code => ({
            id: code.id,
            code: code.code,
            status: code.status,
            statusText: getStatusText(code.status),
            orderNo: code.order?.orderNo || '',
            productName: code.product?.name || '',
            productImage: code.product?.images?.[0] || '',
            productType: code.product?.productType || 'physical',
            skuName: code.sku?.name || '',
            expiredAt: code.expiredAt,
            usedAt: code.usedAt,
            createdAt: code.createdAt,
            isExpired: code.expiredAt ? new Date(code.expiredAt) < new Date() : false
        }));

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                codes,
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                hasMore: offset + rows.length < count
            }
        });
    } catch (error) {
        console.error('[MiniappVerification] 获取核销码列表失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取核销码列表失败',
            error: error.message
        });
    }
});

// 获取核销码详情
router.get('/verification-codes/:id', authenticateMiniappUser, async (req, res) => {
    try {
        const { id } = req.params;
        const member = req.member;

        const verificationCode = await VerificationCode.findOne({
            where: {
                id: parseInt(id),
                memberId: member.id
            },
            include: [
                {
                    model: Order,
                    as: 'order',
                    attributes: ['id', 'orderNo', 'status', 'totalAmount', 'createdAt', 'paymentTime']
                },
                {
                    model: Product,
                    as: 'product',
                    attributes: ['id', 'name', 'description', 'images', 'productType', 'detailContent']
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
            statusText: getStatusText(verificationCode.status),
            orderNo: verificationCode.order?.orderNo || '',
            productName: verificationCode.product?.name || '',
            productDescription: verificationCode.product?.description || '',
            productImage: verificationCode.product?.images?.[0] || '',
            productType: verificationCode.product?.productType || 'physical',
            skuName: verificationCode.sku?.name || '',
            expiredAt: verificationCode.expiredAt,
            usedAt: verificationCode.usedAt,
            remark: verificationCode.remark,
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
        console.error('[MiniappVerification] 获取核销码详情失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取核销码详情失败',
            error: error.message
        });
    }
});

// 根据核销码查询（用于核销）
router.get('/verification-codes/code/:code', authenticateMiniappUser, async (req, res) => {
    try {
        const { code } = req.params;
        const member = req.member;

        const verificationCode = await VerificationCode.findOne({
            where: {
                code: code,
                memberId: member.id
            },
            include: [
                {
                    model: Order,
                    as: 'order',
                    attributes: ['id', 'orderNo', 'status', 'totalAmount', 'createdAt']
                },
                {
                    model: Product,
                    as: 'product',
                    attributes: ['id', 'name', 'description', 'images', 'productType']
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
            statusText: getStatusText(verificationCode.status),
            orderNo: verificationCode.order?.orderNo || '',
            productName: verificationCode.product?.name || '',
            productImage: verificationCode.product?.images?.[0] || '',
            productType: verificationCode.product?.productType || 'physical',
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
        console.error('[MiniappVerification] 查询核销码失败:', error);
        res.status(500).json({
            code: 1,
            message: '查询核销码失败',
            error: error.message
        });
    }
});

// 获取状态文本
function getStatusText(status) {
    const statusMap = {
        'unused': '未使用',
        'used': '已使用',
        'expired': '已过期',
        'cancelled': '已取消'
    };
    return statusMap[status] || status;
}

module.exports = router;

