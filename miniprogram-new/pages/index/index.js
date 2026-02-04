/**
 * 首页 - 商城主页
 */

const request = require('../../utils/request.js');
const { API, replaceUrlParams, API_BASE_URL } = require('../../config/api.js');
const { buildAbsoluteUrl, buildOptimizedImageUrl, formatMoney } = require('../../utils/util.js');


Page({
  data: {
    // 首图轮播
    banners: [],
    currentBannerIndex: 0,
    // 活动横幅轮播
    activityBanners: [],
    currentActivityBannerIndex: 0,
    // 分类导航
    categories: [],
    // 热门商品
    hotProducts: [],
    // 首页资讯列表（简单列表，最多 5 条）
    homeArticles: [],
    // 精选推荐商品
    recommendProducts: [],
    // 加载状态
    loading: false,
    refreshing: false,
    error: null,
    hasError: false,
    dataLoaded: false,
    searchKeyword: '',
    bannerHeight: 0,
    searchOpacity: 0
  },

  /**
   * 页面加载
   */
  onLoad(options) {
    console.log('[Index] 页面加载', options);
    
    // 加载页面数据
    this.loadPageData();
  },

  onReady() {
    try {
      const { windowHeight } = wx.getSystemInfoSync();
      this.setData({ bannerHeight: windowHeight || 0 });
    } catch (e) {
      this.setData({ bannerHeight: 0 });
    }
    this.updateSearchOpacity(0);
  },

  onPageScroll(e) {
    this.updateSearchOpacity(e.scrollTop || 0);
  },

  /**
   * 页面显示
   */
  onShow() {
    console.log('[Index] 页面显示');
    
    // 更新购物车数量显示（tab 顺序：0首页 1资讯 2分类 3购物车 4我的）
    const app = getApp();
    if (app.globalData.cartCount > 0) {
      wx.setTabBarBadge({
        index: 3,
        text: app.globalData.cartCount.toString()
      });
    } else {
      wx.removeTabBarBadge({ index: 3 });
    }
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    console.log('[Index] 下拉刷新');
    this.setData({ refreshing: true });
    
    this.loadPageData().then(() => {
      wx.stopPullDownRefresh();
      this.setData({ refreshing: false });
      wx.showToast({
        title: '刷新成功',
        icon: 'success'
      });
    });
  },

  /**
   * 分享
   */
  onShareAppMessage() {
    const app = getApp();
    const memberId = app.globalData.memberId;
    
    return {
      title: 'MMBS商城 - 精选好物',
      path: `/pages/index/index?referrerId=${memberId}`,
      imageUrl: this.data.banners[0]?.imageUrl || ''
    };
  },

  // ==================== 数据加载 ====================

  /**
   * 加载页面数据
   */
  async loadPageData() {
    this.setData({ 
      loading: true,
      hasError: false,
      error: null
    });
    
    try {
      await Promise.all([
        this.loadBanners(),
        this.loadActivityBanners(),
        this.loadCategories(),
        this.loadHotProducts(),
        this.loadHomeArticles(),
        this.loadRecommendProducts()
      ]);
      
      this.setData({ dataLoaded: true });
    } catch (error) {
      console.error('[Index] 加载数据失败:', error);
      this.setData({
        hasError: true,
        error: error.message || '加载失败，请稍后重试'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 加载轮播图
   */
  async loadBanners() {
    try {
      const url = replaceUrlParams(API.BANNER.PUBLIC, { position: 'homepage' });
      console.log('[Index] 请求轮播图URL:', url);
      
      const result = await request.get(url, {}, {
        showLoading: false,
        showError: false
      });

      console.log('[Index] 轮播图API完整响应:', JSON.stringify(result, null, 2));

      // API返回格式: { code: 0, message: '获取成功', data: [...] }
      // 检查响应格式
      if (result && result.code === 0 && result.data && Array.isArray(result.data)) {
        console.log('[Index] 轮播图原始数据:', result.data);
        
        const banners = result.data.map(item => {
          // 轮播图API返回的是 imageUrl 字段，不是 images 数组
          const imageUrl = item.imageUrl || '';
          
          console.log('[Index] 处理轮播图:', item.id, 'imageUrl:', imageUrl);
          
          // 如果有图片URL，使用优化后的URL（高质量，不转换格式）
          // 如果没有图片URL，跳过这个横幅
          if (!imageUrl) {
            console.warn('[Index] 轮播图没有图片URL，跳过:', item.id);
            return null;
          }
          
          let optimizedImageUrl = '';
          try {
            // 检测是否为真机环境（通过系统信息判断）
            const systemInfo = wx.getSystemInfoSync();
            const isRealDevice = systemInfo.platform !== 'devtools';
            
            // 获取API基础URL，检查是否为HTTP
            const { API_BASE_URL } = require('../../config/api.js');
            const isHttp = /^http:\/\//i.test(API_BASE_URL);
            
            // 真机环境 + HTTP协议：直接使用原图，避免HTTP协议限制
            // 开发工具或HTTPS：可以使用优化后的URL
            if (isRealDevice && isHttp) {
              // 真机 + HTTP：直接使用原图，但需要注意真机可能无法加载HTTP图片
              console.warn('[Index] 真机环境 + HTTP协议，使用原图URL（可能无法加载）');
              console.warn('[Index] 建议：1. 配置HTTPS服务器 2. 在微信公众平台配置合法域名');
              optimizedImageUrl = buildAbsoluteUrl(imageUrl);
            } else {
              // 开发工具或HTTPS环境：使用优化后的URL
              optimizedImageUrl = buildOptimizedImageUrl(imageUrl, { type: 'banner' });
              console.log('[Index] 使用优化URL:', imageUrl, '->', optimizedImageUrl);
            }
          } catch (error) {
            console.error('[Index] 轮播图URL处理失败，使用原图:', imageUrl, error);
            // 如果处理失败，使用原URL（转换为绝对URL）
            optimizedImageUrl = buildAbsoluteUrl(imageUrl);
          }
          
          return {
            id: item.id,
            imageUrl: optimizedImageUrl,
            linkType: item.linkType || 'external',
            linkTarget: item.linkTarget || item.link || item.linkUrl || '',
            position: item.position,
            title: item.title || item.name || '',
            loadError: false  // 标记图片是否加载失败
          };
        }).filter(item => item !== null && item.imageUrl); // 过滤掉null和没有图片URL的横幅
        
        console.log('[Index] 处理后的轮播图数量:', banners.length, banners);
        this.setData({ banners });
      } else if (result && result.code === 0 && (!result.data || result.data.length === 0)) {
        // API成功但数据为空（数据库中没有轮播图）
        console.warn('[Index] 轮播图数据为空，可能是数据库中没有首页轮播图');
        this.setData({ banners: [] });
      } else {
        console.warn('[Index] 轮播图数据格式错误:', result);
        this.setData({ banners: [] });
      }
    } catch (error) {
      console.error('[Index] 加载轮播图失败:', error);
      console.error('[Index] 错误详情:', error.message, error.stack);
      this.setData({ banners: [] });
    }
  },

  /**
   * 加载分类列表
   */
  async loadCategories() {
    try {
      const result = await request.get(API.CATEGORY.LIST, {}, {
        showLoading: false,
        showError: false
      });
      
      if (result.data && result.data.categories) {
        // 只显示前8个分类
        const categories = result.data.categories.slice(0, 8);
        this.setData({ categories });
      } else {
        // 数据为空，设置为空数组
        this.setData({ categories: [] });
      }
    } catch (error) {
      console.error('[Index] 加载分类失败:', error);
      // 分类加载失败不影响其他数据，只记录错误
      // 如果是网络错误，会在主错误处理中显示
    }
  },

  /**
   * 加载推荐商品
   */
  async loadRecommendProducts() {
    try {
      const result = await request.get(API.PRODUCT.RECOMMENDED, {
        limit: 10
      }, {
        showLoading: false,
        showError: false
      });
      
      if (result.data && result.data.products) {
        this.setData({ 
          recommendProducts: result.data.products 
        });
      } else {
        // 数据为空，设置为空数组
        this.setData({ recommendProducts: [] });
      }
    } catch (error) {
      console.error('[Index] 加载推荐商品失败:', error);
      // 推荐商品加载失败不影响其他数据，只记录错误
      this.setData({ recommendProducts: [] });
    }
  },

  /**
   * 加载热门商品
   */
  async loadHotProducts() {
    try {
      const result = await request.get(API.PRODUCT.LIST, {
        isHot: true,
        page: 1,
        limit: 8  // 首页热门商品只显示8个，减少初始加载
      }, {
        showLoading: false,
        showError: false
      });
      
      if (result.data && result.data.products) {
        // 优化商品图片URL
        const optimizedProducts = result.data.products.map(product => ({
          ...product,
          images: (product.images || []).map(img => buildOptimizedImageUrl(img, { type: 'list' }))
        }));
        
        this.setData({ 
          hotProducts: optimizedProducts 
        });
      } else {
        // 数据为空，设置为空数组
        this.setData({ hotProducts: [] });
      }
    } catch (error) {
      console.error('[Index] 加载热门商品失败:', error);
      this.setData({ hotProducts: [] });
    }
  },

  /**
   * 加载活动横幅（首页活动区轮播，后台「轮播图管理」位置选「活动横幅」）
   */
  async loadActivityBanners() {
    try {
      const url = replaceUrlParams(API.BANNER.PUBLIC, { position: 'activity' });
      const result = await request.get(url, {}, { showLoading: false, showError: false });
      if (result && result.code === 0 && result.data && Array.isArray(result.data)) {
        const list = result.data.map(item => {
          const imageUrl = item.imageUrl || '';
          if (!imageUrl) return null;
          let optimizedImageUrl = '';
          try {
            const { API_BASE_URL } = require('../../config/api.js');
            const isHttp = /^http:\/\//i.test(API_BASE_URL);
            const systemInfo = wx.getSystemInfoSync();
            if (systemInfo.platform !== 'devtools' && isHttp) {
              optimizedImageUrl = buildAbsoluteUrl(imageUrl);
            } else {
              optimizedImageUrl = buildOptimizedImageUrl(imageUrl, { type: 'banner' });
            }
          } catch (e) {
            optimizedImageUrl = buildAbsoluteUrl(imageUrl);
          }
          return {
            id: item.id,
            imageUrl: optimizedImageUrl,
            linkType: item.linkType || 'external',
            linkTarget: item.linkTarget || item.linkUrl || '',
            title: item.title || ''
          };
        }).filter(Boolean);
        this.setData({ activityBanners: list });
      } else {
        this.setData({ activityBanners: [] });
      }
    } catch (error) {
      console.error('[Index] 加载活动横幅失败:', error);
      this.setData({ activityBanners: [] });
    }
  },

  /**
   * 加载首页资讯列表（后台「文章/资讯」管理，最多展示 5 条）
   */
  async loadHomeArticles() {
    try {
      const result = await request.get(API.ARTICLE.LIST, {
        page: 1,
        limit: 5,
        status: 'published'
      }, { showLoading: false, showError: false });
      if (result && result.data && result.data.articles) {
        const list = (result.data.articles || []).map(a => {
          let timeStr = '';
          if (a.publishTime) {
            const d = new Date(a.publishTime);
            const now = new Date();
            const sameDay = d.toDateString() === now.toDateString();
            timeStr = sameDay
              ? (d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'))
              : (d.getMonth() + 1) + '-' + d.getDate();
          }
          return {
            id: a.id,
            title: a.title,
            summary: (a.summary || '').slice(0, 36),
            coverImage: a.coverImage ? buildAbsoluteUrl(a.coverImage) : '',
            publishTime: timeStr
          };
        });
        this.setData({ homeArticles: list });
      } else {
        this.setData({ homeArticles: [] });
      }
    } catch (error) {
      console.error('[Index] 加载资讯失败:', error);
      this.setData({ homeArticles: [] });
    }
  },

  // ==================== 事件处理 ====================

  /**
   * 轮播图切换
   */
  /**
   * 轮播图图片加载错误
   */
  onBannerImageError(e) {
    const index = e.currentTarget.dataset.index;
    const banners = this.data.banners || [];
    
    if (banners[index]) {
      const banner = banners[index];
      console.error('[Index] 轮播图加载失败:', banner.id, banner.imageUrl);
      
      // 检查是否已经尝试过原图
      const hasTriedOriginal = banner.imageUrl.includes('?') === false && /^https?:\/\//i.test(banner.imageUrl);
      
      if (!hasTriedOriginal) {
        // 第一次失败：尝试使用原图URL（不带压缩参数）
        let originalUrl = banner.imageUrl;
        
        // 如果URL包含压缩参数，移除它们
        if (originalUrl.includes('?')) {
          originalUrl = originalUrl.split('?')[0];
        }
        
        // 如果已经是绝对URL，直接使用；否则转换为绝对URL
        let fallbackUrl = originalUrl;
        if (!/^https?:\/\//i.test(originalUrl)) {
          fallbackUrl = buildAbsoluteUrl(originalUrl);
        }
        
        console.log('[Index] 尝试使用原图URL:', fallbackUrl);
        
        // 更新图片URL
        const updateKey = `banners[${index}].imageUrl`;
        this.setData({
          [updateKey]: fallbackUrl
        });
      } else {
        // 原图也加载失败，显示占位图
        console.warn('[Index] 轮播图原图也无法加载，显示占位图');
        const updateKey = `banners[${index}].loadError`;
        this.setData({
          [updateKey]: true
        });
        
        // 提示用户（仅在真机环境）
        try {
          const systemInfo = wx.getSystemInfoSync();
          if (systemInfo.platform !== 'devtools') {
            wx.showToast({
              title: '图片加载失败，请检查网络',
              icon: 'none',
              duration: 2000
            });
          }
        } catch (e) {
          // 忽略错误
        }
      }
    }
  },

  onBannerChange(e) {
    this.setData({
      currentBannerIndex: e.detail.current
    });
  },

  /**
   * 点击轮播图
   */
  onBannerTap(e) {
    const { index } = e.currentTarget.dataset;
    const banner = this.data.banners[index];
    
    if (!banner) return;
    
    console.log('[Index] 点击轮播图:', banner);
    
    if (banner.linkType === 'product' && banner.linkTarget) {
      wx.navigateTo({
        url: `/pages/product/product?id=${banner.linkTarget}`
      });
    } else if (banner.linkType === 'custom' && banner.linkTarget) {
      wx.navigateTo({
        url: banner.linkTarget
      });
    } else if (banner.linkType === 'external' && banner.linkTarget) {
      wx.setClipboardData({
        data: banner.linkTarget,
        success: () => {
          wx.showToast({ title: '链接已复制，可在浏览器打开', icon: 'none' });
        }
      });
    }
  },

  /**
   * 点击搜索框
   */
  onSearchTap() {
    wx.navigateTo({
      url: '/pages/search/search'
    });
  },

  /**
   * 点击分类
   */
  onCategoryTap(e) {
    const { id } = e.currentTarget.dataset;
    console.log('[Index] 点击分类:', id);

    wx.switchTab({
      url: '/pages/category/category',
      success: () => {
        const pages = getCurrentPages();
        const categoryPage = pages[pages.length - 1];
        if (categoryPage && categoryPage.selectCategory) {
          categoryPage.selectCategory(id);
        }
      }
    });
  },
  updateSearchOpacity(scrollTop = 0) {
    const bannerHeight = this.data.bannerHeight || 1;
    const ratio = Math.min(1, Math.max(0, scrollTop / (bannerHeight * 0.4)));
    const rounded = Math.round(ratio * 100) / 100;
    if (rounded !== this.data.searchOpacity) {
      this.setData({ searchOpacity: rounded });
    }
  },

  /**
   * 点击商品
   */
  onProductTap(e) {
    const { id } = e.currentTarget.dataset;
    
    console.log('[Index] 点击商品:', id);
    
    wx.navigateTo({
      url: `/pages/product/product?id=${id}`
    });
  },

  /**
   * 查看更多推荐商品
   */
  onMoreRecommendTap() {
    wx.switchTab({
      url: '/pages/category/category'
    });
  },

  /**
   * 查看更多热门商品
   */
  onMoreHotTap() {
    wx.switchTab({ url: '/pages/category/category' });
  },

  onActivityBannerChange(e) {
    this.setData({ currentActivityBannerIndex: e.detail.current });
  },

  onActivityBannerTap(e) {
    const { index } = e.currentTarget.dataset;
    const banner = (this.data.activityBanners || [])[index];
    if (!banner) return;
    if (banner.linkType === 'product' && banner.linkTarget) {
      wx.navigateTo({ url: `/pages/product/product?id=${banner.linkTarget}` });
    } else if (banner.linkType === 'custom' && banner.linkTarget) {
      wx.navigateTo({ url: banner.linkTarget });
    } else if (banner.linkType === 'external' && banner.linkTarget) {
      wx.setClipboardData({
        data: banner.linkTarget,
        success: () => { wx.showToast({ title: '链接已复制', icon: 'none' }); }
      });
    }
  },

  onArticleTap(e) {
    const { id } = e.currentTarget.dataset;
    if (id) wx.navigateTo({ url: `/pages/article/article?id=${id}` });
  },

  onMoreArticlesTap() {
    wx.switchTab({ url: '/pages/articles/articles' });
  },

  // ==================== 工具方法 ====================

  /**
   * 格式化价格
   */
  formatPrice(price) {
    return formatMoney(price);
  },

  /**
   * 格式化销量
   */
  formatSales(sales) {
    return util.formatBigNumber(sales);
  }
});

