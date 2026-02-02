const express = require('express');
const { Op, fn, col } = require('sequelize');
const { MemberCommissionRecord, Order, Member, sequelize } = require('../db');
const { authenticateMiniappUser } = require('../middleware/miniapp-auth');
const router = express.Router();

// 获取佣金明细列表
router.get('/commissions', authenticateMiniappUser, async (req, res) => {
    try {
        const { page = 1, limit = 10, type = '', status = '' } = req.query;
        const member = req.member;
        const offset = (page - 1) * limit;

        const where = { memberId: member.id };
        
        if (type) {
            where.type = type;
        }
        
        if (status) {
            where.status = status;
        }

        const { count, rows } = await MemberCommissionRecord.findAndCountAll({
            where,
            include: [
                {
                    model: Order,
                    as: 'order',
                    attributes: ['id', 'orderNo', 'totalAmount'],
                    required: false
                }
            ],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        // 格式化佣金类型
        const typeMap = {
            'direct': '直接佣金',
            'indirect': '间接佣金',
            'differential': '差额佣金',
            'team_expansion': '团队拓展激励'
        };

        // 格式化状态
        const statusMap = {
            'pending': '待结算',
            'completed': '已结算',
            'cancelled': '已取消'
        };

        const records = rows.map(record => ({
            id: record.id,
            type: record.type,
            typeText: typeMap[record.type] || record.type,
            amount: parseFloat(record.amount),
            balance: parseFloat(record.balance),
            source: record.source,
            sourceId: record.sourceId,
            orderId: record.orderId,
            orderNo: record.order ? record.order.orderNo : null,
            orderAmount: record.order ? parseFloat(record.order.totalAmount) : null,
            description: record.description,
            status: record.status,
            statusText: statusMap[record.status] || record.status,
            settledAt: record.settledAt,
            createdAt: record.createdAt
        }));

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                records,
                total: count,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page),
                hasMore: parseInt(page) < Math.ceil(count / limit)
            }
        });
    } catch (error) {
        console.error('获取佣金明细失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取佣金明细失败',
            error: error.message
        });
    }
});

// 获取佣金统计
router.get('/commissions/stats', authenticateMiniappUser, async (req, res) => {
    try {
        const member = req.member;
        const { startDate, endDate } = req.query;

        const where = { memberId: member.id, status: 'completed' };
        
        if (startDate && endDate) {
            where.settledAt = {
                [Op.between]: [new Date(startDate), new Date(endDate)]
            };
        }

        // 按类型统计
        const typeStats = await MemberCommissionRecord.findAll({
            where,
            attributes: [
                'type',
                [fn('SUM', col('amount')), 'totalAmount'],
                [fn('COUNT', col('id')), 'count']
            ],
            group: ['type']
        });

        // 总佣金
        const totalCommission = await MemberCommissionRecord.sum('amount', {
            where
        }) || 0;

        // 总笔数
        const totalCount = await MemberCommissionRecord.count({
            where
        });

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                totalCommission: parseFloat(totalCommission),
                totalCount,
                typeStats: typeStats.map(stat => ({
                    type: stat.type,
                    totalAmount: parseFloat(stat.dataValues.totalAmount || 0),
                    count: parseInt(stat.dataValues.count || 0)
                }))
            }
        });
    } catch (error) {
        console.error('获取佣金统计失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取佣金统计失败',
            error: error.message
        });
    }
});

module.exports = router;

