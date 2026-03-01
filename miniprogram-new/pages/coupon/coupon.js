/**
 * 优惠券列表页面
 */

const request = require('../../utils/request.js');
const { API } = require('../../config/api.js');
const auth = require('../../utils/auth.js');

Page({
  data: {
    coupons: [],
    claimableCoupons: [], // 可领取列表（currentTab 为 claimable 时使用）
    currentTab: 'all', // all, available, used, expired, claimable
    page: 1,
    limit: 20,
    hasMore: true,
    loading: false,
    tabs: [
      { key: 'claimable', label: '可领取' },
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
      claimableCoupons: [],
      hasMore: true
    });
    this.loadCoupons(true).then(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    if (this.data.currentTab === 'claimable') return;
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
      claimableCoupons: [],
      hasMore: true
    });
    this.loadCoupons(true);
  },

  // 加载优惠券列表（我的）或可领取列表
  async loadCoupons(refresh = false) {
    if (this.data.loading) return;

    this.setData({ loading: true });

    try {
      if (!auth.isLogin()) {
        await auth.login();
      }

      const { page, limit, currentTab } = this.data;

      if (currentTab === 'claimable') {
        const res = await request.get(API.COUPON.CLAIMABLE, {}, { needAuth: true });
        if (res.code === 0) {
          const list = (res.data.coupons || []).map(item => ({
            ...item,
            displayValue: this.getCouponValue(item),
            thresholdText: this.getCouponThreshold(item),
            validRange: (this.formatTime(item.validFrom) && this.formatTime(item.validTo)) ? (this.formatTime(item.validFrom) + ' 至 ' + this.formatTime(item.validTo)) : (this.formatTime(item.validFrom) || this.formatTime(item.validTo) || '')
          }));
          this.setData({
            claimableCoupons: list,
            loading: false
          });
        } else {
          wx.showToast({ title: res.message || '加载失败', icon: 'none' });
          this.setData({ loading: false });
        }
        return;
      }

      const params = {
        page: refresh ? 1 : page,
        limit,
        status: currentTab
      };
      const res = await request.get(API.COUPON.MY_LIST, params, { needAuth: true });

      if (res.code === 0) {
        const newCoupons = (res.data.coupons || []).map(item => ({
          ...item,
          displayValue: this.getCouponValue(item),
          thresholdText: this.getCouponThreshold(item),
          validRange: (this.formatTime(item.validFrom) && this.formatTime(item.validTo)) ? (this.formatTime(item.validFrom) + ' 至 ' + this.formatTime(item.validTo)) : (this.formatTime(item.validFrom) || this.formatTime(item.validTo) || '')
        }));
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
        this.setData({
          page: 1,
          coupons: [],
          claimableCoupons: [],
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

  // 获取优惠券显示值（面值/折扣）：固定金额显示面值 value，折扣显示 x折
  getCouponValue(coupon) {
    if (!coupon) return '';
    const type = (coupon.discountType || 'fixed').toLowerCase();
    if (type === 'percentage' || type === 'percent') {
      const v = Number(coupon.discountValue != null ? coupon.discountValue : coupon.value);
      let zhe = v;
      if (v > 10) zhe = v / 10;
      else if (v > 0 && v < 1) zhe = v * 10;
      return `${Number.isFinite(zhe) ? zhe : 0}折`;
    }
    // 固定金额/代金券：优先显示面值 value
    const face = coupon.value != null ? coupon.value : coupon.discountValue;
    return `¥${this.formatAmount(face != null ? face : 0)}`;
  },

  // 使用门槛文案（统一显示，避免不显示或不全）
  getCouponThreshold(coupon) {
    const min = coupon.minOrderAmount != null ? Number(coupon.minOrderAmount) : (coupon.minAmount != null ? Number(coupon.minAmount) : null);
    if (min != null && min > 0) return `满${this.formatAmount(min)}可用`;
    return '无门槛';
  }
});

