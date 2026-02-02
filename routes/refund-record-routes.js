const express = require('express');
const router = express.Router();
const { RefundRecord, Order, Member, ReturnRequest, User } = require('../db');
const { Op } = require('sequelize');
const { authenticateToken } = require('../middleware/auth');

// 获取退款记录列表
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            search = '', 
            status = '', 
            method = '',
            startDate = '',
            endDate = ''
        } = req.query;
        
        const offset = (page - 1) * limit;
        const where = {};
        
        // 搜索条件
        if (search) {
            where[Op.or] = [
                { refundNo: { [Op.like]: `%${search}%` } },
                { '$order.orderNo$': { [Op.like]: `%${search}%` } },
                { '$member.nickname$': { [Op.like]: `%${search}%` } }
            ];
        }
        
        if (status) {
            where.status = status;
        }
        
        if (method) {
            where.method = method;
        }
        
        if (startDate && endDate) {
            where.createdAt = {
                [Op.between]: [new Date(startDate), new Date(endDate)]
            };
        }
        
        const { count, rows } = await RefundRecord.findAndCountAll({
            where,
            include: [
                { model: Order, as: 'order' },
                { model: Member, as: 'member' },
                { model: ReturnRequest, as: 'returnRequest' },
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
                refunds: rows,
                totalCount: count,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page)
            }
        });
    } catch (error) {
        console.error('获取退款记录列表失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取退款记录列表失败',
            error: error.message
        });
    }
});

// 获取退款记录详情
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        const refundRecord = await RefundRecord.findByPk(id, {
            include: [
                { model: Order, as: 'order' },
                { model: Member, as: 'member' },
                { model: ReturnRequest, as: 'returnRequest' },
                { model: User, as: 'processor' }
            ]
        });
        
        if (!refundRecord) {
            return res.status(404).json({
                code: 1,
                message: '退款记录不存在'
            });
        }
        
        res.json({
            code: 0,
            message: '获取成功',
            data: { refundRecord }
        });
    } catch (error) {
        console.error('获取退款记录详情失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取退款记录详情失败',
            error: error.message
        });
    }
});

// 处理退款记录
router.put('/:id/process', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, thirdPartyRefundNo, remark } = req.body;
        
        const refundRecord = await RefundRecord.findByPk(id);
        if (!refundRecord) {
            return res.status(404).json({
                code: 1,
                message: '退款记录不存在'
            });
        }
        
        // 更新退款记录状态
        await refundRecord.update({
            status,
            thirdPartyRefundNo: thirdPartyRefundNo || refundRecord.thirdPartyRefundNo,
            remark: remark || refundRecord.remark,
            processedBy: req.user.id,
            processedAt: new Date(),
            completedAt: status === 'completed' ? new Date() : refundRecord.completedAt
        });
        
        res.json({
            code: 0,
            message: '处理成功'
        });
    } catch (error) {
        console.error('处理退款记录失败:', error);
        res.status(500).json({
            code: 1,
            message: '处理退款记录失败',
            error: error.message
        });
    }
});

// 获取统计信息
router.get('/stats/overview', authenticateToken, async (req, res) => {
    try {
        const totalRefunds = await RefundRecord.count();
        const pendingRefunds = await RefundRecord.count({ where: { status: 'pending' } });
        const completedRefunds = await RefundRecord.count({ where: { status: 'completed' } });
        
        const totalRefundAmount = await RefundRecord.sum('amount', {
            where: { status: 'completed' }
        }) || 0;
        
        res.json({
            code: 0,
            message: '获取成功',
            data: {
                totalRefunds,
                pendingRefunds,
                completedRefunds,
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