/**
 * 佣金明细页面
 */

const request = require('../../utils/request.js');
const { API } = require('../../config/api.js');

Page({
  data: {
    records: [],
    stats: null,
    currentTab: 'all', // all, direct, indirect, differential, team_expansion
    currentStatus: 'all', // all, pending, completed
    page: 1,
    limit: 10,
    hasMore: true,
    loading: false,
    tabs: [
      { key: 'all', label: '全部' },
      { key: 'direct', label: '直接佣金' },
      { key: 'indirect', label: '间接佣金' },
      { key: 'differential', label: '差额佣金' },
      { key: 'team_expansion', label: '团队拓展' }
    ],
    statusTabs: [
      { key: 'all', label: '全部' },
      { key: 'pending', label: '待结算' },
      { key: 'completed', label: '已结算' }
    ]
  },

  onLoad() {
    this.loadStats();
    this.loadRecords(true);
  },

  onPullDownRefresh() {
    this.setData({
      page: 1,
      records: [],
      hasMore: true
    });
    this.loadStats();
    this.loadRecords(true).then(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadRecords(false);
    }
  },

  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({
      currentTab: tab,
      page: 1,
      records: [],
      hasMore: true
    });
    this.loadRecords(true);
  },

  onStatusTabChange(e) {
    const status = e.currentTarget.dataset.status;
    this.setData({
      currentStatus: status,
      page: 1,
      records: [],
      hasMore: true
    });
    this.loadRecords(true);
  },

  async loadStats() {
    try {
      const res = await request.get(API.COMMISSION.STATS);
      if (res.code === 0) {
        const s = res.data || {};
        this.setData({
          stats: {
            ...s,
            totalCommissionText: this.formatAmount(s.totalCommission),
            totalCount: s.totalCount || 0
          }
        });
      }
    } catch (error) {
      console.error('加载佣金统计失败:', error);
    }
  },

  async loadRecords(refresh = false) {
    if (this.data.loading) return;

    this.setData({ loading: true });

    try {
      const { page, limit, currentTab, currentStatus } = this.data;
      const params = {
        page: refresh ? 1 : page,
        limit
      };

      if (currentTab !== 'all') {
        params.type = currentTab;
      }

      if (currentStatus !== 'all') {
        params.status = currentStatus;
      }

      const res = await request.get(API.COMMISSION.LIST, params);

      if (res.code === 0) {
        const list = (res.data.records || []).map((item) => this.normalizeRecord(item));
        const records = refresh ? list : [...this.data.records, ...list];

        this.setData({
          records,
          page: refresh ? 2 : page + 1,
          hasMore: res.data.hasMore,
          loading: false
        });
      } else {
        wx.showToast({ title: res.message || '加载失败', icon: 'none' });
        this.setData({ loading: false });
      }
    } catch (error) {
      console.error('加载佣金明细失败:', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  normalizeRecord(item = {}) {
    const amountNum = Number(item.amount || 0);
    const orderAmountNum = item.orderAmount == null ? null : Number(item.orderAmount || 0);
    const balanceNum = item.balance == null ? null : Number(item.balance || 0);
    return {
      ...item,
      amount: amountNum,
      amountText: this.formatAmount(amountNum),
      orderAmountText: orderAmountNum == null ? '' : this.formatAmount(orderAmountNum),
      balanceText: balanceNum == null ? '' : this.formatAmount(balanceNum),
      createdAtText: this.formatTime(item.createdAt)
    };
  },

  formatAmount(amount) {
    return Number(amount || 0).toFixed(2);
  },

  formatTime(time) {
    if (!time) return '';
    const date = new Date(time);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }
});
