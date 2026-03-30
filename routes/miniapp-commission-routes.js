const express = require('express');
const { Op, fn, col } = require('sequelize');
const {
    CommissionCalculation,
    MemberCommissionRecord,
    Order,
    Member
} = require('../db');
const { authenticateMiniappUser } = require('../middleware/miniapp-auth');
const router = express.Router();

/** 小程序 tab / 筛选参数 → commission_calculations.commissionType */
function buildCalculationTypeFilter(tabType) {
    if (!tabType || tabType === 'all') return null;
    if (tabType === 'direct') return { commissionType: 'direct' };
    if (tabType === 'indirect') return { commissionType: 'indirect' };
    if (tabType === 'differential') {
        return { commissionType: { [Op.in]: ['distributor', 'network_distributor'] } };
    }
    if (tabType === 'team_expansion') return { commissionType: 'team_incentive' };
    return null;
}

/** 小程序「已结算」→ 库内 confirmed */
function mapStatusToDb(status) {
    if (!status || status === 'all') return null;
    if (status === 'completed') return 'confirmed';
    return status;
}

const CALC_TYPE_TEXT = {
    direct: '直接佣金',
    indirect: '间接佣金',
    distributor: '分销商佣金',
    network_distributor: '网络/级差分销',
    team_incentive: '团队拓展激励'
};

const RECORD_TYPE_TEXT = {
    direct: '直接佣金',
    indirect: '间接佣金',
    differential: '差额佣金',
    team_expansion: '团队拓展',
    admin_adjust: '管理员调整'
};

function fmtMoney(v) {
    const n = Number(v || 0);
    return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

function fmtPct(v) {
    const n = Number(v || 0);
    return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

// 获取佣金明细列表（订单佣金来自 commission_calculations.recipientId；管理员调整等来自 member_commission_records）
router.get('/commissions', authenticateMiniappUser, async (req, res) => {
    try {
        const { page = 1, limit = 10, type = '', status = '' } = req.query;
        const member = req.member;
        const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
        const lim = parseInt(limit, 10);
        const dbStatus = mapStatusToDb(status);

        const calcWhere = { recipientId: member.id };
        calcWhere.status = dbStatus || { [Op.ne]: 'cancelled' };
        const typeCond = buildCalculationTypeFilter(type);
        if (typeCond) {
            Object.assign(calcWhere, typeCond);
        }

        const recordWhere = { memberId: member.id };
        recordWhere.status = dbStatus
            ? (dbStatus === 'confirmed' ? 'completed' : dbStatus)
            : { [Op.ne]: 'cancelled' };
        if (type && type !== 'all') {
            if (type === 'differential') {
                recordWhere.type = 'differential';
            } else if (type === 'team_expansion') {
                recordWhere.type = 'team_expansion';
            } else if (type === 'direct' || type === 'indirect') {
                recordWhere.type = type;
            } else {
                recordWhere.type = { [Op.in]: ['__none__'] };
            }
        }

        const [calcRows, recordRows, calcCount, recordCount] = await Promise.all([
            CommissionCalculation.findAll({
                where: calcWhere,
                include: [
                    {
                        model: Order,
                        as: 'order',
                        attributes: ['id', 'orderNo', 'totalAmount'],
                        required: false
                    }
                ],
                order: [['createdAt', 'DESC']],
                limit: 3000
            }),
            MemberCommissionRecord.findAll({
                where: recordWhere,
                include: [
                    {
                        model: Order,
                        as: 'order',
                        attributes: ['id', 'orderNo', 'totalAmount'],
                        required: false
                    }
                ],
                order: [['createdAt', 'DESC']],
                limit: 3000
            }),
            CommissionCalculation.count({ where: calcWhere }),
            MemberCommissionRecord.count({ where: recordWhere })
        ]);

        const merged = [];

        for (const r of calcRows) {
            const j = r.toJSON();
            const ct = j.commissionType;
            const orderAmountNum = j.order ? parseFloat(j.order.totalAmount) : parseFloat(j.orderAmount);
            const commissionAmountNum = parseFloat(j.commissionAmount || 0);
            const commissionRateNum = j.commissionRate != null ? parseFloat(j.commissionRate) : null;
            const costRateNum = j.costRate != null ? parseFloat(j.costRate) : null;
            const costAmountNum = j.costAmount != null ? parseFloat(j.costAmount) : null;
            let formula = '';
            if (ct === 'direct' || ct === 'indirect') {
                formula = `订单金额¥${fmtMoney(orderAmountNum)} × 比例${fmtPct(commissionRateNum)}% = 佣金¥${fmtMoney(commissionAmountNum)}`;
            } else if (ct === 'distributor' || ct === 'network_distributor') {
                const costPart = costAmountNum != null
                    ? `提货成本¥${fmtMoney(costAmountNum)}（成本率${fmtPct(costRateNum)}%）`
                    : `成本率${fmtPct(costRateNum)}%`;
                formula = `订单金额¥${fmtMoney(orderAmountNum)}，${costPart}，实得佣金¥${fmtMoney(commissionAmountNum)}`;
            } else if (ct === 'team_incentive') {
                formula = `激励金额¥${fmtMoney(commissionAmountNum)}`;
            }
            merged.push({
                _sort: new Date(j.createdAt).getTime(),
                id: `cc_${j.id}`,
                rawId: j.id,
                source: 'calculation',
                type: ct,
                typeText: CALC_TYPE_TEXT[ct] || ct,
                amount: commissionAmountNum,
                commissionRate: commissionRateNum,
                costRate: costRateNum,
                costAmount: costAmountNum,
                balance: null,
                orderId: j.orderId,
                orderNo: j.order ? j.order.orderNo : null,
                orderAmount: orderAmountNum,
                description: formula ? `${j.description || ''}${j.description ? '；' : ''}${formula}` : (j.description || ''),
                status: j.status,
                statusText:
                    j.status === 'pending' ? '待结算' : j.status === 'confirmed' ? '已结算' : j.status === 'cancelled' ? '已取消' : j.status,
                settledAt: j.status === 'confirmed' ? j.calculationDate : null,
                createdAt: j.createdAt
            });
        }

        for (const r of recordRows) {
            const j = r.toJSON();
            merged.push({
                _sort: new Date(j.createdAt).getTime(),
                id: `mr_${j.id}`,
                rawId: j.id,
                source: 'record',
                type: j.type,
                typeText: RECORD_TYPE_TEXT[j.type] || j.type,
                amount: parseFloat(j.amount),
                balance: j.balance != null ? parseFloat(j.balance) : null,
                orderId: j.orderId,
                orderNo: j.order ? j.order.orderNo : null,
                orderAmount: j.order ? parseFloat(j.order.totalAmount) : null,
                description: j.description,
                status: j.status,
                statusText:
                    j.status === 'pending' ? '待结算' : j.status === 'completed' ? '已结算' : j.status === 'cancelled' ? '已取消' : j.status,
                settledAt: j.settledAt,
                createdAt: j.createdAt
            });
        }

        merged.sort((a, b) => b._sort - a._sort);
        const total = calcCount + recordCount;
        const paged = merged.slice(offset, offset + lim);
        const records = paged.map(({ _sort, ...rest }) => rest);

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                records,
                total,
                totalPages: Math.ceil(total / lim) || 1,
                currentPage: parseInt(page, 10),
                hasMore: offset + lim < total
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

// 获取佣金统计（与会员累计佣金一致，并补充按类型汇总）
router.get('/commissions/stats', authenticateMiniappUser, async (req, res) => {
    try {
        const member = req.member;
        const { startDate, endDate } = req.query;

        const m = await Member.findByPk(member.id, {
            attributes: ['totalCommission', 'availableCommission']
        });
        const totalCommission = parseFloat(m && m.totalCommission) || 0;

        const calcWhereConfirmed = {
            recipientId: member.id,
            status: 'confirmed'
        };
        if (startDate && endDate) {
            calcWhereConfirmed.calculationDate = {
                [Op.between]: [new Date(startDate), new Date(endDate)]
            };
        }

        const recordWhereCompleted = {
            memberId: member.id,
            status: 'completed'
        };
        if (startDate && endDate) {
            recordWhereCompleted.settledAt = {
                [Op.between]: [new Date(startDate), new Date(endDate)]
            };
        }

        const [typeStatsCalc, typeStatsRecord, cntCalc, cntRecord] = await Promise.all([
            CommissionCalculation.findAll({
                where: calcWhereConfirmed,
                attributes: [
                    'commissionType',
                    [fn('SUM', col('commissionAmount')), 'totalAmount'],
                    [fn('COUNT', col('id')), 'count']
                ],
                group: ['commissionType'],
                raw: true
            }),
            MemberCommissionRecord.findAll({
                where: recordWhereCompleted,
                attributes: [
                    'type',
                    [fn('SUM', col('amount')), 'totalAmount'],
                    [fn('COUNT', col('id')), 'count']
                ],
                group: ['type'],
                raw: true
            }),
            CommissionCalculation.count({ where: { recipientId: member.id, status: { [Op.ne]: 'cancelled' } } }),
            MemberCommissionRecord.count({ where: { memberId: member.id, status: { [Op.ne]: 'cancelled' } } })
        ]);

        const typeStatsMap = {};
        for (const row of typeStatsCalc || []) {
            const key = row.commissionType;
            typeStatsMap[key] = {
                type: key,
                totalAmount: parseFloat(row.totalAmount || 0),
                count: parseInt(row.count || 0, 10)
            };
        }
        for (const row of typeStatsRecord || []) {
            const key = row.type;
            const prev = typeStatsMap[key] || { totalAmount: 0, count: 0 };
            typeStatsMap[key] = {
                type: key,
                totalAmount: prev.totalAmount + parseFloat(row.totalAmount || 0),
                count: prev.count + parseInt(row.count || 0, 10)
            };
        }

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                totalCommission,
                totalCount: cntCalc + cntRecord,
                typeStats: Object.values(typeStatsMap)
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
