/**
 * 后台管理 - 佣金提现申请管理
 */
const express = require('express');
const { Op } = require('sequelize');
const { CommissionWithdrawal, Member } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const withdrawalService = require('../services/withdrawalService');
const configStore = require('../services/configStore');

const router = express.Router();

function statusText(status) {
  const map = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已拒绝',
    processing: '处理中',
    completed: '已完成',
    cancelled: '已取消'
  };
  return map[status] || status;
}

function isConnResetError(err) {
  return err.code === 'ECONNRESET' || (err.name === 'SequelizeDatabaseError' && err.original && /ECONNRESET/i.test(String(err.original)));
}

/** 遇 ECONNRESET 时重试，最多 maxAttempts 次（总尝试次数），间隔递增 */
async function withRetryOnConnReset(fn, maxAttempts = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isConnResetError(err) || attempt === maxAttempts) throw err;
      await new Promise(r => setTimeout(r, 200 * attempt));
    }
  }
  throw lastErr;
}

/**
 * 获取提现申请列表（后台）
 * 遇 ECONNRESET 时自动重试最多 3 次
 */
router.get('/', authenticateToken, async (req, res) => {
  const { page = 1, limit = 10, status = '', search = '' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const where = {};
  if (status) where.status = status;
  if (search && search.trim()) {
    const searchTrim = search.trim();
    where[Op.or] = [
      { withdrawalNo: { [Op.like]: `%${searchTrim}%` } },
      { '$member.nickname$': { [Op.like]: `%${searchTrim}%` } },
      { '$member.phone$': { [Op.like]: `%${searchTrim}%` } },
      { accountName: { [Op.like]: `%${searchTrim}%` } },
      { accountNumber: { [Op.like]: `%${searchTrim}%` } }
    ];
  }
  const queryOptions = {
    where,
    include: [{ model: Member, as: 'member', attributes: ['id', 'nickname', 'phone', 'openid', 'availableCommission', 'frozenCommission'] }],
    order: [['createdAt', 'DESC']],
    limit: parseInt(limit),
    offset
  };

  let count, rows;
  try {
    const result = await withRetryOnConnReset(() => CommissionWithdrawal.findAndCountAll(queryOptions));
    count = result.count;
    rows = result.rows;
  } catch (error) {
    console.error('获取提现列表失败:', error);
    return res.status(500).json({ code: 1, message: '获取提现列表失败', error: error.message });
  }

  try {
    const withdrawals = rows.map(w => {
      const m = w.member || {};
      return {
        id: w.id,
        withdrawalNo: w.withdrawalNo,
        memberId: w.memberId,
        memberNickname: m.nickname,
        memberPhone: m.phone,
        amount: w.amount,
        accountType: w.accountType,
        accountTypeText: w.accountType === 'wechat' ? '微信钱包' : w.accountType === 'alipay' ? '支付宝' : '银行',
        accountName: w.accountName,
        accountNumber: w.accountNumber,
        bankName: w.bankName,
        bankBranch: w.bankBranch,
        status: w.status,
        statusText: statusText(w.status),
        remark: w.remark,
        adminRemark: w.adminRemark,
        processedAt: w.processedAt,
        completedAt: w.completedAt,
        createdAt: w.createdAt
      };
    });

    res.json({
      code: 0,
      message: '获取成功',
      data: {
        withdrawals,
        total: count,
        totalPages: Math.ceil(count / parseInt(limit)),
        currentPage: parseInt(page),
        pageSize: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('获取提现列表失败:', error);
    res.status(500).json({
      code: 1,
      message: '获取提现列表失败',
      error: error.message
    });
  }
});

/**
 * 获取提现配置（小额自动通过等）
 * GET /api/withdrawals/config
 */
router.get('/config', authenticateToken, async (req, res) => {
  try {
    const section = configStore.getSection('withdrawal') || {};
    const autoApprove = section.autoApprove || { enabled: false, maxAmount: 0 };
    res.json({
      code: 0,
      message: '获取成功',
      data: {
        autoApprove: {
          enabled: !!autoApprove.enabled,
          maxAmount: Math.max(0, parseFloat(autoApprove.maxAmount) || 0)
        }
      }
    });
  } catch (e) {
    console.error('[Withdrawals] 获取配置失败:', e);
    res.status(500).json({ code: 1, message: '获取配置失败', error: e.message });
  }
});

/**
 * 保存提现配置
 * PUT /api/withdrawals/config
 */
router.put('/config', authenticateToken, async (req, res) => {
  try {
    const { autoApprove } = req.body || {};
    const section = configStore.getSection('withdrawal') || {};
    section.autoApprove = {
      enabled: !!autoApprove?.enabled,
      maxAmount: Math.max(0, parseFloat(autoApprove?.maxAmount) || 0)
    };
    await configStore.setSection('withdrawal', section);
    res.json({
      code: 0,
      message: '配置已保存',
      data: { autoApprove: section.autoApprove }
    });
  } catch (e) {
    console.error('[Withdrawals] 保存配置失败:', e);
    res.status(500).json({ code: 1, message: '保存配置失败', error: e.message });
  }
});

/**
 * 获取提现申请详情（后台）
 * 遇数据库连接重置(ECONNRESET)时自动重试最多 3 次
 */
router.get('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const findDetail = () =>
    CommissionWithdrawal.findByPk(id, {
      include: [{ model: Member, as: 'member', attributes: ['id', 'nickname', 'phone', 'openid', 'availableCommission', 'frozenCommission'] }]
    });
  let withdrawal;
  try {
    withdrawal = await withRetryOnConnReset(findDetail);
  } catch (error) {
    console.error('获取提现详情失败:', error);
    return res.status(500).json({ code: 1, message: '获取提现详情失败', error: error.message });
  }
  if (!withdrawal) {
    return res.status(404).json({ code: 1, message: '提现申请不存在' });
  }
  try {
    const m = withdrawal.member || {};
    res.json({
      code: 0,
      message: '获取成功',
      data: {
        withdrawal: {
          id: withdrawal.id,
          withdrawalNo: withdrawal.withdrawalNo,
          memberId: withdrawal.memberId,
          memberNickname: m.nickname,
          memberPhone: m.phone,
          amount: withdrawal.amount,
          accountType: withdrawal.accountType,
          accountTypeText: withdrawal.accountType === 'wechat' ? '微信钱包' : withdrawal.accountType === 'alipay' ? '支付宝' : '银行',
          accountName: withdrawal.accountName,
          accountNumber: withdrawal.accountNumber,
          bankName: withdrawal.bankName,
          bankBranch: withdrawal.bankBranch,
          status: withdrawal.status,
          statusText: statusText(withdrawal.status),
          remark: withdrawal.remark,
          adminRemark: withdrawal.adminRemark,
          processedAt: withdrawal.processedAt,
          completedAt: withdrawal.completedAt,
          createdAt: withdrawal.createdAt,
          transferBillNo: withdrawal.transferBillNo || null
        }
      }
    });
  } catch (e) {
    res.status(500).json({ code: 1, message: '获取提现详情失败', error: e.message });
  }
});

/**
 * 通过审核（待审核 -> 已通过）
 * 若账户类型为微信钱包，通过时立即发起商家转账到零钱，成功后再扣减冻结佣金
 */
router.put('/:id/approve', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { withdrawal } = await withdrawalService.performApprove(id, { processedBy: req.user.id });
    res.json({
      code: 0,
      message: withdrawal.accountType === 'wechat' ? '已通过并已发起微信转账' : '已通过审核',
      data: { withdrawal: { id: withdrawal.id, status: 'approved' } }
    });
  } catch (error) {
    if (error.message === '提现申请不存在') {
      return res.status(404).json({ code: 1, message: error.message });
    }
    if (error.message === '只能审核待审核状态的申请' || error.message.includes('openid')) {
      return res.status(400).json({ code: 1, message: error.message });
    }
    console.error('审核通过失败:', error);
    res.status(500).json({ code: 1, message: error.message || '操作失败' });
  }
});

/**
 * 拒绝提现（待审核 -> 已拒绝，并解冻佣金）
 */
router.put('/:id/reject', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { adminRemark = '' } = req.body;
    const withdrawal = await CommissionWithdrawal.findByPk(id, { include: [{ model: Member, as: 'member' }] });
    if (!withdrawal) return res.status(404).json({ code: 1, message: '提现申请不存在' });
    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ code: 1, message: '只能拒绝待审核状态的申请' });
    }
    const member = withdrawal.member;
    if (!member) return res.status(500).json({ code: 1, message: '会员信息不存在' });
    const amount = parseFloat(withdrawal.amount);
    await withdrawal.update({
      status: 'rejected',
      processedBy: req.user.id,
      processedAt: new Date(),
      adminRemark: (adminRemark || '').trim()
    });
    await member.update({
      availableCommission: parseFloat(member.availableCommission || 0) + amount,
      frozenCommission: Math.max(0, parseFloat(member.frozenCommission || 0) - amount)
    });
    res.json({ code: 0, message: '已拒绝，佣金已退回可用余额', data: { withdrawal: { id: withdrawal.id, status: 'rejected' } } });
  } catch (error) {
    console.error('拒绝提现失败:', error);
    res.status(500).json({ code: 1, message: '操作失败', error: error.message });
  }
});

/**
 * 标记已完成（已通过/处理中 -> 已完成）
 * 微信钱包：通过时已转账并已扣冻结，此处仅更新状态；银行：此处扣减冻结佣金并更新状态
 */
router.put('/:id/complete', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const withdrawal = await CommissionWithdrawal.findByPk(id, { include: [{ model: Member, as: 'member' }] });
    if (!withdrawal) return res.status(404).json({ code: 1, message: '提现申请不存在' });
    if (!['approved', 'processing'].includes(withdrawal.status)) {
      return res.status(400).json({ code: 1, message: '只能对已通过或处理中的申请标记已完成' });
    }
    const member = withdrawal.member;
    if (!member) return res.status(500).json({ code: 1, message: '会员信息不存在' });
    const amount = parseFloat(withdrawal.amount);

    if (withdrawal.accountType === 'bank') {
      await member.update({
        frozenCommission: Math.max(0, parseFloat(member.frozenCommission || 0) - amount)
      });
    }

    await withdrawal.update({
      status: 'completed',
      completedAt: new Date()
    });
    res.json({ code: 0, message: '已标记为已完成', data: { withdrawal: { id: withdrawal.id, status: 'completed' } } });
  } catch (error) {
    console.error('标记完成失败:', error);
    res.status(500).json({ code: 1, message: '操作失败', error: error.message });
  }
});

/**
 * 更新管理员备注
 */
router.put('/:id/remark', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { adminRemark = '' } = req.body;
    const withdrawal = await CommissionWithdrawal.findByPk(id);
    if (!withdrawal) return res.status(404).json({ code: 1, message: '提现申请不存在' });
    await withdrawal.update({ adminRemark: (adminRemark || '').trim() });
    res.json({ code: 0, message: '备注已更新', data: { withdrawal: { id: withdrawal.id, adminRemark: withdrawal.adminRemark } } });
  } catch (error) {
    console.error('更新备注失败:', error);
    res.status(500).json({ code: 1, message: '操作失败', error: error.message });
  }
});

/**
 * 撤销转账（用户未确认收款前）：锁定资金退回商户，提现改为已取消，用户佣金退回可用余额
 */
router.post('/:id/cancel-transfer', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { withdrawal } = await withdrawalService.cancelTransfer(id);
    res.json({
      code: 0,
      message: '已提交撤销，资金将退回商户，用户佣金已退回可用余额',
      data: { withdrawal: { id: withdrawal.id, status: withdrawal.status } }
    });
  } catch (error) {
    if (error.message === '提现申请不存在') {
      return res.status(404).json({ code: 1, message: error.message });
    }
    if (error.message.includes('仅支持') || error.message.includes('只能撤销') || error.message.includes('撤销转账')) {
      return res.status(400).json({ code: 1, message: error.message });
    }
    console.error('撤销转账失败:', error);
    res.status(500).json({ code: 1, message: error.message || '操作失败' });
  }
});

module.exports = router;
