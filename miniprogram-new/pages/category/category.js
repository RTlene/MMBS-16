/**
 * 分类页
 */

const request = require('../../utils/request.js');
const { API, API_BASE_URL } = require('../../config/api.js');

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
 * 处理图片数组
 */
function mapImages(images, options = {}) {
  const { buildOptimizedImageUrl } = require('../../utils/util.js');
  
  if (!images) return [];
  if (typeof images === 'string') {
    try {
      const parsed = JSON.parse(images);
      if (Array.isArray(parsed)) {
        return parsed.map(url => {
          if (options.type) {
            return buildOptimizedImageUrl(url, options);
          }
          return buildAbsoluteUrl(url);
        }).filter(Boolean);
      }
    } catch (_) {
      const url = options.type ? buildOptimizedImageUrl(images, options) : buildAbsoluteUrl(images);
      return [url].filter(Boolean);
    }
  }
  if (Array.isArray(images)) {
    return images.map(url => {
      if (options.type) {
        return buildOptimizedImageUrl(url, options);
      }
      return buildAbsoluteUrl(url);
    }).filter(Boolean);
  }
  return [];
}

Page({
  data: {
    categories: [],         // 分类列表
    currentCategoryId: null, // 当前选中的分类ID
    products: [],           // 商品列表
    loading: false,
    page: 1,
    hasMore: true,
    // 错误状态
    error: null,
    hasError: false,
    // 数据加载完成状态
    dataLoaded: false
  },

  onLoad() {
    console.log('[Category] 页面加载');
    this.loadCategories();
  },

  onShow() {
    console.log('[Category] 页面显示');
    // 如果分类列表为空，重新加载
    if (this.data.categories.length === 0 && !this.data.loading) {
      console.log('[Category] 分类列表为空，重新加载');
      this.loadCategories();
    }
  },

  /**
   * 加载分类列表
   */
  async loadCategories() {
    console.log('[Category] 开始加载分类列表');
    this.setData({ 
      loading: true,
      hasError: false,
      error: null
    });
    
    try {
      console.log('[Category] 请求分类列表 API:', API.CATEGORY.LIST);
      const result = await request.get(API.CATEGORY.LIST, {}, {
        showLoading: false,
        showError: false
      });
      
      console.log('[Category] 分类列表响应:', result);
      
      if (result.data && result.data.categories) {
        const categories = result.data.categories;
        const firstCategoryId = categories.length > 0 ? categories[0].id : null;
        
        this.setData({ 
          categories,
          currentCategoryId: firstCategoryId,
          dataLoaded: true
        });
        
        // 加载第一个分类的商品
        if (categories.length > 0 && firstCategoryId) {
          console.log('[Category] 准备加载第一个分类的商品，categoryId:', firstCategoryId);
          // 确保使用正确的 categoryId
          this.setData({ 
            currentCategoryId: firstCategoryId,
            page: 1,
            hasMore: true,
            products: [],
            loading: false  // 先重置 loading，以便 loadProducts 可以执行
          }, () => {
            // setData 回调中调用，确保数据已更新
            console.log('[Category] setData 完成，调用 loadProducts');
            this.loadProducts();
          });
        } else {
          // 没有分类时，商品列表也为空
          console.log('[Category] 没有分类，设置商品列表为空');
          this.setData({ 
            products: [],
            loading: false
          });
        }
      } else {
        // 数据为空
        this.setData({ 
          categories: [],
          products: [],
          dataLoaded: true,
          loading: false
        });
      }
    } catch (error) {
      console.error('[Category] 加载分类失败:', error);
      this.setData({
        hasError: true,
        error: error.message || '加载失败，请稍后重试',
        dataLoaded: true,
        loading: false
      });
    }
  },

  /**
   * 加载商品列表
   */
  async loadProducts() {
    if (this.data.loading || !this.data.hasMore) return;
    
    const categoryId = this.data.currentCategoryId;
    const page = this.data.page;
    
    console.log('[Category] 加载商品列表:', { categoryId, page });
    
    // 如果没有选中分类，不加载商品
    if (!categoryId) {
      console.warn('[Category] 未选中分类，跳过加载');
      this.setData({ 
        products: [],
        loading: false,
        dataLoaded: true
      });
      return;
    }
    
    this.setData({ 
      loading: true,
      hasError: false,
      error: null
    });
    
    try {
      const result = await request.get(API.PRODUCT.LIST, {
        categoryId: categoryId,
        page: page,
        limit: page === 1 ? 10 : 20  // 第一页只加载10个，后续加载20个
      }, {
        showLoading: false,
        showError: false
      });
      
      console.log('[Category] 商品列表响应:', result);
      
      if (result.data && result.data.products) {
        // 处理商品图片URL
        const processedProducts = result.data.products.map(product => ({
          ...product,
          images: mapImages(product.images || [], { type: 'list' })
        }));
        
        const products = this.data.page === 1 
          ? processedProducts
          : [...this.data.products, ...processedProducts];
        
        this.setData({
          products,
          hasMore: result.data.products.length >= (this.data.page === 1 ? 10 : 20),
          page: this.data.page + 1,
          dataLoaded: true
        });
      } else {
        // 数据为空
        this.setData({
          products: this.data.page === 1 ? [] : this.data.products,
          hasMore: false,
          dataLoaded: true
        });
      }
    } catch (error) {
      console.error('[Category] 加载商品失败:', error);
      this.setData({
        hasError: true,
        error: error.message || '加载失败，请稍后重试',
        dataLoaded: true
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 选择分类
   */
  selectCategory(categoryId) {
    if (this.data.currentCategoryId === categoryId) return;
    
    console.log('[Category] 选择分类:', categoryId);
    
    this.setData({
      currentCategoryId: categoryId,
      products: [],
      page: 1,
      hasMore: true,
      loading: false,
      hasError: false,
      error: null
    }, () => {
      // setData 回调中调用，确保数据已更新
      this.loadProducts();
    });
  },

  /**
   * 点击分类
   */
  onCategoryTap(e) {
    const { id } = e.currentTarget.dataset;
    this.selectCategory(id);
  },

  /**
   * 点击商品
   */
  onProductTap(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/product/product?id=${id}`
    });
  },

  /**
   * 上拉加载更多
   */
  onReachBottom() {
    this.loadProducts();
  }
});

