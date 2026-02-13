/**
 * 后台管理 - 佣金提现申请管理
 */
const express = require('express');
const { Op } = require('sequelize');
const { CommissionWithdrawal, Member } = require('../db');
const { authenticateToken } = require('../middleware/auth');

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

/**
 * 获取提现申请列表（后台）
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
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

    const { count, rows } = await CommissionWithdrawal.findAndCountAll({
      where,
      include: [{ model: Member, as: 'member', attributes: ['id', 'nickname', 'phone', 'openid', 'availableCommission', 'frozenCommission'] }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset
    });

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
        accountTypeText: w.accountType === 'wechat' ? '微信' : w.accountType === 'alipay' ? '支付宝' : '银行卡',
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
 * 获取提现申请详情（后台）
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const withdrawal = await CommissionWithdrawal.findByPk(id, {
      include: [{ model: Member, as: 'member', attributes: ['id', 'nickname', 'phone', 'openid', 'availableCommission', 'frozenCommission', 'totalCommission'] }]
    });
    if (!withdrawal) {
      return res.status(404).json({ code: 1, message: '提现申请不存在' });
    }
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
          accountTypeText: withdrawal.accountType === 'wechat' ? '微信' : withdrawal.accountType === 'alipay' ? '支付宝' : '银行卡',
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
          createdAt: withdrawal.createdAt
        }
      }
    });
  } catch (error) {
    console.error('获取提现详情失败:', error);
    res.status(500).json({ code: 1, message: '获取提现详情失败', error: error.message });
  }
});

/**
 * 通过审核（待审核 -> 已通过）
 */
router.put('/:id/approve', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const withdrawal = await CommissionWithdrawal.findByPk(id, { include: [{ model: Member, as: 'member' }] });
    if (!withdrawal) return res.status(404).json({ code: 1, message: '提现申请不存在' });
    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ code: 1, message: '只能审核待审核状态的申请' });
    }
    await withdrawal.update({
      status: 'approved',
      processedBy: req.user.id,
      processedAt: new Date()
    });
    res.json({ code: 0, message: '已通过审核', data: { withdrawal: { id: withdrawal.id, status: withdrawal.status } } });
  } catch (error) {
    console.error('审核通过失败:', error);
    res.status(500).json({ code: 1, message: '操作失败', error: error.message });
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
 * 标记已完成（已通过/处理中 -> 已完成，扣减冻结佣金）
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
    await withdrawal.update({
      status: 'completed',
      completedAt: new Date()
    });
    await member.update({
      frozenCommission: Math.max(0, parseFloat(member.frozenCommission || 0) - amount)
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

module.exports = router;
