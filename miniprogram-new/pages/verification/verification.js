const request = require('../../utils/request');
const { API, replaceUrlParams } = require('../../config/api');

Page({
  data: {
    codes: [],
    status: 'all', // all, unused, used, expired
    page: 1,
    limit: 20,
    hasMore: true,
    loading: false,
    empty: false
  },

  onLoad(options) {
    const { status = 'all' } = options;
    this.setData({ status });
    this.loadCodes();
  },

  onPullDownRefresh() {
    this.setData({
      page: 1,
      hasMore: true,
      codes: []
    });
    this.loadCodes().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadCodes();
    }
  },

  async loadCodes() {
    if (this.data.loading) return;
    
    this.setData({ loading: true });

    try {
      const { status, page, limit } = this.data;
      const url = replaceUrlParams(API.VERIFICATION.LIST, {});
      const res = await request.get(url, {
        status,
        page,
        limit
      });

      if (res.code === 0) {
        const { codes, hasMore } = res.data;
        // 格式化日期
        const formattedCodes = codes.map(code => ({
          ...code,
          expiredAt: code.expiredAt ? this.formatDate(code.expiredAt) : '',
          createdAt: this.formatDate(code.createdAt),
          usedAt: code.usedAt ? this.formatDate(code.usedAt) : ''
        }));
        const newCodes = page === 1 ? formattedCodes : [...this.data.codes, ...formattedCodes];
        
        this.setData({
          codes: newCodes,
          hasMore,
          page: page + 1,
          empty: newCodes.length === 0
        });
      } else {
        wx.showToast({
          title: res.message || '加载失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('[Verification] 加载核销码失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  onStatusChange(e) {
    const status = e.currentTarget.dataset.status;
    if (status === this.data.status) return;
    
    this.setData({
      status,
      page: 1,
      hasMore: true,
      codes: []
    });
    this.loadCodes();
  },

  onCodeTap(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/verification-detail/verification-detail?id=${id}`
    });
  },

  onCopyCode(e) {
    const { code } = e.currentTarget.dataset;
    wx.setClipboardData({
      data: code,
      success: () => {
        wx.showToast({
          title: '已复制',
          icon: 'success'
        });
      }
    });
  },

  formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  }
});

