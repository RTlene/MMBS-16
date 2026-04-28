const request = require('../../utils/request.js');
const { API, replaceUrlParams } = require('../../config/api.js');
const { buildAbsoluteUrl, buildOptimizedImageUrl } = require('../../utils/util.js');

Page({
  data: {
    slug: '',
    pageTitle: '活动页',
    blocks: [],
    hasBlocks: false,
    activityPosterUrl: '',
    activityBackground: '#f8fafc',
    activityBackgroundStyle: 'background:#f8fafc;',
    activityHotspots: [],
    hasActivityPoster: false,
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
      const activitySchema = this.parseActivitySchema(data.schemaJson);
      let blocks = this.normalizeSchemaToBlocks(data.schemaJson);
      // 兼容运营使用习惯：仅上传分享图、未配置 schemaJson 时，自动用分享图作为页面首图
      if ((!blocks || blocks.length === 0) && data.shareImage) {
        blocks = [{
          type: 'image',
          url: buildOptimizedImageUrl(data.shareImage, { type: 'detail' }),
          text: data.title || data.name || ''
        }];
      }
      this.setData({
        loading: false,
        pageTitle: data.title || data.name || '活动页',
        blocks,
        hasBlocks: Array.isArray(blocks) && blocks.length > 0,
        activityPosterUrl: activitySchema.posterUrl || '',
        activityBackground: activitySchema.background || '#f8fafc',
        activityBackgroundStyle: this.toBackgroundStyle(activitySchema.background),
        activityHotspots: activitySchema.hotspots || [],
        hasActivityPoster: !!activitySchema.posterUrl,
        shareEnabled: data.enableShare !== false,
        shareTitle: data.shareTitle || data.title || data.name || '活动页',
        shareImage: data.shareImage ? buildOptimizedImageUrl(data.shareImage, { type: 'detail' }) : ''
      });
      wx.setNavigationBarTitle({ title: data.title || data.name || '活动页' });
    } catch (e) {
      this.setData({ loading: false, error: e.message || '加载失败' });
    }
  },

  normalizeSchemaToBlocks(schemaJson) {
    let schema = schemaJson;
    if (typeof schema === 'string') {
      try {
        schema = JSON.parse(schema);
      } catch (_) {
        schema = [];
      }
    }

    let rows = [];
    if (Array.isArray(schema)) {
      rows = schema;
    } else if (schema && typeof schema === 'object') {
      // 活动页结构由海报+热区渲染，不参与 blocks
      if (String(schema.type || '').toLowerCase() === 'activity_poster') {
        return [];
      }
      // 兼容后台不同结构：{blocks:[]}/{components:[]}/{items:[]}
      rows = schema.blocks || schema.components || schema.items || schema.content || [];
      if (!Array.isArray(rows)) rows = [];
    }

    return rows.map((item) => this.normalizeBlock(item)).filter(Boolean);
  },

  normalizeBlock(item) {
    if (!item || typeof item !== 'object') return null;
    const rawType = String(item.type || item.blockType || item.component || '').toLowerCase();
    const text = String(item.text || item.content || item.title || item.label || '').trim();
    const rawUrl = String(item.url || item.src || item.image || item.imageUrl || '').trim();

    if (rawType === 'image' || rawType === 'img' || rawType === 'picture' || rawType === 'banner' || this.looksLikeImageUrl(rawUrl)) {
      if (!rawUrl) return null;
      return {
        type: 'image',
        url: buildOptimizedImageUrl(rawUrl, { type: 'detail' }),
        text
      };
    }

    if (rawType === 'button' || rawType === 'btn' || rawType === 'link') {
      return {
        type: 'button',
        text: text || '查看详情',
        url: rawUrl ? buildAbsoluteUrl(rawUrl) : ''
      };
    }

    return {
      type: 'text',
      text
    };
  },

  looksLikeImageUrl(url) {
    if (!url) return false;
    if (url.startsWith('cloud://')) return true;
    return /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(url);
  },

  parseActivitySchema(schemaJson) {
    let schema = schemaJson;
    if (typeof schema === 'string') {
      try {
        schema = JSON.parse(schema);
      } catch (_) {
        schema = null;
      }
    }
    if (!schema || typeof schema !== 'object') return { posterUrl: '', background: '', hotspots: [] };
    if (String(schema.type || '').toLowerCase() !== 'activity_poster') return { posterUrl: '', background: '', hotspots: [] };
    const posterUrl = String(schema.posterUrl || '').trim();
    const background = String(schema.background || '').trim();
    const hotspots = Array.isArray(schema.hotspots) ? schema.hotspots.map((item) => {
      const x = Number(item && item.x);
      const y = Number(item && item.y);
      const w = Number(item && item.w);
      const h = Number(item && item.h);
      const safeX = Number.isFinite(x) ? Math.max(0, Math.min(100, x)) : 0;
      const safeY = Number.isFinite(y) ? Math.max(0, Math.min(100, y)) : 0;
      const safeW = Number.isFinite(w) ? Math.max(0, Math.min(100, w)) : 10;
      const safeH = Number.isFinite(h) ? Math.max(0, Math.min(100, h)) : 10;
      return {
        name: String((item && item.name) || '').trim(),
        jumpType: String((item && item.jumpType) || 'none').trim(),
        jumpTarget: String((item && item.jumpTarget) || '').trim(),
        style: `left:${safeX}%;top:${safeY}%;width:${safeW}%;height:${safeH}%;`
      };
    }) : [];
    return {
      posterUrl: posterUrl ? buildOptimizedImageUrl(posterUrl, { type: 'detail' }) : '',
      background,
      hotspots
    };
  },

  toBackgroundStyle(background) {
    const raw = String(background || '').trim();
    if (!raw) return 'background:#f8fafc;';
    if (/^#|^rgb|^rgba|^hsl|^hsla/i.test(raw)) return `background:${raw};`;
    return `background-image:url(${raw});background-size:cover;background-position:center;background-repeat:no-repeat;`;
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

  onTapHotspot(e) {
    const idx = Number(e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.index : -1);
    const hotspot = (this.data.activityHotspots || [])[idx];
    if (!hotspot) return;
    const jumpType = hotspot.jumpType || 'none';
    const jumpTarget = hotspot.jumpTarget || '';
    if (jumpType === 'none' || !jumpTarget) return;
    if (jumpType === 'custom_page') {
      wx.navigateTo({ url: `/pages/custom-page/custom-page?slug=${encodeURIComponent(jumpTarget)}` });
      return;
    }
    if (jumpType === 'product_detail') {
      wx.navigateTo({ url: `/pages/product/product?id=${encodeURIComponent(jumpTarget)}`, fail: () => {} });
      return;
    }
    if (jumpType === 'tab') {
      wx.switchTab({ url: jumpTarget, fail: () => {} });
      return;
    }
    if (jumpType === 'miniapp_page') {
      wx.navigateTo({ url: jumpTarget, fail: () => {} });
      return;
    }
    if (jumpType === 'webview') {
      wx.setClipboardData({
        data: jumpTarget,
        success: () => wx.showToast({ title: '链接已复制', icon: 'none' })
      });
      return;
    }
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

