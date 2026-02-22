const express = require('express');
const { Op } = require('sequelize');
const { CommissionCalculation, TeamIncentiveCalculation, Member, Order } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const CommissionService = require('../services/commissionService');

const router = express.Router();

// 获取佣金计算记录列表
router.get('/calculations', authenticateToken, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            type = '',
            status = '',
            memberId = '',
            startDate = '',
            endDate = ''
        } = req.query;

        const offset = (page - 1) * limit;
        const where = {};

        if (type) {
            where.commissionType = type;
        }

        if (status) {
            where.status = status;
        }

        if (memberId) {
            where.memberId = memberId;
        }

        if (startDate && endDate) {
            where.calculationDate = {
                [Op.between]: [new Date(startDate), new Date(endDate)]
            };
        }

        const { count, rows } = await CommissionCalculation.findAndCountAll({
            where,
            include: [
                { model: Order, as: 'order' },
                { model: Member, as: 'member', attributes: ['id', 'nickname'] },
                { model: Member, as: 'referrer', attributes: ['id', 'nickname'] },
                { model: Member, as: 'recipient', attributes: ['id', 'nickname'] }
            ],
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['calculationDate', 'DESC']]
        });

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                calculations: rows,
                total: count,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page)
            }
        });
    } catch (error) {
        console.error('获取佣金计算记录失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取佣金计算记录失败'
        });
    }
});

// 获取团队拓展激励计算记录
router.get('/team-incentives', authenticateToken, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            month = '',
            status = ''
        } = req.query;

        const offset = (page - 1) * limit;
        const where = {};

        if (month) {
            where.calculationMonth = month;
        }

        if (status) {
            where.status = status;
        }

        const { count, rows } = await TeamIncentiveCalculation.findAndCountAll({
            where,
            include: [
                { model: Member, as: 'distributor', attributes: ['id', 'nickname'] },
                { model: Member, as: 'referrer', attributes: ['id', 'nickname'] }
            ],
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['calculationDate', 'DESC']]
        });

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                incentives: rows,
                total: count,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page)
            }
        });
    } catch (error) {
        console.error('获取团队拓展激励记录失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取团队拓展激励记录失败'
        });
    }
});

// 订单佣金预览（不写入，仅返回预计佣金明细；订单未完成也可预览）
router.get('/preview/:orderId', authenticateToken, async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const result = await CommissionService.previewOrderCommission(orderId);
        res.json({
            code: 0,
            message: '预览成功',
            data: {
                calculations: result.calculations || [],
                noReferrer: result.noReferrer,
                referrerNotFound: result.referrerNotFound
            }
        });
    } catch (error) {
        console.error('订单佣金预览失败:', error);
        res.status(500).json({
            code: 1,
            message: error.message || '订单佣金预览失败'
        });
    }
});

// 手动触发订单佣金计算（仅当订单状态为已收货/已完成时才会写入）
router.post('/calculate/:orderId', authenticateToken, async (req, res) => {
    try {
        const { orderId } = req.params;
        
        const result = await CommissionService.calculateOrderCommission(orderId);
        const calculations = result && result.calculations ? result.calculations : [];
        let message = '佣金计算完成';
        if (result.orderNotCompleted) {
            message = '订单未完成（需已收货或已核销），未生成佣金，请使用预览接口查看预计佣金';
        } else if (result.alreadyCalculated) {
            message = '该订单已计算过佣金，未重复生成';
        }
        res.json({
            code: 0,
            message,
            data: { calculations, orderNotCompleted: result.orderNotCompleted, alreadyCalculated: result.alreadyCalculated }
        });
    } catch (error) {
        console.error('计算订单佣金失败:', error);
        res.status(500).json({
            code: 1,
            message: error.message || '计算订单佣金失败'
        });
    }
});

// 手动触发团队拓展激励计算
router.post('/calculate-team-incentive', authenticateToken, async (req, res) => {
    try {
        const { month } = req.body;
        
        if (!month) {
            return res.status(400).json({
                code: 1,
                message: '月份参数不能为空'
            });
        }

        const calculations = await CommissionService.calculateTeamIncentiveCommission(month);
        
        res.json({
            code: 0,
            message: '团队拓展激励计算完成',
            data: calculations
        });
    } catch (error) {
        console.error('计算团队拓展激励失败:', error);
        res.status(500).json({
            code: 1,
            message: error.message || '计算团队拓展激励失败'
        });
    }
});

// 确认佣金计算
router.put('/confirm/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        const calculation = await CommissionService.confirmCommission(id);
        
        res.json({
            code: 0,
            message: '佣金确认成功',
            data: calculation
        });
    } catch (error) {
        console.error('确认佣金失败:', error);
        res.status(500).json({
            code: 1,
            message: error.message || '确认佣金失败'
        });
    }
});

// 取消佣金计算
router.put('/cancel/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        const calculation = await CommissionService.cancelCommission(id);
        
        res.json({
            code: 0,
            message: '佣金取消成功',
            data: calculation
        });
    } catch (error) {
        console.error('取消佣金失败:', error);
        res.status(500).json({
            code: 1,
            message: error.message || '取消佣金失败'
        });
    }
});

// 获取佣金统计
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const totalCalculations = await CommissionCalculation.count();
        const pendingCalculations = await CommissionCalculation.count({ where: { status: 'pending' } });
        const confirmedCalculations = await CommissionCalculation.count({ where: { status: 'confirmed' } });
        const totalCommissionAmount = await CommissionCalculation.sum('commissionAmount', {
            where: { status: 'confirmed' }
        }) || 0;

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                totalCalculations,
                pendingCalculations,
                confirmedCalculations,
                totalCommissionAmount: parseFloat(totalCommissionAmount)
            }
        });
    } catch (error) {
        console.error('获取佣金统计失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取佣金统计失败'
        });
    }
});

module.exports = router;