const request = require('../../utils/request.js');
const { API, replaceUrlParams } = require('../../config/api.js');
const { buildAbsoluteUrl, buildOptimizedImageUrl, resolveImageUrlForDisplay } = require('../../utils/util.js');
const auth = require('../../utils/auth.js');
const { parseLaunchSceneParams, persistReferrerFromSceneParams } = require('../../utils/sceneLaunch.js');

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
    shareImage: '',
    shareImageSource: '',
    activityPosterSource: '',
    showShareOptions: false,
    showQrPopup: false,
    qrCodeUrl: '',
    qrCodeTempPath: '',
    generatingQr: false
  },

  onLoad(options = {}) {
    const parsed = parseLaunchSceneParams(options);
    persistReferrerFromSceneParams(parsed);
    const slug = this.normalizeSlug(
      options.slug || parsed.s || parsed.c || ''
    );
    const referrerId = (options.referrerId != null && String(options.referrerId).trim() !== '')
      ? String(options.referrerId).trim()
      : (parsed.r != null && String(parsed.r).trim() !== '' ? String(parsed.r).trim() : '');
    if (referrerId) {
      // 与全局分享链路保持一致：统一通过 sceneLaunch 工具写入推荐人
      persistReferrerFromSceneParams({ r: referrerId });
    }
    this.setData({ slug });
    // 兜底保障：扫码直达活动页时也触发自动登录/自动注册（新用户可绑定分享者）
    try {
      const app = getApp();
      if (app && typeof app.autoLogin === 'function') {
        app.autoLogin();
      }
    } catch (_) {}
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
        activityPosterSource: activitySchema.posterSource || '',
        activityBackground: activitySchema.background || '#f8fafc',
        activityBackgroundStyle: this.toBackgroundStyle(activitySchema.background),
        activityHotspots: activitySchema.hotspots || [],
        hasActivityPoster: !!activitySchema.posterUrl,
        shareEnabled: data.enableShare !== false,
        shareTitle: data.shareTitle || data.title || data.name || '活动页',
        shareImage: data.shareImage ? buildOptimizedImageUrl(data.shareImage, { type: 'detail' }) : '',
        shareImageSource: data.shareImage ? String(data.shareImage).trim() : ''
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
    if (!schema || typeof schema !== 'object') return { posterUrl: '', posterSource: '', background: '', hotspots: [] };
    if (String(schema.type || '').toLowerCase() !== 'activity_poster') return { posterUrl: '', posterSource: '', background: '', hotspots: [] };
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
      posterSource: posterUrl,
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
    const payload = this.getSharePayload();
    if (!this.data.shareEnabled) {
      return {
        title: payload.title,
        path: payload.path
      };
    }
    if (!auth.getMemberId()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
    }
    return payload;
  },

  onShareTimeline() {
    const payload = this.getSharePayload();
    const query = payload.path.replace('/pages/custom-page/custom-page?', '');
    return {
      title: payload.title,
      query,
      imageUrl: payload.imageUrl
    };
  },

  getSharePayload() {
    const app = getApp();
    const memberId = app && app.globalData ? app.globalData.memberId : (auth.getMemberId() || '');
    const basePath = `/pages/custom-page/custom-page?slug=${encodeURIComponent(this.data.slug || '')}`;
    const path = memberId ? `${basePath}&referrerId=${memberId}` : basePath;
    return {
      title: this.data.shareTitle || this.data.pageTitle || '活动页',
      path,
      imageUrl: this.data.shareImage || this.data.activityPosterUrl || ''
    };
  },

  onShareButtonTap() {
    this.setData({ showShareOptions: true });
  },

  closeShareOptions() {
    this.setData({ showShareOptions: false });
  },

  onShareWechatTap() {
    this.closeShareOptions();
  },

  async onShareQrcodeTap() {
    this.closeShareOptions();
    await this.generateSharePoster();
  },

  async generateSharePoster() {
    const payload = this.getSharePayload();
    this.setData({
      showQrPopup: true,
      qrCodeUrl: '',
      qrCodeTempPath: '',
      generatingQr: true
    });
    wx.showLoading({ title: '生成分享海报中...' });
    try {
      const qrTempPath = await this.getCustomPageQrcodeTempPath();
      await this.ensureImageUsable(qrTempPath, '小程序码');
      const coverUrl = this.data.activityPosterUrl || this.data.shareImage || '';
      if (!coverUrl) throw new Error('活动图为空');
      const coverTempPath = await this.getPosterCoverTempPath(coverUrl);
      await this.ensureImageUsable(coverTempPath, '活动图');
      const posterPath = await this.drawSharePoster({
        coverPath: coverTempPath,
        qrPath: qrTempPath
      });
      this.setData({
        qrCodeTempPath: posterPath,
        qrCodeUrl: posterPath
      });
    } catch (e) {
      console.error('[CustomPage] 生成分享海报失败:', e);
      wx.showToast({ title: e.message ? String(e.message).slice(0, 24) : '分享海报生成失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ generatingQr: false });
    }
  },

  async getCustomPageQrcodeTempPath() {
    const slug = this.data.slug;
    if (!slug) throw new Error('页面标识缺失');
    const app = getApp();
    const referrerId = app.globalData.memberId || auth.getMemberId();
    const apiPath = replaceUrlParams(API.CUSTOM_PAGE.SHARE_QRCODE, {
      slug: encodeURIComponent(slug)
    });
    const result = await request.get(apiPath, {
      format: 'json',
      referrerId: referrerId || undefined
    }, {
      showLoading: false,
      showError: false,
      needAuth: true
    });
    const base64 = this.extractImageBase64(result);
    if (!base64) throw new Error('获取小程序码失败');
    return this.writeBase64ToTempPng(base64);
  },

  extractImageBase64(payload) {
    if (!payload) return '';
    if (typeof payload === 'string') return payload;
    if (payload.imageBase64) return payload.imageBase64;
    if (payload.data && payload.data.imageBase64) return payload.data.imageBase64;
    if (payload.result && payload.result.imageBase64) return payload.result.imageBase64;
    if (payload.result && payload.result.data && payload.result.data.imageBase64) return payload.result.data.imageBase64;
    return '';
  },

  writeBase64ToTempPng(base64) {
    const fs = wx.getFileSystemManager();
    const filePath = `${wx.env.USER_DATA_PATH}/custom-page-share-qrcode-${Date.now()}.png`;
    return new Promise((resolve, reject) => {
      fs.writeFile({
        filePath,
        data: base64,
        encoding: 'base64',
        success: () => resolve(filePath),
        fail: (err) => reject(new Error(`写入小程序码临时文件失败: ${err && err.errMsg ? err.errMsg : 'unknown'}`))
      });
    });
  },

  ensureImageUsable(filePath, tag = '图片') {
    return new Promise((resolve, reject) => {
      wx.getImageInfo({
        src: filePath,
        success: () => resolve(true),
        fail: (err) => reject(new Error(`${tag}不可用: ${err && err.errMsg ? err.errMsg : 'unknown'}`))
      });
    });
  },

  getPosterCoverTempPath(coverUrl) {
    const source = this.data.activityPosterSource || this.data.shareImageSource || coverUrl || '';
    const fileId = this.extractCloudFileIdFromUrl(source);
    if (fileId) {
      return this.getTempPathFromCloudFileId(fileId).then((localPath) => {
        if (localPath) return localPath;
        return this.getImageInfoPath(coverUrl || source);
      });
    }
    return this.getImageInfoPath(coverUrl || source);
  },

  extractCloudFileIdFromUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    if (/^cloud:\/\//.test(raw)) return raw;
    const match = raw.match(/[?&]fileId=([^&]+)/);
    if (!match || !match[1]) return '';
    try {
      const fileId = decodeURIComponent(match[1]);
      return /^cloud:\/\//.test(fileId) ? fileId : '';
    } catch (_) {
      return '';
    }
  },

  getTempPathFromCloudFileId(fileId) {
    return new Promise((resolve) => {
      try {
        const { CLOUD_ENV, CLOUD_SERVICE_NAME } = require('../../config/api.js');
        if (!wx.cloud || typeof wx.cloud.callContainer !== 'function') {
          resolve('');
          return;
        }
        try { wx.cloud.init({ env: CLOUD_ENV, traceUser: true }); } catch (_) {}
        const token = wx.getStorageSync('token') || '';
        const path = `/api/storage/temp-file?fileId=${encodeURIComponent(fileId)}`;
        wx.cloud.callContainer({
          path,
          method: 'GET',
          header: token ? { Authorization: `Bearer ${token}` } : {},
          config: { env: CLOUD_ENV },
          service: CLOUD_SERVICE_NAME,
          responseType: 'arraybuffer',
          timeout: 15000,
          success: (res) => {
            const statusCode = res && res.statusCode;
            const data = res && res.data;
            if (!(statusCode >= 200 && statusCode < 300) || !data) {
              resolve('');
              return;
            }
            const fs = wx.getFileSystemManager();
            const filePath = `${wx.env.USER_DATA_PATH}/custom-page-cover-${Date.now()}.jpg`;
            fs.writeFile({
              filePath,
              data,
              encoding: 'binary',
              success: () => resolve(filePath),
              fail: () => resolve('')
            });
          },
          fail: () => resolve('')
        });
      } catch (_) {
        resolve('');
      }
    });
  },

  getImageInfoPath(url) {
    return new Promise((resolve, reject) => {
      resolveImageUrlForDisplay(url).then((src) => {
        wx.getImageInfo({
          src,
          success: (res) => resolve((res && res.path) || src),
          fail: (err) => reject(new Error(`活动图不可用: ${err && err.errMsg ? err.errMsg : 'unknown'}`))
        });
      }).catch((e) => reject(e));
    });
  },

  drawSharePoster({ coverPath, qrPath }) {
    return new Promise((resolve, reject) => {
      const canvasId = 'sharePosterCanvas';
      const width = 375;
      const height = 620;
      const ctx = wx.createCanvasContext(canvasId, this);
      ctx.setFillStyle('#F4F6FA');
      ctx.fillRect(0, 0, width, height);
      ctx.setFillStyle('#FFFFFF');
      ctx.fillRect(16, 16, 343, 588);
      ctx.drawImage(coverPath, 28, 28, 319, 380);
      ctx.setFillStyle('#F7F9FC');
      ctx.fillRect(28, 428, 319, 164);
      ctx.drawImage(qrPath, 40, 462, 104, 104);
      ctx.setFillStyle('#222222');
      ctx.setFontSize(17);
      ctx.fillText('微信扫码进入小程序', 160, 505);
      ctx.setFillStyle('#8A94A6');
      ctx.setFontSize(13);
      ctx.fillText('立即查看活动详情', 160, 531);
      ctx.fillText('长按识别小程序码', 160, 556);
      ctx.draw(false, () => {
        wx.canvasToTempFilePath({
          canvasId,
          width,
          height,
          destWidth: 1080,
          destHeight: 1786,
          quality: 1,
          success: (res) => resolve(res.tempFilePath),
          fail: reject
        }, this);
      });
    });
  },

  drawMultilineText(ctx, text, x, y, maxWidth, maxLines, lineHeight) {
    const value = String(text || '');
    if (!value) return;
    let line = '';
    let row = 0;
    for (let i = 0; i < value.length; i += 1) {
      const ch = value[i];
      const testLine = line + ch;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && line) {
        row += 1;
        if (row >= maxLines) {
          ctx.fillText(line.slice(0, Math.max(0, line.length - 1)) + '...', x, y + (row - 1) * lineHeight);
          return;
        }
        ctx.fillText(line, x, y + (row - 1) * lineHeight);
        line = ch;
      } else {
        line = testLine;
      }
    }
    row += 1;
    if (row <= maxLines) {
      ctx.fillText(line, x, y + (row - 1) * lineHeight);
    }
  },

  closeQrPopup() {
    this.setData({ showQrPopup: false });
  },

  onPreviewQrCode() {
    const current = this.data.qrCodeTempPath || this.data.qrCodeUrl;
    if (!current) return;
    wx.previewImage({ urls: [current], current });
  },

  onSaveQrCode() {
    const filePath = this.data.qrCodeTempPath;
    if (!filePath) {
      wx.showToast({ title: '海报未生成完成', icon: 'none' });
      return;
    }
    wx.saveImageToPhotosAlbum({
      filePath,
      success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
      fail: () => wx.showToast({ title: '保存失败，请检查相册权限', icon: 'none' })
    });
  },

  onShareQrCodeToWechat() {
    const filePath = this.data.qrCodeTempPath;
    if (!filePath) {
      wx.showToast({ title: '海报未生成完成', icon: 'none' });
      return;
    }
    if (typeof wx.showShareImageMenu === 'function') {
      wx.showShareImageMenu({
        path: filePath,
        fail: () => wx.showToast({ title: '请先保存后在微信发送', icon: 'none' })
      });
      return;
    }
    wx.showToast({ title: '当前微信版本不支持，建议先保存', icon: 'none' });
  }
});

