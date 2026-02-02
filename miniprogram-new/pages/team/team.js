const request = require('../../utils/request');
const { API, API_BASE_URL } = require('../../config/api');
const auth = require('../../utils/auth');

function buildAvatar(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (/^data:image\//i.test(url)) return url;
  return `${API_BASE_URL}${url.startsWith('/') ? url : `/${url}`}`;
}

Page({
  data: {
    stats: {
      directMembers: 0,
      totalMembers: 0,
      monthlyNewMembers: 0,
      totalCommission: 0,
      availableCommission: 0,
      totalOrders: 0,
      totalAmount: 0,
      memberLevelName: '',
      distributorLevelName: ''
    },
    members: [],
    page: 1,
    limit: 10,
    hasMore: true,
    loading: false,
    level: 'direct' // direct | all
  },

  onShow() {
    if (!auth.isLogin()) {
      auth.login().then(res => {
        if (res.success) {
          this.init();
        }
      });
      return;
    }
    this.init();
  },

  init() {
    this.setData({ members: [], page: 1, hasMore: true });
    this.loadStats();
    this.loadMembers();
  },

  async loadStats() {
    try {
      const res = await request.get(API.MEMBER.STATS, {}, { needAuth: true, showLoading: false, showError: false });
      if (res.code === 0 && res.data) {
        const s = res.data;
        this.setData({
          stats: {
            directMembers: s.directMembers || 0,
            totalMembers: s.totalMembers || 0,
            monthlyNewMembers: s.monthlyNewMembers || 0,
            totalCommission: s.totalCommission || 0,
            availableCommission: parseFloat(s.availableCommission || 0),
            totalSales: s.totalSales || 0,
            directSales: s.directSales || 0,
            indirectSales: s.indirectSales || 0,
            memberLevelName: (s.memberLevel && s.memberLevel.name) || '普通会员',
            distributorLevelName: (s.distributorLevel && s.distributorLevel.name) || '普通'
          }
        });
      }
    } catch (err) {
      console.warn('[Team] loadStats fail', err);
    }
  },

  async loadMembers() {
    if (this.data.loading || !this.data.hasMore) return;
    this.setData({ loading: true });
    const { page, limit, level } = this.data;
    try {
      const res = await request.get(API.MEMBER.TEAM, {
        page,
        limit,
        level
      }, { needAuth: true, showLoading: false });
      if (res.code === 0 && res.data) {
        const list = (res.data.members || []).map(m => {
          // 格式化注册时间
          let registeredAt = '';
          if (m.createdAt) {
            const date = new Date(m.createdAt);
            registeredAt = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          }
          return {
            id: m.id,
            nickname: m.nickname || '未设置',
            avatar: buildAvatar(m.avatar),
            phone: m.phone,
            memberLevel: m.memberLevel,
            statusText: m.statusText,
            registeredAt: registeredAt,
            totalSales: m.totalSales || 0
          };
        });
        const merged = [...this.data.members, ...list];
        this.setData({
          members: merged,
          page: page + 1,
          hasMore: res.data.hasMore,
        });
      }
    } catch (err) {
      console.warn('[Team] loadMembers fail', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onReachBottom() {
    this.loadMembers();
  },

  onSwitchLevel(e) {
    const level = e.currentTarget.dataset.level;
    if (level === this.data.level) return;
    this.setData({ level, members: [], page: 1, hasMore: true }, () => {
      this.loadMembers();
    });
  },

  /**
   * 佣金提现
   */
  onWithdraw() {
    // 检查可用佣金
    if (!this.data.stats.availableCommission || this.data.stats.availableCommission <= 0) {
      wx.showToast({
        title: '可用佣金不足，无法提现',
        icon: 'none'
      });
      return;
    }

    if (!auth.isLogin()) {
      auth.login().then(res => {
        if (res.success) {
          this.goToWithdraw();
        }
      });
      return;
    }
    this.goToWithdraw();
  },

  goToWithdraw() {
    wx.navigateTo({
      url: '/pages/withdrawal/withdrawal'
    });
  },

  /**
   * 查看佣金明细
   */
  onViewCommission() {
    if (!auth.isLogin()) {
      auth.login().then(res => {
        if (res.success) {
          wx.navigateTo({
            url: '/pages/commission/commission'
          });
        }
      });
      return;
    }
    wx.navigateTo({
      url: '/pages/commission/commission'
    });
  }
});

