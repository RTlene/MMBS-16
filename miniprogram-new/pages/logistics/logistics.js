/**
 * 物流跟踪页面
 */

const request = require('../../utils/request.js');
const { API, replaceUrlParams } = require('../../config/api.js');
const auth = require('../../utils/auth.js');

Page({
  data: {
    orderId: null,
    order: null,
    logistics: {
      shippingCompany: '',
      trackingNumber: '',
      shippingMethod: '',
      shippedAt: null,
      deliveredAt: null
    },
    trackingInfo: null, // 物流轨迹信息（如果有第三方物流API）
    loading: true
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

      this.setData({ loading: true });

      const url = replaceUrlParams(API.ORDER.DETAIL, { id: this.data.orderId });
      const res = await request.get(url, {}, { needAuth: true });

      if (res.code === 0 && res.data && res.data.order) {
        const order = res.data.order;
        
        // 提取物流信息
        const logistics = {
          shippingCompany: order.shippingCompany || '',
          trackingNumber: order.trackingNumber || '',
          shippingMethod: order.shippingMethod || '',
          shippedAt: order.shippedAt,
          deliveredAt: order.deliveredAt
        };

        this.setData({
          order,
          logistics,
          loading: false
        });

        // 如果有物流单号，可以查询物流轨迹
        if (logistics.trackingNumber && logistics.shippingCompany) {
          // this.queryLogisticsTracking();
        }
      } else {
        throw new Error(res.message || '加载失败');
      }
    } catch (error) {
      console.error('加载订单详情失败:', error);
      wx.showToast({
        title: error.message || '加载失败',
        icon: 'none'
      });
      this.setData({ loading: false });
    }
  },

  /**
   * 查询物流轨迹（如果有第三方物流API）
   */
  async queryLogisticsTracking() {
    try {
      const { logistics } = this.data;
      if (!logistics.trackingNumber || !logistics.shippingCompany) {
        return;
      }

      // TODO: 如果有第三方物流API，在这里调用
      // const res = await request.get(API.LOGISTICS.TRACKING, {
      //   company: logistics.shippingCompany,
      //   number: logistics.trackingNumber
      // });

      // 模拟物流轨迹数据
      const mockTrackingInfo = {
        status: 'in_transit',
        statusText: '运输中',
        traces: [
          {
            time: new Date().toISOString(),
            desc: '快件已到达【北京中转站】',
            location: '北京'
          },
          {
            time: new Date(Date.now() - 3600000).toISOString(),
            desc: '快件已从【上海分拨中心】发出',
            location: '上海'
          },
          {
            time: new Date(Date.now() - 7200000).toISOString(),
            desc: '快件已到达【上海分拨中心】',
            location: '上海'
          },
          {
            time: logistics.shippedAt,
            desc: '快件已发货',
            location: '发货地'
          }
        ]
      };

      this.setData({
        trackingInfo: mockTrackingInfo
      });
    } catch (error) {
      console.error('查询物流轨迹失败:', error);
    }
  },

  /**
   * 复制物流单号
   */
  onCopyTrackingNumber() {
    const trackingNumber = this.data.logistics.trackingNumber;
    if (!trackingNumber) {
      wx.showToast({
        title: '暂无物流单号',
        icon: 'none'
      });
      return;
    }

    wx.setClipboardData({
      data: trackingNumber,
      success: () => {
        wx.showToast({
          title: '物流单号已复制',
          icon: 'success'
        });
      }
    });
  },

  /**
   * 格式化时间
   */
  formatTime(time) {
    if (!time) return '';
    const date = new Date(time);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  },

  /**
   * 格式化日期
   */
  formatDate(time) {
    if (!time) return '';
    const date = new Date(time);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  /**
   * 获取物流状态文本
   */
  getLogisticsStatus() {
    const { order, logistics } = this.data;
    
    if (order.status === 'delivered' || order.deliveredAt) {
      return {
        text: '已送达',
        icon: '✅',
        color: '#52c41a'
      };
    } else if (order.status === 'shipped' || logistics.shippedAt) {
      return {
        text: '运输中',
        icon: '🚚',
        color: '#1890ff'
      };
    } else if (order.status === 'paid') {
      return {
        text: '待发货',
        icon: '📦',
        color: '#faad14'
      };
    } else {
      return {
        text: '暂无物流信息',
        icon: '⏳',
        color: '#999'
      };
    }
  }
});

