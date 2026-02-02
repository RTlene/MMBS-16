const express = require('express');
const { Op } = require('sequelize');
const { CommissionWithdrawal, Member } = require('../db');
const { authenticateMiniappUser } = require('../middleware/miniapp-auth');

const router = express.Router();

/**
 * 生成提现单号
 */
function generateWithdrawalNo() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `WD${timestamp}${random}`;
}

/**
 * 创建提现申请（小程序端）
 */
router.post('/withdrawals', authenticateMiniappUser, async (req, res) => {
    try {
        const {
            amount,
            accountType,
            accountName,
            accountNumber,
            bankName,
            bankBranch,
            remark
        } = req.body;

        const member = req.member;

        // 验证必填字段
        if (!amount || amount <= 0) {
            return res.status(400).json({
                code: 1,
                message: '提现金额必须大于0'
            });
        }

        if (!accountType || !['wechat', 'alipay', 'bank'].includes(accountType)) {
            return res.status(400).json({
                code: 1,
                message: '账户类型无效'
            });
        }

        if (!accountName || !accountName.trim()) {
            return res.status(400).json({
                code: 1,
                message: '账户姓名不能为空'
            });
        }

        if (!accountNumber || !accountNumber.trim()) {
            return res.status(400).json({
                code: 1,
                message: '账户号码不能为空'
            });
        }

        // 银行卡类型需要银行名称
        if (accountType === 'bank' && (!bankName || !bankName.trim())) {
            return res.status(400).json({
                code: 1,
                message: '银行卡类型需要填写银行名称'
            });
        }

        // 检查可用佣金是否足够
        const availableCommission = parseFloat(member.availableCommission || 0);
        const withdrawalAmount = parseFloat(amount);

        if (withdrawalAmount > availableCommission) {
            return res.status(400).json({
                code: 1,
                message: `可用佣金不足，当前可用：¥${availableCommission.toFixed(2)}`
            });
        }

        // 检查最小提现金额（可配置，这里设为10元）
        const minAmount = 10;
        if (withdrawalAmount < minAmount) {
            return res.status(400).json({
                code: 1,
                message: `最小提现金额为¥${minAmount}`
            });
        }

        // 检查是否有待审核的提现申请
        const pendingWithdrawal = await CommissionWithdrawal.findOne({
            where: {
                memberId: member.id,
                status: {
                    [Op.in]: ['pending', 'approved', 'processing']
                }
            }
        });

        if (pendingWithdrawal) {
            return res.status(400).json({
                code: 1,
                message: '您有正在处理中的提现申请，请等待处理完成后再申请'
            });
        }

        // 创建提现申请
        const withdrawal = await CommissionWithdrawal.create({
            withdrawalNo: generateWithdrawalNo(),
            memberId: member.id,
            amount: withdrawalAmount,
            accountType,
            accountName: accountName.trim(),
            accountNumber: accountNumber.trim(),
            bankName: bankName ? bankName.trim() : null,
            bankBranch: bankBranch ? bankBranch.trim() : null,
            remark: remark ? remark.trim() : null,
            status: 'pending'
        });

        // 冻结对应金额的佣金
        await member.update({
            availableCommission: availableCommission - withdrawalAmount,
            frozenCommission: (parseFloat(member.frozenCommission || 0) + withdrawalAmount)
        });

        res.json({
            code: 0,
            message: '提现申请已提交，请等待审核',
            data: {
                withdrawal: {
                    id: withdrawal.id,
                    withdrawalNo: withdrawal.withdrawalNo,
                    amount: withdrawal.amount,
                    status: withdrawal.status,
                    createdAt: withdrawal.createdAt
                }
            }
        });
    } catch (error) {
        console.error('创建提现申请失败:', error);
        res.status(500).json({
            code: 1,
            message: '创建提现申请失败',
            error: error.message
        });
    }
});

/**
 * 获取提现申请列表（小程序端）
 */
router.get('/withdrawals', authenticateMiniappUser, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status = ''
        } = req.query;

        const member = req.member;
        const offset = (page - 1) * limit;

        const where = { memberId: member.id };
        if (status) {
            where.status = status;
        }

        const { count, rows } = await CommissionWithdrawal.findAndCountAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        const withdrawals = rows.map(w => ({
            id: w.id,
            withdrawalNo: w.withdrawalNo,
            amount: w.amount,
            accountType: w.accountType,
            accountTypeText: w.accountType === 'wechat' ? '微信' : w.accountType === 'alipay' ? '支付宝' : '银行卡',
            accountName: w.accountName,
            accountNumber: w.accountNumber ? w.accountNumber.replace(/(\d{4})\d+(\d{4})/, '$1****$2') : '', // 脱敏处理
            bankName: w.bankName,
            bankBranch: w.bankBranch,
            status: w.status,
            statusText: getStatusText(w.status),
            remark: w.remark,
            adminRemark: w.adminRemark,
            createdAt: w.createdAt,
            processedAt: w.processedAt,
            completedAt: w.completedAt
        }));

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                withdrawals,
                total: count,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page),
                hasMore: parseInt(page) < Math.ceil(count / limit)
            }
        });
    } catch (error) {
        console.error('获取提现申请列表失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取提现申请列表失败',
            error: error.message
        });
    }
});

/**
 * 获取提现申请详情（小程序端）
 */
router.get('/withdrawals/:id', authenticateMiniappUser, async (req, res) => {
    try {
        const { id } = req.params;
        const member = req.member;

        const withdrawal = await CommissionWithdrawal.findOne({
            where: {
                id,
                memberId: member.id
            }
        });

        if (!withdrawal) {
            return res.status(404).json({
                code: 1,
                message: '提现申请不存在'
            });
        }

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                withdrawal: {
                    id: withdrawal.id,
                    withdrawalNo: withdrawal.withdrawalNo,
                    amount: withdrawal.amount,
                    accountType: withdrawal.accountType,
                    accountTypeText: withdrawal.accountType === 'wechat' ? '微信' : withdrawal.accountType === 'alipay' ? '支付宝' : '银行卡',
                    accountName: withdrawal.accountName,
                    accountNumber: withdrawal.accountNumber,
                    bankName: withdrawal.bankName,
                    bankBranch: withdrawal.bankBranch,
                    status: withdrawal.status,
                    statusText: getStatusText(withdrawal.status),
                    remark: withdrawal.remark,
                    adminRemark: withdrawal.adminRemark,
                    createdAt: withdrawal.createdAt,
                    processedAt: withdrawal.processedAt,
                    completedAt: withdrawal.completedAt
                }
            }
        });
    } catch (error) {
        console.error('获取提现申请详情失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取提现申请详情失败',
            error: error.message
        });
    }
});

/**
 * 取消提现申请（小程序端）
 */
router.put('/withdrawals/:id/cancel', authenticateMiniappUser, async (req, res) => {
    try {
        const { id } = req.params;
        const member = req.member;

        const withdrawal = await CommissionWithdrawal.findOne({
            where: {
                id,
                memberId: member.id
            }
        });

        if (!withdrawal) {
            return res.status(404).json({
                code: 1,
                message: '提现申请不存在'
            });
        }

        // 只能取消待审核状态的申请
        if (withdrawal.status !== 'pending') {
            return res.status(400).json({
                code: 1,
                message: '只能取消待审核状态的提现申请'
            });
        }

        // 更新状态
        await withdrawal.update({ status: 'cancelled' });

        // 解冻佣金
        const withdrawalAmount = parseFloat(withdrawal.amount);
        await member.update({
            availableCommission: parseFloat(member.availableCommission || 0) + withdrawalAmount,
            frozenCommission: parseFloat(member.frozenCommission || 0) - withdrawalAmount
        });

        res.json({
            code: 0,
            message: '提现申请已取消',
            data: {
                withdrawal: {
                    id: withdrawal.id,
                    status: withdrawal.status
                }
            }
        });
    } catch (error) {
        console.error('取消提现申请失败:', error);
        res.status(500).json({
            code: 1,
            message: '取消提现申请失败',
            error: error.message
        });
    }
});

/**
 * 获取状态文本
 */
function getStatusText(status) {
    const statusMap = {
        'pending': '待审核',
        'approved': '已通过',
        'rejected': '已拒绝',
        'processing': '处理中',
        'completed': '已完成',
        'cancelled': '已取消'
    };
    return statusMap[status] || status;
}

module.exports = router;

