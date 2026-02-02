/**
 * MMBS-16 商城小程序（云托管版）
 * 应用入口文件
 */

const auth = require('./utils/auth.js');
const { API_BASE_URL, ENV, ENV_INFO } = require('./config/api.js');

App({
  /**
   * 小程序启动时触发
   */
  onLaunch(options) {
    console.log('[App] 小程序启动', options);
    console.log('[App] 运行环境:', ENV);
    console.log('[App] API 地址:', API_BASE_URL);
    console.log('[App] 环境信息:', ENV_INFO);
    
    // 开发环境提示
    if (ENV_INFO.isDevelopment) {
      console.warn('[App] ⚠️ 当前为开发环境，请确保本地服务器正在运行');
      console.warn('[App] 本地服务器地址:', API_BASE_URL);
    } else {
      console.log('[App] ✅ 当前为生产环境，使用生产服务器');
    }
    
    // 初始化全局数据
    this.initGlobalData();
    
    // 检查小程序版本更新
    this.checkUpdate();
    
    // 自动登录
    this.autoLogin();
  },

  /**
   * 小程序显示时触发
   */
  onShow(options) {
    console.log('[App] 小程序显示', options);
    
    // 记录启动场景
    this.globalData.scene = options.scene;
    
    // 处理分享进入的场景
    if (options.scene === 1007 || options.scene === 1008) {
      console.log('[App] 从分享进入，分享人ID:', options.query.referrerId);
      this.globalData.referrerId = options.query.referrerId;
    }
  },

  /**
   * 小程序隐藏时触发
   */
  onHide() {
    console.log('[App] 小程序隐藏');
  },

  /**
   * 小程序错误时触发
   */
  onError(error) {
    console.error('[App] 小程序错误:', error);
    
    // 可以在这里上报错误到后台
    // this.reportError(error);
  },

  // ==================== 初始化方法 ====================

  /**
   * 初始化全局数据
   */
  initGlobalData() {
    this.globalData = {
      // 用户信息
      openid: null,
      memberId: null,
      isLogin: false,
      memberInfo: null,
      
      // 购物车
      cartItems: [],           // 购物车商品列表
      cartTotal: 0,            // 购物车总金额
      cartCount: 0,            // 购物车商品数量
      pendingOrder: null,      // 待确认订单信息
      
      // 场景信息
      scene: null,             // 启动场景值
      referrerId: null,        // 分享人ID
      
      // 系统信息
      systemInfo: null,        // 设备信息
      statusBarHeight: 0,      // 状态栏高度
      navBarHeight: 0,         // 导航栏高度
      
      // 其他
      selectedAddress: null,   // 选中的收货地址
    };
    
    // 获取系统信息
    this.getSystemInfo();
    
    // 从缓存加载购物车
    this.loadCartFromStorage();
  },

  /**
   * 获取系统信息
   */
  getSystemInfo() {
    try {
      const systemInfo = wx.getSystemInfoSync();
      this.globalData.systemInfo = systemInfo;
      this.globalData.statusBarHeight = systemInfo.statusBarHeight || 0;
      
      // 计算导航栏高度（状态栏 + 导航栏按钮）
      const menuButtonInfo = wx.getMenuButtonBoundingClientRect();
      this.globalData.navBarHeight = menuButtonInfo.height + (menuButtonInfo.top - systemInfo.statusBarHeight) * 2;
      
      console.log('[App] 系统信息:', systemInfo);
      console.log('[App] 状态栏高度:', this.globalData.statusBarHeight);
      console.log('[App] 导航栏高度:', this.globalData.navBarHeight);
    } catch (e) {
      console.error('[App] 获取系统信息失败:', e);
    }
  },

  /**
   * 检查更新
   */
  checkUpdate() {
    if (wx.canIUse('getUpdateManager')) {
      const updateManager = wx.getUpdateManager();
      
      updateManager.onCheckForUpdate((res) => {
        console.log('[App] 检查更新:', res.hasUpdate);
      });
      
      updateManager.onUpdateReady(() => {
        wx.showModal({
          title: '更新提示',
          content: '新版本已经准备好，是否重启应用？',
          success: (res) => {
            if (res.confirm) {
              updateManager.applyUpdate();
            }
          }
        });
      });
      
      updateManager.onUpdateFailed(() => {
        console.error('[App] 新版本下载失败');
      });
    }
  },

  /**
   * 自动登录
   */
  async autoLogin() {
    try {
      // 检查是否已有缓存的登录信息
      const openid = wx.getStorageSync('openid');
      const memberId = wx.getStorageSync('memberId');
      
      if (openid && memberId) {
        console.log('[App] 使用缓存的登录信息');
        this.globalData.openid = openid;
        this.globalData.memberId = memberId;
        this.globalData.isLogin = true;
        
        // 加载会员信息
        const memberInfo = wx.getStorageSync('memberInfo');
        if (memberInfo) {
          this.globalData.memberInfo = memberInfo;
        }
      } else {
        console.log('[App] 开始自动登录...');
        const result = await auth.login();
        if (result.success) {
          console.log('[App] 自动登录成功');
        } else {
          console.log('[App] 自动登录失败，将在用户操作时提示登录');
        }
      }
    } catch (error) {
      console.error('[App] 自动登录异常:', error);
    }
  },

  // ==================== 购物车管理 ====================

  /**
   * 从缓存加载购物车
   */
  loadCartFromStorage() {
    try {
      const cartItems = wx.getStorageSync('cartItems');
      if (cartItems && Array.isArray(cartItems)) {
        this.globalData.cartItems = cartItems;
        this.updateCartInfo();
      }
    } catch (e) {
      console.error('[App] 加载购物车失败:', e);
    }
  },

  /**
   * 保存购物车到缓存
   */
  saveCartToStorage() {
    try {
      wx.setStorageSync('cartItems', this.globalData.cartItems);
    } catch (e) {
      console.error('[App] 保存购物车失败:', e);
    }
  },

  /**
   * 添加商品到购物车
   * @param {object} product - 商品信息
   * @param {number} quantity - 数量
   */
  addToCart(product, quantity = 1) {
    // 服务类商品不允许加入购物车（全局拦截，避免遗漏入口）
    if (product?.productType === 'service') {
      wx.showToast({
        title: '服务类商品不支持加入购物车',
        icon: 'none'
      });
      return false;
    }

    const cartItems = this.globalData.cartItems;
    
    // 检查商品是否已在购物车中
    const existingIndex = cartItems.findIndex(item => 
      item.productId === product.productId && item.skuId === product.skuId
    );
    
    if (existingIndex > -1) {
      // 已存在，增加数量
      cartItems[existingIndex].quantity += quantity;
    } else {
      // 不存在，添加新商品
      cartItems.push({
        ...product,
        quantity: quantity,
        selected: true,
        addTime: Date.now()
      });
    }
    
    this.globalData.cartItems = cartItems;
    this.updateCartInfo();
    this.saveCartToStorage();
    
    wx.showToast({
      title: '已添加到购物车',
      icon: 'success'
    });

    return true;
  },

  /**
   * 从购物车移除商品
   * @param {number} productId - 商品ID
   * @param {number} skuId - SKU ID
   */
  removeFromCart(productId, skuId) {
    this.globalData.cartItems = this.globalData.cartItems.filter(item => 
      !(item.productId === productId && item.skuId === skuId)
    );
    
    this.updateCartInfo();
    this.saveCartToStorage();
  },

  /**
   * 更新购物车商品数量
   * @param {number} productId - 商品ID
   * @param {number} skuId - SKU ID
   * @param {number} quantity - 新数量
   */
  updateCartQuantity(productId, skuId, quantity) {
    const item = this.globalData.cartItems.find(item => 
      item.productId === productId && item.skuId === skuId
    );
    
    if (item) {
      item.quantity = quantity;
      this.updateCartInfo();
      this.saveCartToStorage();
    }
  },

  /**
   * 更新购物车统计信息
   */
  updateCartInfo() {
    const cartItems = this.globalData.cartItems;
    
    // 计算总数量
    this.globalData.cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    
    // 计算总金额（仅计算选中的商品）
    this.globalData.cartTotal = cartItems
      .filter(item => item.selected)
      .reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    console.log('[App] 购物车更新:', {
      count: this.globalData.cartCount,
      total: this.globalData.cartTotal
    });
  },

  /**
   * 清空购物车
   */
  clearCart() {
    this.globalData.cartItems = [];
    this.globalData.cartCount = 0;
    this.globalData.cartTotal = 0;
    this.saveCartToStorage();
  },

  // ==================== 全局数据 ====================

  globalData: {
    // 将在 initGlobalData 中初始化
  }
});

