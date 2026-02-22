/**
 * 订单支付成功后的会员积分发放
 * 订单完成（status=paid）时按配置给下单会员增加积分，防重复发放
 */

const { Order, Member, MemberLevel, MemberPointsRecord, PointSourceConfig } = require('../db');

/**
 * 订单支付成功后发放积分（幂等：同一订单只发一次）
 * @param {number} orderId 订单ID
 * @returns {Promise<{ granted: boolean, points?: number, message?: string }>}
 */
async function grantPointsForOrderPaid(orderId) {
    const order = await Order.findByPk(orderId, { attributes: ['id', 'memberId', 'status', 'totalAmount'] });
    if (!order || order.status !== 'paid') return { granted: false, message: '订单不存在或未支付' };
    const memberId = order.memberId;
    if (!memberId) return { granted: false, message: '订单无会员' };

    const existing = await MemberPointsRecord.findOne({
        where: { memberId, sourceId: orderId, source: 'order' }
    });
    if (existing) return { granted: false, message: '该订单已发放过积分' };

    const orderAmount = Math.max(0, parseFloat(order.totalAmount) || 0);

    let basePoints = 0;
    let multiplier = 1;
    const orderSourceConfig = await PointSourceConfig.findOne({
        where: { source: 'order', isEnabled: true }
    });
    if (orderSourceConfig) {
        basePoints = parseInt(orderSourceConfig.basePoints, 10) || 0;
        multiplier = parseFloat(orderSourceConfig.multiplier) || 1;
    }

    const member = await Member.findByPk(memberId, {
        attributes: ['id', 'totalPoints', 'availablePoints', 'memberLevelId'],
        include: [{ model: MemberLevel, as: 'memberLevel', attributes: ['pointsRate'], required: false }]
    });
    if (!member) return { granted: false, message: '会员不存在' };

    const pointsRate = parseFloat(member.memberLevel && member.memberLevel.pointsRate) || 1;
    const rawPoints = (basePoints + orderAmount * multiplier) * pointsRate;
    const points = Math.max(0, Math.round(rawPoints));
    if (points <= 0) return { granted: false, message: '计算积分为0' };

    const newTotalPoints = (parseInt(member.totalPoints, 10) || 0) + points;
    const newAvailablePoints = (parseInt(member.availablePoints, 10) || 0) + points;

    await MemberPointsRecord.create({
        memberId,
        type: 'earn',
        points,
        balance: newAvailablePoints,
        source: 'order',
        sourceId: orderId,
        description: `订单完成获得${points}积分`,
        status: 'completed'
    });

    await member.update({
        totalPoints: newTotalPoints,
        availablePoints: newAvailablePoints
    });

    return { granted: true, points };
}

module.exports = { grantPointsForOrderPaid };
