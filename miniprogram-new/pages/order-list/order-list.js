/**
 * 订单列表页
 */

const request = require('../../utils/request.js');
const { API, API_BASE_URL } = require('../../config/api.js');
const auth = require('../../utils/auth.js');
const { buildAbsoluteUrl, formatTime, formatMoney } = require('../../utils/util.js');

Page({
  data: {
    // 订单列表
    orders: [],
    
    // 分页
    page: 1,
    limit: 8,  // 减少初始加载数量，提升加载速度
    hasMore: true,
    loading: false,
    refreshing: false,
    
    // 状态筛选
    currentStatus: '', // ''表示全部
    statusTabs: [
      { key: '', label: '全部' },
      { key: 'pending', label: '待付款' },
      { key: 'paid', label: '待发货' },
      { key: 'unused', label: '待使用' }, // 服务商品待使用
      { key: 'shipped', label: '待收货' },
      { key: 'completed', label: '已完成' }
    ],
    
    // 空状态
    empty: false,
    error: null
  },

  onLoad(options) {
    // 从页面参数获取状态筛选
    const status = options.status || '';
    this.setData({ currentStatus: status });
    
    // 更新标题
    const statusTab = this.data.statusTabs.find(tab => tab.key === status);
    if (statusTab) {
      wx.setNavigationBarTitle({
        title: statusTab.label
      });
    }
    
    // 检查登录
    if (!auth.isLogin()) {
      wx.showModal({
        title: '提示',
        content: '请先登录',
        showCancel: false,
        success: () => {
          wx.navigateBack();
        }
      });
      return;
    }
    
    // 加载订单列表
    this.loadOrders(true);
  },

  onShow() {
    // 如果从订单详情页返回，刷新列表
    if (this.data.orders.length > 0) {
      this.refreshOrders();
    }
  },

  /**
   * 加载订单列表
   */
  async loadOrders(refresh = false) {
    if (this.data.loading) return;
    
    if (refresh) {
      this.setData({
        page: 1,
        hasMore: true,
        orders: [],
        empty: false,
        error: null
      });
    }
    
    if (!this.data.hasMore && !refresh) return;
    
    this.setData({ loading: true });
    
    try {
      const params = {
        page: this.data.page,
        limit: this.data.limit
      };
      
      if (this.data.currentStatus) {
        params.status = this.data.currentStatus;
      }
      
      const result = await request.get(API.ORDER.LIST, params, {
        showLoading: false,
        showError: false
      });
      
      if (result.code === 0 && result.data) {
        const { orders, hasMore } = result.data;
        
        // 处理订单数据
        const processedOrders = (orders || []).map(order => {
          const items = (order.items || []).map(item => ({
            ...item,
            productId: item.productId,
            skuId: item.skuId,
            image: '', // 图片将通过商品ID动态加载
            imageLoading: true // 标记图片正在加载
          }));

          let primaryItem = null;
          let totalQuantity = 0;
          
          if (items.length > 0) {
            primaryItem = {
              name: items[0].productName || '商品',
              productId: items[0].productId,
              skuId: items[0].skuId,
              image: '',
              imageLoading: true,
              ...items[0]
            };
            totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
          } else if (order.product) {
            primaryItem = {
              name: order.product.name || '商品',
              productId: order.productId,
              image: '',
              imageLoading: true,
              ...order.product
            };
            totalQuantity = order.quantity || 0;
          }
          
          return {
            ...order,
            items,
            product: primaryItem || { name: '商品已下架', image: '', imageLoading: false },
            quantity: totalQuantity || order.quantity || 0,
            itemCount: items.length || (primaryItem ? 1 : 0),
            createdAtText: formatTime(order.createdAt, 'YYYY-MM-DD HH:mm'),
            totalAmountText: formatMoney(order.totalAmount)
          };
        });
        
        this.setData({
          orders: refresh ? processedOrders : [...this.data.orders, ...processedOrders],
          hasMore: hasMore !== false,
          page: refresh ? 2 : this.data.page + 1,
          empty: refresh && processedOrders.length === 0,
          loading: false
        });
        
        // 延迟加载商品图片（不阻塞列表显示，延迟800ms后开始加载，给列表渲染时间）
        // 使用 requestIdleCallback 或 setTimeout 确保不阻塞UI
        setTimeout(() => {
          const currentOrders = refresh ? processedOrders : [...this.data.orders, ...processedOrders];
          this.loadProductImages(currentOrders);
        }, 800);
      } else {
        throw new Error(result.message || '加载失败');
      }
    } catch (error) {
      console.error('[OrderList] 加载订单列表失败:', error);
      this.setData({
        loading: false,
        error: error.message || '加载失败，请稍后重试',
        empty: this.data.orders.length === 0
      });
    }
  },

  /**
   * 根据商品ID加载商品图片
   */
  async loadProductImages(orders) {
    try {
      // 收集所有需要加载图片的商品ID（去重）
      const productIds = new Set();
      orders.forEach(order => {
        if (order.items && order.items.length > 0) {
          order.items.forEach(item => {
            if (item.productId && item.imageLoading) {
              productIds.add(item.productId);
            }
          });
        } else if (order.product && order.product.productId && order.product.imageLoading) {
          productIds.add(order.product.productId);
        }
      });

      if (productIds.size === 0) return;

      // 批量请求商品详情获取图片
      const imageMap = {};
      const productIdArray = Array.from(productIds);
      
      // 并发请求商品详情（减少并发数，优化性能，避免网络压力过大）
      const batchSize = 2; // 进一步减少到2，降低服务器压力和网络失败率
      for (let i = 0; i < productIdArray.length; i += batchSize) {
        const batch = productIdArray.slice(i, i + batchSize);
        const promises = batch.map(async (productId) => {
          const { buildOptimizedImageUrl, buildAbsoluteUrl } = require('../../utils/util.js');
          
          // 重试机制：最多重试2次
          let retries = 2;
          let imageUrl = '';
          
          while (retries >= 0) {
            try {
              // 使用基础商品详情API获取图片（不需要会员信息）
              const url = `/api/miniapp/products/${productId}`;
              const result = await request.get(url, {
                showLoading: false,
                showError: false
              });
              
              if (result.code === 0 && result.data && result.data.product) {
                const product = result.data.product;
                // 获取商品主图
                let originalImageUrl = '';
                if (product.images && Array.isArray(product.images) && product.images.length > 0) {
                  originalImageUrl = product.images[0];
                } else if (product.skus && product.skus.length > 0) {
                  const firstSku = product.skus[0];
                  if (firstSku.images && Array.isArray(firstSku.images) && firstSku.images.length > 0) {
                    originalImageUrl = firstSku.images[0];
                  }
                }
                
                // 如果有原图URL，尝试优化，失败则使用原图
                if (originalImageUrl) {
                  try {
                    imageUrl = buildOptimizedImageUrl(originalImageUrl, { type: 'list' });
                  } catch (optimizeError) {
                    console.warn(`[OrderList] 优化图片URL失败，使用原图: ${productId}`, optimizeError);
                    imageUrl = buildAbsoluteUrl(originalImageUrl);
                  }
                }
                
                imageMap[productId] = imageUrl;
                break; // 成功，退出重试循环
              } else {
                imageMap[productId] = '';
                break; // 数据不存在，不重试
              }
            } catch (error) {
              if (retries === 0) {
                // 最后一次重试失败，记录错误
                console.error(`[OrderList] 加载商品 ${productId} 图片失败（已重试）:`, error);
                imageMap[productId] = '';
              } else {
                // 等待后重试
                await new Promise(resolve => setTimeout(resolve, 500));
                retries--;
              }
            }
          }
        });
        
        await Promise.all(promises);
        
        // 每批加载完后立即更新一次，提升用户体验（渐进式加载）
        // 只更新当前批次加载的图片，减少数据传输量
        if (Object.keys(imageMap).length > 0) {
          const batchImageMap = {};
          batch.forEach(productId => {
            if (imageMap[productId] !== undefined) {
              batchImageMap[productId] = imageMap[productId];
            }
          });
          if (Object.keys(batchImageMap).length > 0) {
            this.updateOrderImages(batchImageMap, orders);
          }
        }
      }
    } catch (error) {
      console.error('[OrderList] 加载商品图片失败:', error);
    }
  },

  /**
   * 更新订单图片（优化更新逻辑 - 使用路径更新，减少数据传输量）
   */
  updateOrderImages(imageMap, orders) {
    // 使用当前页面的订单数据，避免使用过期的数据
    const currentOrders = this.data.orders || orders;
    
    // 收集需要更新的路径和值
    const updateData = {};
    let hasUpdate = false;
    
    currentOrders.forEach((order, orderIndex) => {
      // 更新主商品图片（使用路径更新）
      if (order.product && order.product.productId) {
        const productId = order.product.productId;
        if (order.product.imageLoading && imageMap[productId] !== undefined) {
          updateData[`orders[${orderIndex}].product.image`] = imageMap[productId];
          updateData[`orders[${orderIndex}].product.imageLoading`] = false;
          hasUpdate = true;
        }
      }
      
      // 更新订单项图片（使用路径更新）
      if (order.items && order.items.length > 0) {
        order.items.forEach((item, itemIndex) => {
          if (item.productId && item.imageLoading && imageMap[item.productId] !== undefined) {
            updateData[`orders[${orderIndex}].items[${itemIndex}].image`] = imageMap[item.productId];
            updateData[`orders[${orderIndex}].items[${itemIndex}].imageLoading`] = false;
            hasUpdate = true;
          }
        });
      }
    });

    // 使用路径更新，只更新变化的字段，大幅减少数据传输量
    if (hasUpdate) {
      this.setData(updateData);
    }
  },

  /**
   * 刷新订单列表
   */
  refreshOrders() {
    this.setData({ refreshing: true });
    this.loadOrders(true);
    setTimeout(() => {
      this.setData({ refreshing: false });
    }, 1000);
  },

  /**
   * 切换状态筛选
   */
  onStatusTabTap(e) {
    const { status } = e.currentTarget.dataset;
    
    if (status === this.data.currentStatus) return;
    
    this.setData({ currentStatus: status });
    
    // 更新标题
    const statusTab = this.data.statusTabs.find(tab => tab.key === status);
    if (statusTab) {
      wx.setNavigationBarTitle({
        title: statusTab.label
      });
    }
    
    // 重新加载
    this.loadOrders(true);
  },

  /**
   * 点击订单，查看详情
   */
  onOrderTap(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/order-detail/order-detail?id=${id}`
    });
  },

  /**
   * 取消订单
   */
  async onCancelOrder(e) {
    const { id } = e.currentTarget.dataset;
    
    wx.showModal({
      title: '确认取消',
      content: '确定要取消这个订单吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '处理中...' });
            
            const result = await request.put(
              API.ORDER.UPDATE_STATUS.replace(':id', id),
              { status: 'cancelled' }
            );
            
            wx.hideLoading();
            
            if (result.code === 0) {
              wx.showToast({
                title: '取消成功',
                icon: 'success'
              });
              
              // 优化：如果当前筛选的是待付款状态，直接移除该订单；否则刷新列表
              if (this.data.currentStatus === 'pending') {
                // 从列表中移除已取消的订单
                const updatedOrders = this.data.orders.filter(order => order.id !== parseInt(id));
                this.setData({
                  orders: updatedOrders,
                  empty: updatedOrders.length === 0
                });
              } else {
                // 其他状态需要刷新列表
                this.refreshOrders();
              }
            } else {
              throw new Error(result.message || '取消失败');
            }
          } catch (error) {
            wx.hideLoading();
            console.error('[OrderList] 取消订单失败:', error);
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
  async onConfirmReceive(e) {
    const { id } = e.currentTarget.dataset;
    
    wx.showModal({
      title: '确认收货',
      content: '确认已收到商品吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '处理中...' });
            
            const result = await request.put(
              API.ORDER.UPDATE_STATUS.replace(':id', id),
              { status: 'delivered' }
            );
            
            wx.hideLoading();
            
            if (result.code === 0) {
              wx.showToast({
                title: '确认成功',
                icon: 'success'
              });
              
              // 刷新列表
              this.refreshOrders();
            } else {
              throw new Error(result.message || '确认失败');
            }
          } catch (error) {
            wx.hideLoading();
            console.error('[OrderList] 确认收货失败:', error);
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
   * 去支付
   */
  onPayOrder(e) {
    const { id } = e.currentTarget.dataset;
    // 跳转到订单详情页进行支付
    wx.navigateTo({
      url: `/pages/order-detail/order-detail?id=${id}&from=list`
    });
  },

  /**
   * 查看物流
   */
  onViewLogistics(e) {
    const { id } = e.currentTarget.dataset;
    wx.showToast({
      title: '物流功能开发中',
      icon: 'none'
    });
  },

  /**
   * 阻止事件冒泡
   */
  stopPropagation() {
    // 空函数，用于阻止事件冒泡
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.refreshOrders();
  },

  /**
   * 上拉加载更多
   */
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadOrders(false);
    }
  }
});
