/**
 * 商品搜索页
 */

const request = require('../../utils/request.js');
const { API } = require('../../config/api.js');
const { buildAbsoluteUrl, buildOptimizedImageUrl, formatMoney, formatBigNumber } = require('../../utils/util.js');

const HISTORY_KEY = 'searchHistory';

Page({
  data: {
    keyword: '',
    searchHistory: [],
    results: [],
    loading: false,
    dataLoaded: false,
    hasError: false,
    error: null,
    showHistory: true,
    page: 1,
    hasMore: true,
    limit: 10
  },

  onLoad(options) {
    const keyword = options.keyword || '';
    this.setData({ keyword });
    this.loadHistory();

    if (keyword) {
      this.searchProducts(keyword);
    }
  },

  onInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onConfirm(e) {
    const keyword = (e.detail.value || '').trim();
    if (!keyword) {
      wx.showToast({
        title: '请输入关键词',
        icon: 'none'
      });
      return;
    }
    this.searchProducts(keyword);
  },

  onSearchTap() {
    const keyword = (this.data.keyword || '').trim();
    if (!keyword) {
      wx.showToast({
        title: '请输入关键词',
        icon: 'none'
      });
      return;
    }
    this.searchProducts(keyword);
  },

  async searchProducts(keyword, loadMore = false) {
    if (!keyword) return;

    // 如果是加载更多，检查是否还有更多数据
    if (loadMore && (!this.data.hasMore || this.data.loading)) {
      return;
    }

    // 如果是新搜索，重置分页
    if (!loadMore) {
      this.setData({
        page: 1,
        hasMore: true,
        results: [],
        showHistory: false
      });
    }

    this.setData({
      loading: true,
      hasError: false,
      error: null
    });

    try {
      const result = await request.get(API.PRODUCT.SEARCH, {
        keyword,
        page: this.data.page,
        limit: this.data.limit
      }, {
        showLoading: false,
        showError: false
      });

      const products = (result.data && result.data.products) ? result.data.products : [];
      const hasMore = result.data ? (result.data.hasMore !== false && products.length >= this.data.limit) : false;

      const processed = products.map(item => ({
        ...item,
        coverImage: item.images && item.images.length > 0 ? buildOptimizedImageUrl(item.images[0], { type: 'list' }) : '',
        priceText: formatMoney(item.price),
        salesText: formatBigNumber(item.sales || 0)
      }));

      this.setData({
        results: loadMore ? [...this.data.results, ...processed] : processed,
        page: this.data.page + 1,
        hasMore: hasMore,
        dataLoaded: true
      });

      if (!loadMore) {
        this.saveHistory(keyword);
      }
    } catch (error) {
      console.error('[Search] 搜索商品失败:', error);
      this.setData({
        hasError: true,
        error: error.message || '搜索失败，请稍后重试',
        results: loadMore ? this.data.results : []
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 加载更多搜索结果
   */
  onReachBottom() {
    if (this.data.keyword && this.data.hasMore && !this.data.loading) {
      this.searchProducts(this.data.keyword, true);
    }
  },

  loadHistory() {
    try {
      const history = wx.getStorageSync(HISTORY_KEY) || [];
      this.setData({ searchHistory: history });
    } catch (e) {
      console.warn('[Search] 加载搜索历史失败:', e);
      this.setData({ searchHistory: [] });
    }
  },

  saveHistory(keyword) {
    if (!keyword) return;
    try {
      let history = wx.getStorageSync(HISTORY_KEY) || [];
      history = history.filter(item => item !== keyword);
      history.unshift(keyword);
      history = history.slice(0, 10);
      wx.setStorageSync(HISTORY_KEY, history);
      this.setData({ searchHistory: history });
    } catch (e) {
      console.warn('[Search] 保存搜索历史失败:', e);
    }
  },

  onHistoryTap(e) {
    const { keyword } = e.currentTarget.dataset;
    if (!keyword) return;
    this.setData({ keyword });
    this.searchProducts(keyword);
  },

  clearHistory() {
    wx.showModal({
      title: '提示',
      content: '确定要清空搜索历史吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync(HISTORY_KEY);
          this.setData({ searchHistory: [] });
        }
      }
    });
  },

  onProductTap(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    wx.navigateTo({
      url: `/pages/product/product?id=${id}`
    });
  }
});


