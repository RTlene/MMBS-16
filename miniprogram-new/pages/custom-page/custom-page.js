const request = require('../../utils/request.js');
const { API, replaceUrlParams } = require('../../config/api.js');
const { buildAbsoluteUrl, buildOptimizedImageUrl } = require('../../utils/util.js');

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
    const slug = this.normalizeSlug(options.slug);
    this.setData({ slug });
    this.loadDetail();
  },

  normalizeSlug(raw) {
    let slug = String(raw || '').trim();
    if (!slug) return '';
    // 兼容已编码/重复编码的 slug（例如 %252F...）
    for (let i = 0; i < 2; i += 1) {
      try {
        const decoded = decodeURIComponent(slug);
        if (decoded === slug) break;
        slug = decoded;
      } catch (_) {
        break;
      }
    }
    return slug.trim();
  },

  async loadDetail() {
    const slug = this.data.slug;
    if (!slug) {
      this.setData({ loading: false, error: '页面参数缺失' });
      return;
    }
    this.setData({ loading: true, error: '' });
    try {
      // request 层会处理 URL，避免在这里重复编码导致 /%25xx
      const url = replaceUrlParams(API.CUSTOM_PAGE.DETAIL, { slug });
      const result = await request.get(url, {}, { showLoading: false, showError: false });
      if (!result || result.code !== 0 || !result.data) {
        throw new Error((result && result.message) || '页面不存在');
      }
      const data = result.data;
      const blocks = Array.isArray(data.schemaJson) ? data.schemaJson.map((item) => ({
        ...item,
        url: item && item.url
          ? ((item.type === 'image')
            ? buildOptimizedImageUrl(item.url, { type: 'detail' })
            : buildAbsoluteUrl(item.url))
          : item.url
      })) : [];
      this.setData({
        loading: false,
        pageTitle: data.title || data.name || '活动页',
        blocks,
        shareEnabled: data.enableShare !== false,
        shareTitle: data.shareTitle || data.title || data.name || '活动页',
        shareImage: data.shareImage ? buildOptimizedImageUrl(data.shareImage, { type: 'detail' }) : ''
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

