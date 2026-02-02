const express = require('express');
const router = express.Router();
const { ReturnRequest, Order, Member, Product, User } = require('../db');
const { Op } = require('sequelize');
const { authenticateToken } = require('../middleware/auth');

// 获取退货申请列表
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            search = '', 
            status = '', 
            reason = '',
            startDate = '',
            endDate = ''
        } = req.query;
        
        const offset = (page - 1) * limit;
        const where = {};
        
        // 搜索条件
        if (search) {
            where[Op.or] = [
                { returnNo: { [Op.like]: `%${search}%` } },
                { '$order.orderNo$': { [Op.like]: `%${search}%` } },
                { '$member.nickname$': { [Op.like]: `%${search}%` } }
            ];
        }
        
        if (status) {
            where.status = status;
        }
        
        if (reason) {
            where.reason = reason;
        }
        
        if (startDate && endDate) {
            where.createdAt = {
                [Op.between]: [new Date(startDate), new Date(endDate)]
            };
        }
        
        const { count, rows } = await ReturnRequest.findAndCountAll({
            where,
            include: [
                { model: Order, as: 'order' },
                { model: Member, as: 'member' },
                { model: Product, as: 'product' },
                { model: User, as: 'processor' }
            ],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
        
        res.json({
            code: 0,
            message: '获取成功',
            data: {
                returns: rows,
                totalCount: count,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page)
            }
        });
    } catch (error) {
        console.error('获取退货申请列表失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取退货申请列表失败',
            error: error.message
        });
    }
});

// 获取退货申请详情
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        const returnRequest = await ReturnRequest.findByPk(id, {
            include: [
                { model: Order, as: 'order' },
                { model: Member, as: 'member' },
                { model: Product, as: 'product' },
                { model: User, as: 'processor' }
            ]
        });
        
        if (!returnRequest) {
            return res.status(404).json({
                code: 1,
                message: '退货申请不存在'
            });
        }
        
        res.json({
            code: 0,
            message: '获取成功',
            data: { returnRequest }
        });
    } catch (error) {
        console.error('获取退货申请详情失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取退货申请详情失败',
            error: error.message
        });
    }
});

// 处理退货申请
router.put('/:id/process', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, refundAmount, refundMethod, adminRemark } = req.body;
        
        const returnRequest = await ReturnRequest.findByPk(id);
        if (!returnRequest) {
            return res.status(404).json({
                code: 1,
                message: '退货申请不存在'
            });
        }
        
        // 更新退货申请状态
        await returnRequest.update({
            status,
            refundAmount: refundAmount || returnRequest.refundAmount,
            refundMethod: refundMethod || returnRequest.refundMethod,
            adminRemark: adminRemark || returnRequest.adminRemark,
            processedBy: req.user.id,
            processedAt: new Date(),
            completedAt: status === 'completed' ? new Date() : returnRequest.completedAt
        });
        
        // 如果状态为已完成，创建退款记录
        if (status === 'completed' && returnRequest.orderId) {
            const RefundRecord = require('../db').RefundRecord;
            await RefundRecord.create({
                refundNo: `RF${Date.now()}`,
                orderId: returnRequest.orderId,
                returnRequestId: returnRequest.id,
                memberId: returnRequest.memberId,
                amount: refundAmount || returnRequest.refundAmount,
                method: refundMethod || returnRequest.refundMethod,
                status: 'pending',
                reason: '退货退款',
                processedBy: req.user.id
            });
        }
        
        res.json({
            code: 0,
            message: '处理成功'
        });
    } catch (error) {
        console.error('处理退货申请失败:', error);
        res.status(500).json({
            code: 1,
            message: '处理退货申请失败',
            error: error.message
        });
    }
});

// 获取统计信息
router.get('/stats/overview', authenticateToken, async (req, res) => {
    try {
        const totalReturns = await ReturnRequest.count();
        const pendingReturns = await ReturnRequest.count({ where: { status: 'pending' } });
        const completedReturns = await ReturnRequest.count({ where: { status: 'completed' } });
        
        const totalRefundAmount = await ReturnRequest.sum('refundAmount', {
            where: { status: 'completed' }
        }) || 0;
        
        res.json({
            code: 0,
            message: '获取成功',
            data: {
                totalReturns,
                pendingReturns,
                completedReturns,
                totalRefundAmount: totalRefundAmount.toFixed(2)
            }
        });
    } catch (error) {
        console.error('获取统计信息失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取统计信息失败',
            error: error.message
        });
    }
});

module.exports = router;