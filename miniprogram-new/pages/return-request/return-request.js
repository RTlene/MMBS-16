/**
 * 退货申请页面
 */

const request = require('../../utils/request.js');
const { API, replaceUrlParams } = require('../../config/api.js');
const auth = require('../../utils/auth.js');

Page({
  data: {
    orderId: null,
    order: null,
    reason: '',
    description: '',
    images: [],
    reasons: [
      { value: 'quality', label: '质量问题' },
      { value: 'damage', label: '商品损坏' },
      { value: 'wrong_item', label: '发错商品' },
      { value: 'not_satisfied', label: '不满意' },
      { value: 'other', label: '其他原因' }
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
        
        // 检查订单状态
        if (!['delivered', 'shipped'].includes(order.status)) {
          wx.showToast({
            title: '只有已发货或已收货的订单才能申请退货',
            icon: 'none'
          });
          setTimeout(() => {
            wx.navigateBack();
          }, 2000);
          return;
        }

        // 检查是否已有退货申请
        if (order.returnStatus && order.returnStatus !== 'none') {
          wx.showToast({
            title: '订单已存在退货申请',
            icon: 'none'
          });
          setTimeout(() => {
            wx.navigateBack();
          }, 2000);
          return;
        }

        this.setData({ order });
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
   * 选择退货原因
   */
  onSelectReason(e) {
    const reason = e.currentTarget.dataset.reason;
    this.setData({ reason });
  },

  /**
   * 输入详情
   */
  onInputDescription(e) {
    this.setData({
      description: e.detail.value
    });
  },

  /**
   * 选择图片
   */
  async onChooseImage() {
    try {
      const res = await wx.chooseImage({
        count: 3 - this.data.images.length,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera']
      });

      if (res.tempFilePaths && res.tempFilePaths.length > 0) {
        // 这里应该上传图片到服务器，暂时使用临时路径
        // TODO: 实现图片上传功能
        const newImages = [...this.data.images, ...res.tempFilePaths];
        this.setData({
          images: newImages.slice(0, 3) // 最多3张
        });
      }
    } catch (error) {
      console.error('选择图片失败:', error);
    }
  },

  /**
   * 删除图片
   */
  onDeleteImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.images.filter((_, i) => i !== index);
    this.setData({ images });
  },

  /**
   * 提交退货申请
   */
  async onSubmit() {
    if (this.data.submitting) return;

    // 验证
    if (!this.data.reason) {
      wx.showToast({
        title: '请选择退货原因',
        icon: 'none'
      });
      return;
    }

    if (!auth.isLogin()) {
      await auth.login();
    }

    this.setData({ submitting: true });

    try {
      const url = replaceUrlParams(API.ORDER.REQUEST_RETURN, { id: this.data.orderId });
      const payload = {
        reason: this.data.reason,
        description: this.data.description,
        images: this.data.images // TODO: 上传图片后使用服务器URL
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
      console.error('提交退货申请失败:', error);
      wx.showToast({
        title: error.message || '提交失败',
        icon: 'none'
      });
    } finally {
      this.setData({ submitting: false });
    }
  }
});

