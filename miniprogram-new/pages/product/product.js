/**
 * 商品详情页
 */

const request = require('../../utils/request.js');
const { API, replaceUrlParams, API_BASE_URL } = require('../../config/api.js');
const util = require('../../utils/util.js');
const auth = require('../../utils/auth.js');

/**
 * 将可能为字符串/JSON 的字段转成数组
 */
function ensureArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {
      // ignore
    }
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }
  return [];
}

function buildAbsoluteUrl(url) {
  if (!url) return '';
  if (/^data:image\//i.test(url)) return url;
  if (/^https?:\/\//.test(url)) return url;
  return `${API_BASE_URL}${url.startsWith('/') ? url : `/${url}`}`;
}

function mapImages(value, options = {}) {
  const { buildOptimizedImageUrl } = require('../../utils/util.js');
  return ensureArray(value).map(url => {
    // 如果是列表或缩略图，使用优化URL
    if (options.type) {
      return buildOptimizedImageUrl(url, options);
    }
    return buildAbsoluteUrl(url);
  }).filter(Boolean);
}

function splitImagesByType(images) {
  const httpImages = [];
  const dataImages = [];
  images.forEach(url => {
    if (/^data:image\//i.test(url)) {
      dataImages.push(url);
    } else {
      httpImages.push(url);
    }
  });
  return { httpImages, dataImages };
}

function normalizeSkus(skus) {
  if (!Array.isArray(skus)) return [];
  return skus.map(sku => ({
    ...sku,
    price: Number(sku.price) || 0,
    stock: Number(sku.stock) || 0,
    images: mapImages(sku.images, { type: 'list' })
  }));
}

Page({
  data: {
    productId: null,
    productBasic: null,     // 商品基础信息（必要字段）
    carouselImages: [],     // 主图 URL 列表（用于分享图等）
    carouselItems: [],      // 轮播项：主图+视频，{ type: 'image'|'video', url }
    detailImages: [],       // 详情图
    videos: [],             // 商品视频
    skus: [],               // SKU列表
    selectedSku: null,      // 选中的SKU
    currentImageIndex: 0,   // 当前图片索引
    quantity: 1,            // 购买数量
    showSkuPopup: false,    // 显示SKU选择弹窗
    cartCount: 0,           // 购物车数量
    
    // 运营工具相关
    promotions: [],         // 适用的促销活动
    coupons: [],            // 可用优惠券
    finalPrice: 0,          // 最终价格（选中规格/会员价）
    priceMin: 0,            // 多规格时最低价，用于区间展示
    priceMax: 0,            // 多规格时最高价
    discountInfo: null,     // 优惠信息
    
    loading: false
  },

  /**
   * 页面加载
   */
  onLoad(options) {
    const { id, referrerId } = options;
    
    if (!id) {
      wx.showToast({
        title: '商品不存在',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
      return;
    }
    
    // 如果有推荐人ID，保存到本地存储（用于新用户注册时使用）
    if (referrerId) {
      try {
        wx.setStorageSync('referrerId', referrerId);
        console.log('[Product] 保存推荐人ID:', referrerId);
      } catch (err) {
        console.warn('[Product] 保存推荐人ID失败:', err);
      }
    }
    
    this.setData({ productId: id });
    this.updateCartCount();
    this.loadProductDetail();
  },

  onShow() {
    // 每次显示页面时更新购物车数量
    this.updateCartCount();
  },

  /**
   * 分享到微信好友
   */
  onShareAppMessage() {
    const app = getApp();
    const memberId = app.globalData.memberId || auth.getMemberId();
    const { productBasic, carouselImages, productId } = this.data;
    
    if (!memberId) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return {
        title: productBasic?.name || '商品详情',
        path: `/pages/product/product?id=${productId}`,
        imageUrl: carouselImages[0] || ''
      };
    }
    
    return {
      title: productBasic?.name || '商品详情',
      path: `/pages/product/product?id=${productId}&referrerId=${memberId}`,
      imageUrl: carouselImages[0] || ''
    };
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    const app = getApp();
    const memberId = app.globalData.memberId || auth.getMemberId();
    const { productBasic, carouselImages, productId } = this.data;
    
    return {
      title: productBasic?.name || '商品详情',
      query: `id=${productId}${memberId ? `&referrerId=${memberId}` : ''}`,
      imageUrl: carouselImages[0] || ''
    };
  },


  // ==================== 数据加载 ====================

  /**
   * 加载商品详情
   */
  async loadProductDetail() {
    this.setData({ loading: true });
    
    try {
      const app = getApp();
      const memberId = app.globalData.memberId;
      
      // 调用商品详情API（含运营工具价格计算）
      const url = replaceUrlParams(API.PRODUCT.DETAIL, { 
        id: this.data.productId 
      });
      
      console.log('[Product] 请求商品详情:', {
        url: url,
        productId: this.data.productId,
        memberId: memberId,
        fullUrl: API_BASE_URL + url
      });
      
      // 商品详情API可能涉及复杂计算，需要更长的超时时间
      const result = await request.get(url, {
        memberId: memberId || 0,
        quantity: 1
      }, {
        timeout: 60000,  // 增加到60秒，因为商品详情可能涉及复杂的价格计算
        showLoading: true,  // 显示loading，让用户知道正在加载
        showError: false  // 不自动显示错误，我们自己处理
      });
      
      const detail = result.data || {};
      const product = detail.product || detail.productInfo || {};
      const pricing = detail.pricing || {};
      const promotionBucket = detail.promotions || {};
      const coupons = detail.coupons || promotionBucket.availableCoupons || [];
      const rawPromotions = detail.promotionsList || promotionBucket.availablePromotions || [];
      // 统一为 { id, type, description }，避免只显示红条无文字
      const promotions = rawPromotions.map(p => ({
        id: p.id,
        type: p.type || p.name || '促销',
        description: p.description || (p.discountType === 'fixed' && p.discountValue != null ? `满减 ¥${p.discountValue}` : p.discountType === 'percent' && p.discountValue != null ? `享 ${p.discountValue} 折` : p.name) || '促销优惠'
      }));
      const skuList = normalizeSkus(detail.skus || product.skus || []);
      const discountFromPricing = Array.isArray(pricing.discounts) ? pricing.discounts[0] : null;
      
      // 首次加载：直接使用接口返回的主图与详情图
      const mainImages = mapImages(product.images || [], { type: 'detail' });
      const detailImages = mapImages(product.detailImages || [], { type: 'detail' });
      const videos = ensureArray(product.videos || []).map(url => util.buildVideoPlayProxyUrl(url)).filter(Boolean);
      const skuImageFallback = []; // SKU图片仍走分段加载
      
      const { httpImages: mainHttp, dataImages: mainData } = splitImagesByType(mainImages);
      const { httpImages: detailHttp } = splitImagesByType(detailImages);
      const { httpImages: skuHttp } = splitImagesByType(skuImageFallback);
      
      const preferredMain = mainHttp.length ? mainHttp : mainImages;
      const preferredDetail = detailHttp.length ? detailHttp : detailImages;
      // 轮播仅使用主图+视频，主图未上传时不使用详情图兜底
      const carouselImages = preferredMain;
      const carouselItems = [
        ...carouselImages.map(url => ({ type: 'image', url })),
        ...videos.map(url => ({ type: 'video', url }))
      ];
      
      console.log('[Product] 加载商品详情:', {
        productId: product.id,
        productName: product.name,
        skuCount: skuList.length,
        mainImages: mainImages.length,
        detailImages: detailImages.length,
        videos: videos.length,
        carouselImages: carouselImages.length,
        carouselItems: carouselItems.length
      });
      
      // 计算总库存（如果没有SKU，使用商品库存）
      const totalStock = skuList.length > 0 
        ? skuList.reduce((sum, sku) => sum + (Number(sku.stock) || 0), 0)
        : (Number(product.stock) || 0);
      
      // 确保获取商品类型（优先从product对象获取，其次从detail根对象）
      const productType = product.productType || detail.productType || 'physical';
      
      // 价格区间：多规格时用于统一展示「¥min - ¥max」
      const basePrice = Number(product.price) || 0;
      let priceMin = basePrice;
      let priceMax = basePrice;
      if (skuList.length > 0) {
        const prices = skuList.map(s => Number(s.price) || 0).filter(p => !isNaN(p));
        if (prices.length > 0) {
          priceMin = Math.min(...prices);
          priceMax = Math.max(...prices);
        }
      }
      
      console.log('[Product] 商品类型:', {
        productId: product.id,
        productType: productType,
        fromProduct: product.productType,
        fromDetail: detail.productType
      });
      
      this.setData({
        productBasic: {
          id: product.id,
          name: product.name,
          description: product.description,
          brand: product.brand,
          price: Number(product.price) || 0,
          originalPrice: Number(product.originalPrice) || 0,
          stock: totalStock,
          status: product.status,
          productType: productType
        },
        carouselImages,
        carouselItems,
        detailImages,
        videos,
        skus: skuList,
        selectedSku: skuList.length > 0 ? skuList[0] : null,
        promotions,
        coupons,
        finalPrice: detail.finalPrice || pricing.finalPrice || (skuList.length > 0 ? skuList[0].price : basePrice),
        priceMin,
        priceMax,
        discountInfo: detail.discountInfo || discountFromPricing || null
      });
      
      // 如果有选中的SKU，重新计算价格
      if (skuList.length > 0) {
        this.calculatePrice();
      }
      
      console.log('[Product] 主数据加载完成，开始分段加载详情图和SKU图片');
      
      // 分段加载：仅加载 SKU 图片；详情图已随主接口返回，避免额外请求导致超时
      setTimeout(() => {
        console.log('[Product] 开始执行分段加载（仅SKU图片）');
        this.loadSkuImages(skuList);
      }, 200); // 延迟200ms，确保主数据已渲染
      // 小程序 video 不跟 302，需把代理 URL 换成签名直链后再播放
      this.resolveVideoSignedUrls();
    } catch (error) {
      console.error('[Product] 加载商品详情失败:', error);
      console.error('[Product] 错误详情:', {
        message: error.message,
        error: error.error,
        url: API_BASE_URL + replaceUrlParams(API.PRODUCT.DETAIL, { id: this.data.productId })
      });
      
      // 显示更详细的错误信息
      const errorMessage = error.message || '商品信息加载失败';
      wx.showModal({
        title: '加载失败',
        content: `${errorMessage}\n\n请检查：\n1. 服务器是否运行\n2. 网络连接是否正常\n3. API地址是否正确`,
        showCancel: true,
        confirmText: '重试',
        cancelText: '返回',
        success: (res) => {
          if (res.confirm) {
            // 重试加载
            this.loadProductDetail();
          } else {
            // 返回上一页
            wx.navigateBack();
          }
        }
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 计算价格（根据数量和SKU重新计算）
   */
  async calculatePrice() {
    try {
      const app = getApp();
      const memberId = app.globalData.memberId;
      
      const result = await request.post(API.PRODUCT.CALCULATE_PRICE, {
        productId: this.data.productId,
        skuId: this.data.selectedSku?.id,
        quantity: this.data.quantity,
        memberId: memberId || 0
      }, {
        showLoading: false
      });
      
      if (result.data) {
        // 确保值不是 undefined，避免 setData 警告
        const updateData = {};
        if (result.data.finalPrice !== undefined) {
          updateData.finalPrice = result.data.finalPrice;
        }
        if (result.data.discountInfo !== undefined) {
          updateData.discountInfo = result.data.discountInfo;
        }
        if (Object.keys(updateData).length > 0) {
          this.setData(updateData);
        }
      }
    } catch (error) {
      console.error('[Product] 计算价格失败:', error);
    }
  },

  /**
   * 分段加载：加载商品详情图
   */
  async loadDetailImages() {
    const startTime = Date.now();
    try {
      console.log('[Product] 📸 开始加载详情图, productId:', this.data.productId);
      
      const url = replaceUrlParams(API.PRODUCT.DETAIL_IMAGES, {
        id: this.data.productId
      });
      
      console.log('[Product] 📸 详情图API URL:', url);
      
      const result = await request.get(url, {}, {
        timeout: 45000, // 详情图可能略大，放宽超时
        showLoading: false, // 不显示loading，因为已经在主接口显示过了
        showError: false
      });
      
      console.log('[Product] 📸 详情图API响应:', result);
      
      const data = result.data || {};
      const rawDetailImages = data.detailImages || [];
      const rawImages = data.images || [];
      
      console.log('[Product] 📸 原始数据:', {
        detailImagesCount: rawDetailImages.length,
        imagesCount: rawImages.length
      });
      
      const detailImages = mapImages(rawDetailImages, { type: 'detail' });
      const additionalImages = mapImages(rawImages, { type: 'detail' });

      // 如果接口没有返回详情图，但返回了主图，使用主图兜底
      const mergedDetailImages = detailImages.length > 0 ? detailImages : additionalImages;
      
      // 合并主图和详情图作为轮播图
      const allImages = [...additionalImages, ...mergedDetailImages];
      
      const duration = Date.now() - startTime;
      console.log('[Product] ✅ 详情图加载成功:', {
        detailImagesCount: detailImages.length,
        additionalImagesCount: additionalImages.length,
        totalImagesCount: allImages.length,
        duration: duration + 'ms'
      });
      
      // 无论是否有详情图，都更新到页面（轮播不再用详情图兜底，仅主图+视频）
      this.setData({
        detailImages: mergedDetailImages
      });

      if (detailImages.length > 0) {
        console.log('[Product] ✅ 详情图已更新到页面，数量:', detailImages.length);
      } else {
        console.warn('[Product] ⚠️ 详情图为空，但已更新页面状态');
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('[Product] ❌ 加载详情图失败（不影响主流程）:', {
        error: error.message,
        duration: duration + 'ms',
        url: replaceUrlParams(API.PRODUCT.DETAIL_IMAGES, { id: this.data.productId })
      });
      // 详情图加载失败不影响主流程，静默处理
    }
  },

  /**
   * 分段加载：加载SKU图片
   */
  async loadSkuImages(skuList) {
    const startTime = Date.now();
    try {
      if (!skuList || skuList.length === 0) {
        console.log('[Product] 📦 SKU列表为空，跳过SKU图片加载');
        return;
      }
      
      console.log('[Product] 📦 开始加载SKU图片, SKU数量:', skuList.length);
      
      // 获取需要加载图片的SKU IDs
      const skuIds = skuList.map(sku => sku.id).join(',');
      
      const url = replaceUrlParams(API.PRODUCT.SKU_IMAGES, {
        id: this.data.productId
      });
      
      console.log('[Product] 📦 SKU图片API URL:', url, 'skuIds:', skuIds);
      
      const result = await request.get(url, {
        skuIds: skuIds
      }, {
        timeout: 30000,
        showLoading: false,
        showError: false
      });
      
      console.log('[Product] 📦 SKU图片API响应:', result);
      
      const data = result.data || {};
      const skuImagesMap = data.skuImages || {};
      
      console.log('[Product] 📦 SKU图片映射:', {
        receivedCount: Object.keys(skuImagesMap).length,
        totalSkus: skuList.length
      });
      
      // 更新SKU列表，添加图片
      const updatedSkus = skuList.map(sku => {
        if (skuImagesMap[sku.id]) {
          const images = mapImages(skuImagesMap[sku.id], { type: 'list' });
          console.log('[Product] 📦 SKU', sku.id, '图片数量:', images.length);
          return {
            ...sku,
            images: images
          };
        }
        return sku;
      });
      
      const duration = Date.now() - startTime;
      console.log('[Product] ✅ SKU图片加载成功:', {
        loadedCount: Object.keys(skuImagesMap).length,
        totalSkus: skuList.length,
        duration: duration + 'ms'
      });
      
      this.setData({
        skus: updatedSkus
      });
      console.log('[Product] ✅ SKU图片已更新到页面');
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('[Product] ❌ 加载SKU图片失败（不影响主流程）:', {
        error: error.message,
        duration: duration + 'ms',
        url: replaceUrlParams(API.PRODUCT.SKU_IMAGES, { id: this.data.productId })
      });
      // SKU图片加载失败不影响主流程，静默处理
    }
  },

  // ==================== 事件处理 ====================

  /**
   * 图片切换
   */
  onImageChange(e) {
    this.setData({
      currentImageIndex: e.detail.current
    });
  },

  /**
   * 将轮播中视频的代理地址（cos-url / temp-url）解析为直链（小程序 video 不跟 302，必须用直链才能播放）
   */
  async resolveVideoSignedUrls() {
    const items = this.data.carouselItems || [];
    const toResolve = [];
    items.forEach((item, i) => {
      if (item.type !== 'video' || !item.url) return;
      if (item.url.indexOf('/api/storage/cos-url') !== -1) toResolve.push({ i, type: 'cos', url: item.url });
      else if (item.url.indexOf('/api/storage/temp-url') !== -1) toResolve.push({ i, type: 'temp', url: item.url });
    });
    if (toResolve.length === 0) return;
    try {
      const next = items.slice();
      const promises = toResolve.map(async ({ i, type, url: proxyUrl }) => {
        let playUrl = '';
        if (type === 'cos') {
          const match = proxyUrl.match(/[?&]url=([^&]+)/);
          const cosUrl = match ? decodeURIComponent(match[1]) : '';
          if (!cosUrl) return;
          const res = await request.get('/api/storage/cos-url', { url: cosUrl, format: 'json' });
          const data = (res && res.data) ? res.data : res;
          playUrl = data && data.url ? data.url : '';
        } else {
          const match = proxyUrl.match(/[?&]fileId=([^&]+)/);
          const fileId = match ? decodeURIComponent(match[1]) : '';
          if (!fileId) return;
          const res = await request.get('/api/storage/temp-url', { fileId: fileId, format: 'json' });
          const data = (res && res.data) ? res.data : res;
          playUrl = data && data.url ? data.url : '';
        }
        if (playUrl) next[i] = { ...next[i], url: playUrl };
      });
      await Promise.all(promises);
      this.setData({ carouselItems: next });
    } catch (e) {
      console.warn('[Product] 解析视频播放链接失败', e);
    }
  },

  /**
   * 点击视频区域：仅阻止冒泡，不触发图片预览，由 video 组件处理播放
   */
  onVideoAreaTap() {
    // no-op，阻止事件冒泡到 swiper-item，避免触发 onImageTap
  },

  /**
   * 预览图片（仅主图；当前项为视频时不触发，由 video 组件自己处理播放）
   */
  onImageTap() {
    const { carouselItems, carouselImages, currentImageIndex } = this.data;
    const current = carouselItems && carouselItems[currentImageIndex];
    if (current && current.type === 'video') return;
    if (!carouselImages.length) return;
    const currentUrl = carouselImages[currentImageIndex] || carouselImages[0];
    wx.previewImage({
      urls: carouselImages,
      current: currentUrl
    });
  },

  /**
   * 显示SKU选择弹窗
   */
  showSkuSelector(e) {
    const { action } = e.currentTarget.dataset;
    const { skus } = this.data;
    const productType = this.data?.productBasic?.productType;
    
    // 如果没有SKU，提示错误
    if (!skus || skus.length === 0) {
      wx.showToast({
        title: '该商品暂无规格',
        icon: 'none'
      });
      return;
    }
    
    // 如果还没有选中SKU，默认选中第一个
    if (!this.data.selectedSku && skus.length > 0) {
      this.setData({ 
        selectedSku: skus[0],
        quantity: 1
      });
      // 重新计算价格
      this.calculatePrice();
    }
    
    // 服务类商品不允许加入购物车：强制走立即购买流程
    const finalAction = (productType === 'service' && action === 'cart') ? 'buy' : action;
    if (productType === 'service' && action === 'cart') {
      wx.showToast({
        title: '服务类商品不支持加入购物车',
        icon: 'none'
      });
    }

    // 始终显示选择弹窗，让用户确认规格和数量
    this.setData({ 
      showSkuPopup: true,
      skuAction: finalAction // 'cart' 或 'buy'
    });
  },

  /**
   * 隐藏SKU选择弹窗
   */
  hideSkuSelector() {
    this.setData({ showSkuPopup: false });
  },

  /**
   * 选择SKU
   */
  onSkuSelect(e) {
    const { index } = e.currentTarget.dataset;
    const sku = this.data.skus[index];
    
    if (!sku) return;
    
    const skuPrice = Number(sku.price) || 0;
    this.setData({ 
      selectedSku: sku,
      quantity: 1,  // 切换SKU时重置数量
      finalPrice: skuPrice  // 弹窗内价格立即更新，后续 calculatePrice 会按会员价等覆盖
    });
    
    this.calculatePrice();
  },

  /**
   * 减少数量
   */
  onQuantityDecrease() {
    if (this.data.quantity > 1) {
      this.setData({ 
        quantity: this.data.quantity - 1 
      });
      this.calculatePrice();
    }
  },

  /**
   * 增加数量
   */
  onQuantityIncrease() {
    const maxStock = this.data.selectedSku?.stock || this.data.productBasic?.stock || 999;
    
    if (this.data.quantity < maxStock) {
      this.setData({ 
        quantity: this.data.quantity + 1 
      });
      this.calculatePrice();
    } else {
      wx.showToast({
        title: '库存不足',
        icon: 'none'
      });
    }
  },

  /**
   * 手动输入数量
   */
  onQuantityInput(e) {
    const value = parseInt(e.detail.value) || 1;
    const maxStock = this.data.selectedSku?.stock || this.data.productBasic?.stock || 999;
    
    const quantity = Math.max(1, Math.min(value, maxStock));
    
    this.setData({ quantity });
    this.calculatePrice();
  },

  /**
   * 加入购物车
   */
  async onAddToCart() {
    const productType = this.data?.productBasic?.productType;
    if (productType === 'service') {
      wx.showToast({
        title: '服务类商品不支持加入购物车',
        icon: 'none'
      });
      // 防止弹窗停留在“加入购物车”状态
      this.setData({ skuAction: 'buy' });
      return;
    }

    // 检查登录
    const isLogin = await auth.ensureLogin();
    if (!isLogin) return;
    
    const app = getApp();
    const product = this.data.productBasic;
    const sku = this.data.selectedSku;
    const images = this.data.carouselImages;
    
    if (!sku) {
      wx.showToast({
        title: '请选择规格',
        icon: 'none'
      });
      return;
    }
    
    // 添加到购物车
    app.addToCart({
      productId: product.id,
      skuId: sku.id,
      name: product.name,
      image: images[0] || '',
      price: sku.price || product.price,
      skuName: sku.name,
      productType: product.productType
    }, this.data.quantity);
    
    // 隐藏弹窗
    this.hideSkuSelector();
    
    // 更新购物车数量
    this.updateCartCount();
    
    // 更新TabBar购物车角标
    if (app.globalData.cartCount > 0) {
      wx.setTabBarBadge({
        index: 2,
        text: app.globalData.cartCount.toString()
      });
    } else {
      wx.removeTabBarBadge({
        index: 2
      });
    }
    
    wx.showToast({
      title: '已加入购物车',
      icon: 'success'
    });
  },

  /**
   * 立即购买
   */
  async onBuyNow() {
    // 检查登录
    const isLogin = await auth.ensureLogin();
    if (!isLogin) return;
    
    const app = getApp();
    const product = this.data.productBasic;
    const sku = this.data.selectedSku;
    
    if (!sku) {
      wx.showToast({
        title: '请选择规格',
        icon: 'none'
      });
      return;
    }
    
    // 将待结算商品信息保存到全局
    app.globalData.pendingOrder = {
      source: 'product',
      items: [{
        productId: product.id,
        skuId: sku.id,
        name: product.name,
        image: (this.data.carouselImages && this.data.carouselImages[0]) || '',
        price: parseFloat(sku.price || product.price || 0),
        quantity: this.data.quantity,
        skuName: sku.name
      }]
    };
    
    // 跳转到订单确认页
    wx.navigateTo({
      url: `/pages/order-confirm/order-confirm?productId=${product.id}&skuId=${sku.id}&quantity=${this.data.quantity}`
    });
  },

  /**
   * 客服
   */
  onContact() {
    wx.navigateTo({
      url: '/pages/customer-service/customer-service'
    });
  },

  /**
   * 返回首页
   */
  onGoHome() {
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  /**
   * 跳转到购物车
   */
  onGoCart() {
    wx.switchTab({
      url: '/pages/cart/cart'
    });
  },

  /**
   * 更新购物车数量
   */
  updateCartCount() {
    const app = getApp();
    this.setData({
      cartCount: app.globalData.cartCount || 0
    });
  },

  /**
   * 查看优惠券
   */
  onViewCoupons() {
    wx.navigateTo({
      url: '/pages/coupon/coupon'
    });
  },

  /**
   * 查看促销活动
   */
  onViewPromotions() {
    wx.showToast({
      title: '促销活动详情',
      icon: 'none'
    });
  }
});

