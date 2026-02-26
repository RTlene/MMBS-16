/**
 * 退款申请页面
 */

const request = require('../../utils/request.js');
const { API, replaceUrlParams } = require('../../config/api.js');
const auth = require('../../utils/auth.js');

Page({
  data: {
    orderId: null,
    order: null,
    reason: '',
    refundAmount: 0,
    refundMethod: 'original',
    methods: [
      { value: 'original', label: '原路退回' },
      { value: 'points', label: '退到积分' },
      { value: 'commission', label: '退到佣金' }
    ],
    submitting: false
  },

  onLoad(options) {
    const { orderId } = options;
    if (!orderId) {
      wx.showToast({
        title: '订单ID缺失',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
      return;
    }

    this.setData({ orderId });
    this.loadOrderDetail();
  },

  /**
   * 加载订单详情
   */
  async loadOrderDetail() {
    try {
      if (!auth.isLogin()) {
        await auth.login();
      }

      const url = replaceUrlParams(API.ORDER.DETAIL, { id: this.data.orderId });
      const res = await request.get(url, {}, { needAuth: true });

      if (res.code === 0 && res.data && res.data.order) {
        const order = res.data.order;
        
        // 仅未发货或已取消可申请退款；退货成功由商家处理退款
        const canRefund = ['paid', 'cancelled'].includes(order.status);

        if (!canRefund) {
          wx.showToast({
            title: '仅未发货或已取消的订单可申请退款',
            icon: 'none'
          });
          setTimeout(() => {
            wx.navigateBack();
          }, 2000);
          return;
        }

        // 检查是否已有退款申请
        if (order.refundStatus && order.refundStatus !== 'none') {
          wx.showToast({
            title: '订单已存在退款申请',
            icon: 'none'
          });
          setTimeout(() => {
            wx.navigateBack();
          }, 2000);
          return;
        }

        // 计算退款金额
        const refundAmount = order.returnAmount || order.totalAmount || 0;

        this.setData({ 
          order,
          refundAmount: parseFloat(refundAmount)
        });
      } else {
        throw new Error(res.message || '加载失败');
      }
    } catch (error) {
      console.error('加载订单详情失败:', error);
      wx.showToast({
        title: error.message || '加载失败',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 2000);
    }
  },

  /**
   * 输入退款原因
   */
  onInputReason(e) {
    this.setData({
      reason: e.detail.value
    });
  },

  /**
   * 输入退款金额
   */
  onInputAmount(e) {
    const amount = parseFloat(e.detail.value) || 0;
    const maxAmount = this.data.order ? (this.data.order.returnAmount || this.data.order.totalAmount || 0) : 0;
    const finalAmount = Math.min(Math.max(0, amount), maxAmount);
    this.setData({
      refundAmount: finalAmount
    });
  },

  /**
   * 选择退款方式
   */
  onSelectMethod(e) {
    const method = e.currentTarget.dataset.method;
    this.setData({ refundMethod: method });
  },

  /**
   * 提交退款申请
   */
  async onSubmit() {
    if (this.data.submitting) return;

    // 验证
    if (!this.data.reason || !this.data.reason.trim()) {
      wx.showToast({
        title: '请输入退款原因',
        icon: 'none'
      });
      return;
    }

    if (this.data.refundAmount <= 0) {
      wx.showToast({
        title: '退款金额必须大于0',
        icon: 'none'
      });
      return;
    }

    if (!auth.isLogin()) {
      await auth.login();
    }

    this.setData({ submitting: true });

    try {
      const url = replaceUrlParams(API.ORDER.REQUEST_REFUND, { id: this.data.orderId });
      const payload = {
        reason: this.data.reason.trim(),
        refundAmount: this.data.refundAmount,
        refundMethod: this.data.refundMethod
      };

      const res = await request.post(url, payload, { needAuth: true });

      if (res.code === 0) {
        wx.showToast({
          title: '申请提交成功',
          icon: 'success'
        });

        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        throw new Error(res.message || '提交失败');
      }
    } catch (error) {
      console.error('提交退款申请失败:', error);
      wx.showToast({
        title: error.message || '提交失败',
        icon: 'none'
      });
    } finally {
      this.setData({ submitting: false });
    }
  },

  /**
   * 设置最大金额
   */
  onSetMaxAmount() {
    if (this.data.order) {
      const maxAmount = this.data.order.returnAmount || this.data.order.totalAmount || 0;
      this.setData({
        refundAmount: parseFloat(maxAmount)
      });
    }
  },

  /**
   * 格式化金额
   */
  formatAmount(amount) {
    return parseFloat(amount || 0).toFixed(2);
  }
});

