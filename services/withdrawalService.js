/**
 * 提现业务：审核通过逻辑（微信转账 + 扣减冻结等），供后台审核与小额自动通过共用
 */
const { CommissionWithdrawal, Member } = require('../db');
const wechatPayService = require('./wechatPayService');

/**
 * 执行“通过审核”：微信则发起转账并扣减冻结，然后更新提现状态为已通过
 * @param {number} withdrawalId - 提现记录 ID
 * @param {{ processedBy?: number }} options - processedBy 为后台操作人 ID，自动通过可不传
 * @returns {Promise<{ withdrawal: object }>}
 */
async function performApprove(withdrawalId, options = {}) {
    const withdrawal = await CommissionWithdrawal.findByPk(withdrawalId, {
        include: [{ model: Member, as: 'member' }]
    });
    if (!withdrawal) throw new Error('提现申请不存在');
    if (withdrawal.status !== 'pending') throw new Error('只能审核待审核状态的申请');
    const member = withdrawal.member;
    if (!member) throw new Error('会员信息不存在');
    const amount = parseFloat(withdrawal.amount);

    if (withdrawal.accountType === 'wechat') {
        const openid = member.openid;
        if (!openid || !openid.trim()) {
            throw new Error('该会员未绑定微信 openid，无法发起微信转账');
        }
        const amountCents = Math.round(amount * 100);
        await wechatPayService.transferToBalance({
            outBatchNo: withdrawal.withdrawalNo,
            openid: openid.trim(),
            amountCents,
            remark: '佣金提现'
        });
        await member.update({
            frozenCommission: Math.max(0, parseFloat(member.frozenCommission || 0) - amount)
        });
    }

    await withdrawal.update({
        status: 'approved',
        processedBy: options.processedBy || null,
        processedAt: new Date()
    });
    return { withdrawal };
}

module.exports = {
    performApprove
};
