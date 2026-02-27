/**
 * 优惠券列表页面
 */

const request = require('../../utils/request.js');
const { API } = require('../../config/api.js');
const auth = require('../../utils/auth.js');

Page({
  data: {
    coupons: [],
    currentTab: 'all', // all, available, used, expired
    page: 1,
    limit: 20,
    hasMore: true,
    loading: false,
    tabs: [
      { key: 'all', label: '全部' },
      { key: 'available', label: '可用' },
      { key: 'used', label: '已用' },
      { key: 'expired', label: '已过期' }
    ]
  },

  onLoad(options) {
    // 如果从订单确认页跳转过来，设置tab为可用
    if (options.from === 'order') {
      this.setData({ currentTab: 'available' });
    }
    this.loadCoupons(true);
  },

  onPullDownRefresh() {
    this.setData({
      page: 1,
      coupons: [],
      hasMore: true
    });
    this.loadCoupons(true).then(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadCoupons(false);
    }
  },

  // 切换标签
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({
      currentTab: tab,
      page: 1,
      coupons: [],
      hasMore: true
    });
    this.loadCoupons(true);
  },

  // 加载优惠券列表
  async loadCoupons(refresh = false) {
    if (this.data.loading) return;

    this.setData({ loading: true });

    try {
      if (!auth.isLogin()) {
        await auth.login();
      }

      const { page, limit, currentTab } = this.data;
      const params = {
        page: refresh ? 1 : page,
        limit,
        status: currentTab
      };

      const res = await request.get(API.COUPON.MY_LIST, params, { needAuth: true });

      if (res.code === 0) {
        const newCoupons = res.data.coupons || [];
        const coupons = refresh ? newCoupons : [...this.data.coupons, ...newCoupons];

        this.setData({
          coupons,
          page: refresh ? 2 : page + 1,
          hasMore: res.data.hasMore,
          loading: false
        });
      } else {
        wx.showToast({
          title: res.message || '加载失败',
          icon: 'none'
        });
        this.setData({ loading: false });
      }
    } catch (error) {
      console.error('加载优惠券失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      this.setData({ loading: false });
    }
  },

  // 领取优惠券
  async onReceiveCoupon(e) {
    const couponId = e.currentTarget.dataset.id;
    
    try {
      wx.showLoading({ title: '领取中...' });
      const url = API.COUPON.RECEIVE.replace(':id', couponId);
      const res = await request.post(url, {}, { needAuth: true });

      if (res.code === 0) {
        wx.showToast({
          title: '领取成功',
          icon: 'success'
        });
        // 刷新列表
        this.setData({
          page: 1,
          coupons: [],
          hasMore: true
        });
        this.loadCoupons(true);
      } else {
        wx.showToast({
          title: res.message || '领取失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('领取优惠券失败:', error);
      wx.showToast({
        title: '领取失败',
        icon: 'none'
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 选择优惠券（从订单确认页跳转过来时使用）
  onSelectCoupon(e) {
    const coupon = e.currentTarget.dataset.coupon;
    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2];
    
    if (prevPage && prevPage.route === 'pages/order-confirm/order-confirm') {
      prevPage.selectCoupon(coupon);
      wx.navigateBack();
    }
  },

  // 格式化金额
  formatAmount(amount) {
    return parseFloat(amount || 0).toFixed(2);
  },

  // 格式化时间
  formatTime(time) {
    if (!time) return '';
    const date = new Date(time);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 获取优惠券显示值
  getCouponValue(coupon) {
    if (coupon.discountType === 'percentage') {
      return `${coupon.discountValue}折`;
    } else if (coupon.discountType === 'fixed') {
      return `¥${this.formatAmount(coupon.discountValue)}`;
    } else {
      return `¥${this.formatAmount(coupon.value)}`;
    }
  }
});

