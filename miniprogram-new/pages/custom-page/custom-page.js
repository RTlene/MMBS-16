const request = require('../../utils/request.js');
const { API, replaceUrlParams } = require('../../config/api.js');
const { buildAbsoluteUrl } = require('../../utils/util.js');

Page({
  data: {
    slug: '',
    pageTitle: '活动页',
    blocks: [],
    loading: true,
    error: '',
    shareEnabled: true,
    shareTitle: '活动页',
    shareImage: ''
  },

  onLoad(options = {}) {
    const slug = String(options.slug || '').trim();
    this.setData({ slug });
    this.loadDetail();
  },

  async loadDetail() {
    const slug = this.data.slug;
    if (!slug) {
      this.setData({ loading: false, error: '页面参数缺失' });
      return;
    }
    this.setData({ loading: true, error: '' });
    try {
      const url = replaceUrlParams(API.CUSTOM_PAGE.DETAIL, { slug: encodeURIComponent(slug) });
      const result = await request.get(url, {}, { showLoading: false, showError: false });
      if (!result || result.code !== 0 || !result.data) {
        throw new Error((result && result.message) || '页面不存在');
      }
      const data = result.data;
      const blocks = Array.isArray(data.schemaJson) ? data.schemaJson.map((item) => ({
        ...item,
        url: item && item.url ? buildAbsoluteUrl(item.url) : item.url
      })) : [];
      this.setData({
        loading: false,
        pageTitle: data.title || data.name || '活动页',
        blocks,
        shareEnabled: data.enableShare !== false,
        shareTitle: data.shareTitle || data.title || data.name || '活动页',
        shareImage: data.shareImage ? buildAbsoluteUrl(data.shareImage) : ''
      });
      wx.setNavigationBarTitle({ title: data.title || data.name || '活动页' });
    } catch (e) {
      this.setData({ loading: false, error: e.message || '加载失败' });
    }
  },

  onTapLink(e) {
    const { url = '' } = e.currentTarget.dataset || {};
    if (!url) return;
    if (url.startsWith('/pages/')) {
      wx.navigateTo({ url });
      return;
    }
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '链接已复制', icon: 'none' })
    });
  },

  onShareAppMessage() {
    if (!this.data.shareEnabled) {
      return {
        title: this.data.pageTitle || '活动页',
        path: `/pages/custom-page/custom-page?slug=${this.data.slug}`
      };
    }
    const app = getApp();
    const memberId = app && app.globalData ? app.globalData.memberId : '';
    const path = `/pages/custom-page/custom-page?slug=${this.data.slug}${memberId ? `&referrerId=${memberId}` : ''}`;
    return {
      title: this.data.shareTitle || this.data.pageTitle || '活动页',
      path,
      imageUrl: this.data.shareImage || ''
    };
  },

  onShareTimeline() {
    const app = getApp();
    const memberId = app && app.globalData ? app.globalData.memberId : '';
    const query = `slug=${this.data.slug}${memberId ? `&referrerId=${memberId}` : ''}`;
    return {
      title: this.data.shareTitle || this.data.pageTitle || '活动页',
      query,
      imageUrl: this.data.shareImage || ''
    };
  }
});

