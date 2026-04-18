/**
 * 佣金提现手续费：从配置 withdrawal.commissionWithdrawalFee 读取比例与定额。
 * 申请金额 amount 为从可用佣金中扣减的总额（含手续费）；实际打款/到账为 netAmount。
 */

function round2(n) {
    const x = parseFloat(n);
    if (!Number.isFinite(x)) return 0;
    return Math.round(x * 100) / 100;
}

/**
 * @param {number} grossYuan - 用户申请的提现金额（从可用佣金扣除的总额）
 * @param {object} [withdrawalSection] - configStore.getSection('withdrawal')
 * @returns {{ grossYuan: number, feeAmount: number, netAmount: number, percentUsed: number, fixedUsed: number }}
 */
function computeCommissionWithdrawalFee(grossYuan, withdrawalSection) {
    const gross = round2(grossYuan);
    const feeCfg = (withdrawalSection && withdrawalSection.commissionWithdrawalFee) || {};
    const pct = Math.max(0, Math.min(100, parseFloat(feeCfg.percent) || 0));
    const fixed = Math.max(0, parseFloat(feeCfg.fixedYuan) || 0);
    let fee = round2(gross * (pct / 100) + fixed);
    if (fee < 0) fee = 0;
    if (fee > gross) fee = gross;
    const net = round2(gross - fee);
    return {
        grossYuan: gross,
        feeAmount: fee,
        netAmount: net,
        percentUsed: pct,
        fixedUsed: fixed
    };
}

module.exports = {
    round2,
    computeCommissionWithdrawalFee
};
