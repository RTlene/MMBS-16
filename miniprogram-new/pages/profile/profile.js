/**
 * 个人中心页
 */

const request = require('../../utils/request.js');
const { API, CLOUD_ENV, CLOUD_SERVICE_NAME } = require('../../config/api.js');
const auth = require('../../utils/auth.js');
const { buildOptimizedImageUrl } = require('../../utils/util.js');

/**
 * 获取默认头像（使用 base64 占位图）
 */
function getDefaultAvatar() {
  // 1x1 透明 PNG 的 base64 编码，作为占位图
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
}

Page({
  data: {
    memberInfo: null,
    isLogin: false,
    defaultAvatar: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    levelCard: null,
    orderStats: {
      pending: 0,    // 待付款
      paid: 0,       // 待发货
      shipped: 0,    // 待收货
      completed: 0   // 已完成
    },
    aboutClickCount: 0,  // 关于我们点击次数
    aboutClickTimer: null,  // 点击计时器
    showShareOptions: false,
    showQrPopup: false,
    qrCodeUrl: '',
    posterTempPath: '',
    generatingQr: false
  },

  onShow() {
    this.checkLogin();
    if (auth.isLogin()) {
      this.loadMemberInfo();
      this.loadOrderStats();
      this.loadLevelCard();
    }
  },

  getHomeSharePayload() {
    const memberId = auth.getMemberId();
    const path = memberId ? `/pages/index/index?referrerId=${memberId}` : '/pages/index/index';
    const title = '邀请你加入我们';
    return { title, path };
  },

  onShareAppMessage() {
    return this.getHomeSharePayload();
  },

  onShareTimeline() {
    const payload = this.getHomeSharePayload();
    return {
      title: payload.title,
      query: payload.path.replace('/pages/index/index?', '')
    };
  },

  /**
   * 检查登录状态
   */
  checkLogin() {
    const isLogin = auth.isLogin();
    this.setData({ isLogin });
  },

  /**
   * 登录
   */
  async onLogin() {
    const result = await auth.login();
    if (result.success) {
      this.setData({ isLogin: true });
      this.loadMemberInfo();
      this.loadOrderStats();
      this.loadLevelCard();
    }
  },

  onEditProfile() {
    if (!auth.isLogin()) {
      this.onLogin();
      return;
    }
    wx.navigateTo({ url: '/pages/profile-edit/profile-edit' });
  },

  /**
   * 加载会员信息
   */
  async loadMemberInfo() {
    try {
      const result = await request.get(API.MEMBER.PROFILE, {}, {
        showLoading: false,
        showError: false
      });
      
      if (result.data && result.data.member) {
        const member = result.data.member;
        // 处理头像URL：兼容 cloud://（换 temp-url）与 COS 私有桶（换签名链接）
        if (member.avatar) {
          member.avatar = buildOptimizedImageUrl(member.avatar, { type: 'thumbnail' });
        }
        // 确保有 levelName 字段
        if (!member.levelName && member.memberLevel) {
          member.levelName = member.memberLevel.name || '普通会员';
        }
        this.setData({ memberInfo: member });
      }
    } catch (error) {
      console.error('[Profile] 加载会员信息失败:', error);
    }
  },

  /**
   * 加载等级卡片（会员等级+分销等级进度）
   */
  async loadLevelCard() {
    try {
      const result = await request.get(API.MEMBER.LEVEL_CARD, {}, {
        showLoading: false,
        showError: false
      });
      if (result.data && (result.data.memberProgress || result.data.distributorLevel || result.data.distributorProgress)) {
        const card = {
          memberLevel: result.data.memberLevel,
          memberProgress: result.data.memberProgress,
          distributorLevel: result.data.distributorLevel,
          distributorProgress: null
        };
        if (result.data.distributorProgress) {
          const d = result.data.distributorProgress;
          const sales = parseFloat(d.currentSales) || 0;
          const fans = parseInt(d.currentFans, 10) || 0;
          const active = parseInt(d.activeFans, 10) || 0;
          card.distributorProgress = {
            ...d,
            salesText: sales.toFixed(0),
            fanText: d.useActiveFans ? `粉丝 ${fans}（活跃 ${active}）` : `粉丝 ${fans}`
          };
        }
        this.setData({ levelCard: card });
      }
    } catch (error) {
      console.error('[Profile] 加载等级卡片失败:', error);
    }
  },

  /**
   * 加载订单统计
   */
  async loadOrderStats() {
    try {
      const result = await request.get(API.ORDER.STATS, {}, {
        showLoading: false,
        showError: false
      });
      
      if (result.data && result.data.stats) {
        const stats = result.data.stats;
        // 用户端「已完成」= 已收货(delivered) + 已完成(completed)；「待发货」= 仅需发货的 paid（与订单列表一致）
        const orderStats = {
          ...stats,
          completed: (stats.delivered || 0) + (stats.completed || 0),
          paid: stats.paidNeedShip !== undefined ? stats.paidNeedShip : (stats.paid || 0),
          shipped: stats.shippedTab !== undefined ? stats.shippedTab : (stats.shipped || 0)
        };
        this.setData({ orderStats });
      }
    } catch (error) {
      console.error('[Profile] 加载订单统计失败:', error);
    }
  },

  /**
   * 退出登录
   */
  onLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          auth.logout();
          this.setData({
            isLogin: false,
            memberInfo: null,
            levelCard: null,
            orderStats: {
              pending: 0,
              paid: 0,
              shipped: 0,
              completed: 0
            }
          });
        }
      }
    });
  },

  /**
   * 订单列表
   */
  goToOrders(e) {
    const { status } = e.currentTarget.dataset;
    
    if (!auth.isLogin()) {
      this.onLogin();
      return;
    }
    
    wx.navigateTo({
      url: `/pages/order-list/order-list${status ? '?status=' + status : ''}`
    });
  },

  /**
   * 地址管理
   */
  goToAddress() {
    if (!auth.isLogin()) {
      this.onLogin();
      return;
    }
    
    wx.navigateTo({
      url: '/pages/address/address'
    });
  },

  /**
   * 我的团队
   */
  goToTeam() {
    if (!auth.isLogin()) {
      this.onLogin();
      return;
    }
    
    wx.navigateTo({
      url: '/pages/team/team'
    });
  },

  /**
   * 我的优惠券
   */
  goToVerification() {
    wx.navigateTo({
      url: '/pages/verification/verification'
    });
  },

  goToCoupons() {
    if (!auth.isLogin()) {
      this.onLogin();
      return;
    }
    
    wx.navigateTo({
      url: '/pages/coupon/coupon'
    });
  },

  /**
   * 联系客服
   */
  onContact() {
    wx.navigateTo({
      url: '/pages/customer-service/customer-service'
    });
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
    await this.generateHomeSharePoster();
  },

  ensureImageUsable(filePath, tag = '图片') {
    return new Promise((resolve, reject) => {
      wx.getImageInfo({
        src: filePath,
        success: () => resolve(true),
        fail: (err) => reject(new Error(`${tag}不可用: ${err?.errMsg || 'unknown'}`))
      });
    });
  },

  async generateHomeSharePoster() {
    const memberId = auth.getMemberId();
    this.setData({
      showQrPopup: true,
      qrCodeUrl: '',
      posterTempPath: '',
      generatingQr: true
    });
    wx.showLoading({ title: '生成分享海报中...' });
    try {
      const qrTempPath = await this.getHomeQrcodeTempPath(memberId);
      await this.ensureImageUsable(qrTempPath, '小程序码');
      const posterPath = await this.drawHomeSharePoster({
        qrPath: qrTempPath,
        title: '邀请你加入我们',
        subtitle: '扫码进入小程序首页'
      });
      this.setData({ posterTempPath: posterPath, qrCodeUrl: posterPath });
    } catch (e) {
      console.error('[Profile] 生成首页分享海报失败:', e);
      wx.showToast({ title: e.message ? String(e.message).slice(0, 24) : '海报生成失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ generatingQr: false });
    }
  },

  async getHomeQrcodeTempPath(memberId) {
    console.log('[Profile] getHomeQrcodeTempPath start:', { memberId: memberId || null });
    const base64FromContainer = await this.getHomeQrcodeBase64ByCallContainer(memberId);
    if (base64FromContainer) {
      console.log('[Profile] qrcode source=callContainer-json, base64Length=', base64FromContainer.length);
      return this.writeBase64ToTempPng(base64FromContainer);
    }
    const binaryPathFromContainer = await this.getHomeQrcodeTempPathByCallContainerBinary(memberId);
    if (binaryPathFromContainer) {
      console.log('[Profile] qrcode source=callContainer-binary, tempPath=', binaryPathFromContainer);
      return binaryPathFromContainer;
    }

    const params = { format: 'json' };
    if (memberId) params.referrerId = memberId;
    const result = await request.get(API.CONFIG.SHARE_HOME_QRCODE, params, {
      showLoading: false,
      showError: false,
      needAuth: true,
      debug: false
    });
    const base64 = this.extractImageBase64(result);
    console.log('[Profile] qrcode source=request-json, hasData=', !!base64, 'length=', base64 ? base64.length : 0, 'resultKeys=', result ? Object.keys(result) : []);
    if (!base64) {
      throw new Error('获取小程序码失败：返回为空，请检查云开发环境绑定');
    }
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
    const filePath = `${wx.env.USER_DATA_PATH}/profile-home-qrcode-${Date.now()}.png`;
    return new Promise((resolve, reject) => {
      fs.writeFile({
        filePath,
        data: base64,
        encoding: 'base64',
        success: () => resolve(filePath),
        fail: (err) => reject(new Error(`写入小程序码临时文件失败: ${err?.errMsg || 'unknown'}`))
      });
    });
  },

  getHomeQrcodeBase64ByCallContainer(memberId) {
    return new Promise((resolve) => {
      try {
        if (!wx.cloud || typeof wx.cloud.callContainer !== 'function') {
          resolve('');
          return;
        }
        try { wx.cloud.init({ env: CLOUD_ENV, traceUser: true }); } catch (_) {}

        const token = wx.getStorageSync('token') || '';
        const path = `/api/miniapp/share/home-qrcode?format=json${memberId ? `&referrerId=${encodeURIComponent(memberId)}` : ''}`;
        wx.cloud.callContainer({
          path,
          method: 'GET',
          header: token ? { Authorization: `Bearer ${token}` } : {},
          config: { env: CLOUD_ENV },
          service: CLOUD_SERVICE_NAME,
          timeout: 15000,
          success: (res) => {
            const statusCode = res && res.statusCode;
            const data = res && res.data;
            const imageBase64 = this.extractImageBase64(data);
            const source = data && data.data && data.data.source ? data.data.source : '';
            const imageBase64Length = data && data.data && data.data.imageBase64Length ? data.data.imageBase64Length : 0;
            console.log('[Profile] callContainer json result:', {
              statusCode,
              source,
              imageBase64Length,
              hasImageBase64: !!imageBase64
            });
            if (statusCode >= 200 && statusCode < 300 && imageBase64) {
              resolve(imageBase64);
              return;
            }
            console.warn('[Profile] callContainer 获取首页小程序码失败，转请求封装兜底:', statusCode, data);
            resolve('');
          },
          fail: (err) => {
            console.warn('[Profile] callContainer 不可用，转请求封装兜底:', err && err.errMsg ? err.errMsg : err);
            resolve('');
          }
        });
      } catch (e) {
        console.warn('[Profile] callContainer 初始化异常，转请求封装兜底:', e && e.message ? e.message : e);
        resolve('');
      }
    });
  },

  getHomeQrcodeTempPathByCallContainerBinary(memberId) {
    return new Promise((resolve) => {
      try {
        if (!wx.cloud || typeof wx.cloud.callContainer !== 'function') {
          resolve('');
          return;
        }
        try { wx.cloud.init({ env: CLOUD_ENV, traceUser: true }); } catch (_) {}

        const token = wx.getStorageSync('token') || '';
        const path = `/api/miniapp/share/home-qrcode${memberId ? `?referrerId=${encodeURIComponent(memberId)}` : ''}`;
        wx.cloud.callContainer({
          path,
          method: 'GET',
          header: token ? { Authorization: `Bearer ${token}` } : {},
          config: { env: CLOUD_ENV },
          service: CLOUD_SERVICE_NAME,
          timeout: 15000,
          success: (res) => {
            const statusCode = res && res.statusCode;
            const headers = res && res.header ? res.header : {};
            console.log('[Profile] callContainer binary result:', {
              statusCode,
              contentType: headers['Content-Type'] || headers['content-type'] || '',
              dataType: typeof (res && res.data)
            });
            if (!(statusCode >= 200 && statusCode < 300)) {
              resolve('');
              return;
            }
            const binary = res && res.data;
            if (!binary) {
              resolve('');
              return;
            }
            const fs = wx.getFileSystemManager();
            const filePath = `${wx.env.USER_DATA_PATH}/profile-home-qrcode-bin-${Date.now()}.png`;
            fs.writeFile({
              filePath,
              data: binary,
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

  drawHomeSharePoster({ qrPath, title, subtitle }) {
    return new Promise((resolve, reject) => {
      const canvasId = 'profileSharePosterCanvas';
      const width = 375;
      const height = 620;
      const ctx = wx.createCanvasContext(canvasId, this);

      ctx.setFillStyle('#F4F6FA');
      ctx.fillRect(0, 0, width, height);
      ctx.setFillStyle('#FFFFFF');
      ctx.fillRect(16, 16, 343, 588);

      ctx.setFillStyle('#111111');
      ctx.setFontSize(22);
      ctx.fillText(title || '邀请你加入我们', 28, 86);
      ctx.setFillStyle('#7A869A');
      ctx.setFontSize(14);
      ctx.fillText(subtitle || '扫码进入小程序首页', 28, 116);

      ctx.setFillStyle('#EAF2FF');
      ctx.fillRect(28, 150, 319, 360);
      ctx.drawImage(qrPath, 82, 186, 210, 210);

      ctx.setFillStyle('#3481B8');
      ctx.setFontSize(16);
      ctx.fillText('长按识别小程序码', 126, 430);
      ctx.setFillStyle('#8A94A6');
      ctx.setFontSize(12);
      ctx.fillText('进入首页查看最新内容与活动', 110, 454);

      ctx.draw(false, () => {
        const exportWidth = 1080;
        const exportHeight = 1786; // 按 375:620 等比换算
        wx.canvasToTempFilePath({
          canvasId,
          width,
          height,
          destWidth: exportWidth,
          destHeight: exportHeight,
          quality: 1,
          success: (res) => resolve(res.tempFilePath),
          fail: reject
        }, this);
      });
    });
  },

  closeQrPopup() {
    this.setData({ showQrPopup: false });
  },

  onPreviewPoster() {
    const current = this.data.posterTempPath || this.data.qrCodeUrl;
    if (!current) return;
    wx.previewImage({ urls: [current], current });
  },

  onSavePoster() {
    if (this.data.generatingQr) {
      wx.showToast({ title: '海报正在生成中', icon: 'none' });
      return;
    }
    const filePath = this.data.posterTempPath;
    if (!filePath) {
      wx.showToast({ title: '海报未生成完成', icon: 'none' });
      return;
    }
    wx.saveImageToPhotosAlbum({
      filePath,
      success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
      fail: () => wx.showToast({ title: '保存失败，请检查权限', icon: 'none' })
    });
  },

  onSharePosterToWechat() {
    if (this.data.generatingQr) {
      wx.showToast({ title: '海报正在生成中', icon: 'none' });
      return;
    }
    const filePath = this.data.posterTempPath;
    if (!filePath) {
      wx.showToast({ title: '海报未生成完成', icon: 'none' });
      return;
    }
    if (typeof wx.showShareImageMenu === 'function') {
      wx.showShareImageMenu({
        path: filePath,
        fail: () => wx.showToast({ title: '请先保存后在微信发送', icon: 'none' })
      });
    } else {
      wx.showToast({ title: '当前微信版本不支持，建议先保存', icon: 'none' });
    }
  },

  /**
   * 关于（隐藏入口：连续点击5次进入员工登录）
   */
  goToAbout() {
    // 隐藏入口：连续点击5次"关于我们"进入员工登录
    this.data.aboutClickCount = (this.data.aboutClickCount || 0) + 1;
    
    // 清除之前的计时器
    if (this.data.aboutClickTimer) {
      clearTimeout(this.data.aboutClickTimer);
    }
    
    // 3秒内点击5次触发员工入口
    if (this.data.aboutClickCount >= 5) {
      this.data.aboutClickCount = 0;
      wx.navigateTo({
        url: '/pages/staff-login/staff-login'
      });
      return;
    }
    
    // 3秒后重置计数
    this.data.aboutClickTimer = setTimeout(() => {
      this.data.aboutClickCount = 0;
    }, 3000);
    
    // 正常显示关于我们
    wx.showToast({
      title: '关于我们',
      icon: 'none'
    });
  }
});

