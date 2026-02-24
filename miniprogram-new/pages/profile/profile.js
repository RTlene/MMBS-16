/**
 * 个人中心页
 */

const request = require('../../utils/request.js');
const { API, API_BASE_URL } = require('../../config/api.js');
const auth = require('../../utils/auth.js');

/**
 * 构建绝对URL
 */
function buildAbsoluteUrl(url) {
  if (!url) return '';
  if (/^data:image\//i.test(url)) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE_URL}${url.startsWith('/') ? url : `/${url}`}`;
}

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
    aboutClickTimer: null  // 点击计时器
  },

  onShow() {
    this.checkLogin();
    if (auth.isLogin()) {
      this.loadMemberInfo();
      this.loadOrderStats();
      this.loadLevelCard();
    }
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
        // 处理头像URL，转换为绝对路径
        if (member.avatar) {
          member.avatar = buildAbsoluteUrl(member.avatar);
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
          paid: stats.paidNeedShip !== undefined ? stats.paidNeedShip : (stats.paid || 0)
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

