/**
 * 订单详情页
 */

const request = require('../../utils/request.js');
const { API, replaceUrlParams } = require('../../config/api.js');
const auth = require('../../utils/auth.js');
const { buildAbsoluteUrl, formatTime, formatMoney } = require('../../utils/util.js');

Page({
  data: {
    orderId: null,
    order: null,
    loading: true,
    error: null,
    from: '', // 来源：create-创建订单后跳转
    verificationCodes: [] // 核销码列表
  },

  onLoad(options) {
    const { id, from } = options;
    this.setData({ 
      orderId: id,
      from: from || ''
    });
    
    this.loadOrderDetail();
  },

  /**
   * 加载订单详情
   */
  async loadOrderDetail() {
    try {
      this.setData({ loading: true, error: null });
      
      const url = API.ORDER.DETAIL.replace(':id', this.data.orderId);
      const result = await request.get(url, {
        showLoading: true,
        needAuth: true
      });

      if (result.code === 0 && result.data && result.data.order) {
        const order = result.data.order;
        
        // 处理订单项，加载商品图片
        const items = (order.items || []).map(item => ({
          ...item,
          productId: item.productId,
          skuId: item.skuId,
          image: '',
          imageLoading: true
        }));

        // 处理核销码数据
        const verificationCodes = (order.verificationCodes || []).map(code => ({
          ...code,
          expiredAt: code.expiredAt ? formatTime(code.expiredAt, 'YYYY-MM-DD HH:mm') : '',
          createdAt: code.createdAt ? formatTime(code.createdAt, 'YYYY-MM-DD HH:mm') : '',
          usedAt: code.usedAt ? formatTime(code.usedAt, 'YYYY-MM-DD HH:mm') : '',
          qrCodePath: '', // 二维码图片路径
          barcodePath: '' // 条形码图片路径
        }));

        this.setData({
          order: {
            ...order,
            items,
            createdAtText: formatTime(order.createdAt, 'YYYY-MM-DD HH:mm'),
            totalAmountText: formatMoney(order.totalAmount)
          },
          verificationCodes: verificationCodes,
          loading: false
        });

        // 加载商品图片
        this.loadProductImages(items);
        
        // 如果是服务商品订单且有核销码，生成二维码和条形码
        if (verificationCodes.length > 0) {
          this.generateVerificationCodeImages(verificationCodes);
        }
      } else {
        throw new Error(result.message || '加载失败');
      }
    } catch (error) {
      console.error('[OrderDetail] 加载订单详情失败:', error);
      this.setData({
        loading: false,
        error: error.message || '加载失败，请稍后重试'
      });
    }
  },

  /**
   * 生成核销码的二维码和条形码
   */
  async generateVerificationCodeImages(codes) {
    try {
      const updatedCodes = [];
      
      for (const code of codes) {
        // 生成二维码
        const qrCodePath = await this.generateQRCode(code.code);
        // 生成条形码
        const barcodePath = await this.generateBarcode(code.code);
        
        updatedCodes.push({
          ...code,
          qrCodePath,
          barcodePath
        });
      }
      
      this.setData({ verificationCodes: updatedCodes });
    } catch (error) {
      console.error('[OrderDetail] 生成核销码图片失败:', error);
    }
  },

  /**
   * 生成二维码
   */
  generateQRCode(code) {
    return new Promise((resolve) => {
      // 使用在线二维码生成服务
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(code)}`;
      resolve(qrCodeUrl);
    });
  },

  /**
   * 生成条形码
   */
  generateBarcode(code) {
    return new Promise((resolve) => {
      // 使用在线条形码生成服务
      const barcodeUrl = `https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(code)}&code=Code128&translate-esc=on`;
      resolve(barcodeUrl);
    });
  },

  /**
   * 加载商品图片
   */
  async loadProductImages(items) {
    try {
      const productIds = [...new Set(items.map(item => item.productId).filter(Boolean))];
      if (productIds.length === 0) return;

      const imageMap = {};
      
      // 批量请求商品详情
      const batchSize = 5;
      for (let i = 0; i < productIds.length; i += batchSize) {
        const batch = productIds.slice(i, i + batchSize);
        const promises = batch.map(async (productId) => {
          try {
            const url = `/api/miniapp/products/${productId}`;
            const result = await request.get(url, {
              showLoading: false,
              showError: false
            });
            
            if (result.code === 0 && result.data && result.data.product) {
              const product = result.data.product;
              const { buildOptimizedImageUrl } = require('../../utils/util.js');
              let imageUrl = '';
              if (product.images && Array.isArray(product.images) && product.images.length > 0) {
                imageUrl = buildOptimizedImageUrl(product.images[0], { type: 'list' });
              } else if (product.skus && product.skus.length > 0) {
                const firstSku = product.skus[0];
                if (firstSku.images && Array.isArray(firstSku.images) && firstSku.images.length > 0) {
                  imageUrl = buildOptimizedImageUrl(firstSku.images[0], { type: 'list' });
                }
              }
              imageMap[productId] = imageUrl;
            }
          } catch (error) {
            console.error(`[OrderDetail] 加载商品 ${productId} 图片失败:`, error);
            imageMap[productId] = '';
          }
        });
        
        await Promise.all(promises);
      }

      // 更新订单项图片
      const updatedItems = items.map(item => ({
        ...item,
        image: imageMap[item.productId] || '',
        imageLoading: false
      }));

      this.setData({
        'order.items': updatedItems
      });
    } catch (error) {
      console.error('[OrderDetail] 加载商品图片失败:', error);
    }
  },

  /**
   * 支付订单
   */
  async onPayOrder() {
    const { order } = this.data;
    if (!order || order.status !== 'pending') {
      wx.showToast({
        title: '订单状态异常',
        icon: 'none'
      });
      return;
    }

    // 检查支付方式
    if (order.paymentMethod !== 'wechat') {
      wx.showToast({
        title: '该订单不支持微信支付',
        icon: 'none'
      });
      return;
    }

    try {
      wx.showLoading({
        title: '正在调起支付...',
        mask: true
      });

      // 1. 调用后端接口创建支付订单
      const createPayUrl = API.PAYMENT.WECHAT_CREATE;
      const createPayResult = await request.post(createPayUrl, {
        orderId: order.id
      }, {
        showLoading: false,
        needAuth: true
      });

      if (createPayResult.code !== 0 || !createPayResult.data || !createPayResult.data.payParams) {
        throw new Error(createPayResult.message || '创建支付订单失败');
      }

      const { payParams } = createPayResult.data;

      // 2. 调起微信支付
      wx.hideLoading();
      wx.requestPayment({
        appId: payParams.appId,
        timeStamp: payParams.timeStamp,
        nonceStr: payParams.nonceStr,
        package: payParams.package,
        signType: payParams.signType,
        paySign: payParams.paySign,
        success: async (res) => {
          console.log('支付成功', res);
          wx.showToast({
            title: '支付成功',
            icon: 'success'
          });

          // 支付成功后，查询订单状态并刷新
          setTimeout(() => {
            this.loadOrderDetail();
          }, 1500);
        },
        fail: async (err) => {
          console.error('支付失败', err);
          
          // 支付失败时，查询订单状态（可能用户取消了支付）
          try {
            const queryUrl = replaceUrlParams(API.PAYMENT.WECHAT_QUERY, { orderId: order.id });
            const queryResult = await request.get(queryUrl, {}, {
              needAuth: true
            });

            if (queryResult.code === 0 && queryResult.data.status === 'paid') {
              // 实际已支付成功（可能是异步回调已处理）
              wx.showToast({
                title: '支付成功',
                icon: 'success'
              });
              this.loadOrderDetail();
            } else {
              // 支付确实失败
              if (err.errMsg && err.errMsg.includes('cancel')) {
                wx.showToast({
                  title: '已取消支付',
                  icon: 'none'
                });
              } else {
                wx.showToast({
                  title: err.errMsg || '支付失败',
                  icon: 'none'
                });
              }
            }
          } catch (queryError) {
            wx.showToast({
              title: err.errMsg || '支付失败',
              icon: 'none'
            });
          }
        }
      });
    } catch (error) {
      wx.hideLoading();
      console.error('支付流程失败:', error);
      wx.showToast({
        title: error.message || '支付失败',
        icon: 'none'
      });
    }
  },

  /**
   * 取消订单
   */
  async onCancelOrder() {
    const { order } = this.data;
    if (!order || order.status !== 'pending') {
      return;
    }

    wx.showModal({
      title: '确认取消',
      content: '确定要取消这个订单吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '处理中...' });
            
            const url = API.ORDER.UPDATE_STATUS.replace(':id', order.id);
            const result = await request.put(url, { status: 'cancelled' });
            
            wx.hideLoading();
            
            if (result.code === 0) {
              wx.showToast({
                title: '取消成功',
                icon: 'success'
              });
              
              setTimeout(() => {
                wx.navigateBack();
              }, 1500);
            } else {
              throw new Error(result.message || '取消失败');
            }
          } catch (error) {
            wx.hideLoading();
            wx.showToast({
              title: error.message || '取消失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  /**
   * 确认收货
   */
  async onConfirmReceive() {
    const { order } = this.data;
    if (!order || order.status !== 'shipped') {
      return;
    }

    wx.showModal({
      title: '确认收货',
      content: '确认已收到商品吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '处理中...' });
            
            const url = API.ORDER.UPDATE_STATUS.replace(':id', order.id);
            const result = await request.put(url, { status: 'delivered' });
            
            wx.hideLoading();
            
            if (result.code === 0) {
              wx.showToast({
                title: '确认成功',
                icon: 'success'
              });
              this.loadOrderDetail();
            } else {
              throw new Error(result.message || '确认失败');
            }
          } catch (error) {
            wx.hideLoading();
            wx.showToast({
              title: error.message || '确认失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  /**
   * 申请退货
   */
  onRequestReturn() {
    const { order } = this.data;
    if (!order) return;

    // 检查订单状态
    if (!['delivered', 'shipped'].includes(order.status)) {
      wx.showToast({
        title: '只有已发货或已收货的订单才能申请退货',
        icon: 'none'
      });
      return;
    }

    // 检查是否已有退货申请
    if (order.returnStatus && order.returnStatus !== 'none') {
      wx.showToast({
        title: '订单已存在退货申请',
        icon: 'none'
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/return-request/return-request?orderId=${order.id}`
    });
  },

  /**
   * 申请退款
   */
  onRequestRefund() {
    const { order } = this.data;
    if (!order) return;

    // 检查订单状态
    const canRefund = ['cancelled', 'returned'].includes(order.status) || 
                      (order.returnStatus === 'approved');
    
    if (!canRefund) {
      wx.showToast({
        title: '只有已取消、已退货或退货已通过的订单才能申请退款',
        icon: 'none'
      });
      return;
    }

    // 检查是否已有退款申请
    if (order.refundStatus && order.refundStatus !== 'none') {
      wx.showToast({
        title: '订单已存在退款申请',
        icon: 'none'
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/refund-request/refund-request?orderId=${order.id}`
    });
  },

  /**
   * 查看物流
   */
  onViewLogistics() {
    const { order } = this.data;
    if (!order) return;

    wx.navigateTo({
      url: `/pages/logistics/logistics?orderId=${order.id}`
    });
  },

  /**
   * 复制核销码
   */
  onCopyVerificationCode(e) {
    const { code } = e.currentTarget.dataset;
    if (!code) return;

    wx.setClipboardData({
      data: code,
      success: () => {
        wx.showToast({
          title: '已复制到剪贴板',
          icon: 'success'
        });
      },
      fail: () => {
        wx.showToast({
          title: '复制失败',
          icon: 'none'
        });
      }
    });
  }
});
