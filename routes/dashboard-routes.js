const express = require('express');
const router = express.Router();
const { Order, Member, Product } = require('../db');
const { Op } = require('sequelize');

/**
 * GET /api/dashboard/stats
 * Returns real stats for dashboard: total counts, today's orders/sales, recent orders.
 */
router.get('/stats', async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [totalOrders, totalMembers, totalProducts, todayOrders, todaySalesResult, recentOrders] = await Promise.all([
      Order.count(),
      Member.count(),
      Product.count(),
      Order.count({
        where: { createdAt: { [Op.between]: [todayStart, todayEnd] } }
      }),
      Order.sum('totalAmount', {
        where: {
          createdAt: { [Op.between]: [todayStart, todayEnd] },
          status: { [Op.in]: ['paid', 'shipped', 'delivered', 'completed'] }
        }
      }),
      Order.findAll({
        include: [{ model: Member, as: 'member', attributes: ['id', 'nickname', 'phone'], required: false }],
        order: [['createdAt', 'DESC']],
        limit: 10,
        attributes: ['id', 'orderNo', 'totalAmount', 'status', 'createdAt']
      })
    ]);

    const todaySales = todaySalesResult != null ? parseFloat(todaySalesResult) : 0;

    const statusLabel = {
      pending: '待支付',
      paid: '待发货',
      shipped: '已发货',
      delivered: '待收货',
      completed: '已完成',
      cancelled: '已取消',
      refunded: '已退款',
      returned: '已退货'
    };

    const recent = (recentOrders || []).map(o => ({
      orderNo: o.orderNo,
      user: (o.member && o.member.nickname) || o.member?.phone || '-',
      amount: o.totalAmount,
      status: statusLabel[o.status] || o.status,
      createdAt: o.createdAt
    }));

    res.json({
      code: 0,
      data: {
        totalOrders,
        totalMembers,
        totalProducts,
        todayOrders,
        todaySales,
        recentOrders: recent
      }
    });
  } catch (err) {
    console.error('[Dashboard] stats error:', err);
    res.status(500).json({ code: 1, message: '获取统计数据失败' });
  }
});

module.exports = router;
