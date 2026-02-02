/**
 * 购物车页
 */

const auth = require('../../utils/auth.js');
const util = require('../../utils/util.js');

Page({
  data: {
    cartItems: [],
    totalPrice: 0,
    totalCount: 0,
    allSelected: false
  },

  onShow() {
    // 防止历史缓存中混入服务类商品（服务类不允许加入购物车）
    this.purgeServiceItemsFromCart();
    this.loadCart();
  },

  purgeServiceItemsFromCart() {
    const app = getApp();
    const cartItems = app.globalData.cartItems || [];
    const filtered = cartItems.filter(item => item?.productType !== 'service');
    if (filtered.length !== cartItems.length) {
      app.globalData.cartItems = filtered;
      app.updateCartInfo();
      app.saveCartToStorage();
      wx.showToast({
        title: '已移除服务类商品（不支持加入购物车）',
        icon: 'none'
      });
    }
  },

  /**
   * 加载购物车
   */
  loadCart() {
    const app = getApp();
    const cartItems = app.globalData.cartItems || [];
    
    this.setData({ cartItems });
    this.calculateTotal();
  },

  /**
   * 计算总价
   */
  calculateTotal() {
    const { cartItems } = this.data;
    
    let totalPrice = 0;
    let totalCount = 0;
    let selectedCount = 0;
    
    cartItems.forEach(item => {
      if (item.selected) {
        totalPrice += item.price * item.quantity;
        totalCount += item.quantity;
        selectedCount++;
      }
    });
    
    this.setData({
      totalPrice,
      totalCount,
      allSelected: selectedCount === cartItems.length && cartItems.length > 0
    });
  },

  /**
   * 选择/取消选择商品
   */
  onSelectItem(e) {
    const { index } = e.currentTarget.dataset;
    const cartItems = this.data.cartItems;
    
    cartItems[index].selected = !cartItems[index].selected;
    
    this.setData({ cartItems });
    this.calculateTotal();
    this.saveCart();
  },

  /**
   * 全选/取消全选
   */
  onSelectAll() {
    const { allSelected, cartItems } = this.data;
    const newSelected = !allSelected;
    
    cartItems.forEach(item => {
      item.selected = newSelected;
    });
    
    this.setData({ 
      cartItems,
      allSelected: newSelected 
    });
    this.calculateTotal();
    this.saveCart();
  },

  /**
   * 修改数量
   */
  onQuantityChange(e) {
    const { index, type } = e.currentTarget.dataset;
    const cartItems = this.data.cartItems;
    const item = cartItems[index];
    
    if (type === 'decrease') {
      if (item.quantity > 1) {
        item.quantity--;
      }
    } else if (type === 'increase') {
      if (item.quantity < 999) {
        item.quantity++;
      }
    }
    
    this.setData({ cartItems });
    this.calculateTotal();
    this.saveCart();
  },

  /**
   * 删除商品
   */
  onDeleteItem(e) {
    const { index } = e.currentTarget.dataset;
    
    wx.showModal({
      title: '提示',
      content: '确定要删除这个商品吗？',
      success: (res) => {
        if (res.confirm) {
          const cartItems = this.data.cartItems;
          cartItems.splice(index, 1);
          
          this.setData({ cartItems });
          this.calculateTotal();
          this.saveCart();
        }
      }
    });
  },

  /**
   * 保存购物车
   */
  saveCart() {
    const app = getApp();
    app.globalData.cartItems = this.data.cartItems;
    app.updateCartInfo();
    app.saveCartToStorage();
  },

  /**
   * 去结算
   */
  async onCheckout() {
    const isLogin = await auth.ensureLogin();
    if (!isLogin) return;
    
    const selectedItems = this.data.cartItems.filter(item => item.selected);
    
    if (selectedItems.length === 0) {
      wx.showToast({
        title: '请选择要结算的商品',
        icon: 'none'
      });
      return;
    }
    
    const app = getApp();
    app.globalData.pendingOrder = {
      source: 'cart',
      items: selectedItems.map(item => ({
        productId: item.productId,
        skuId: item.skuId,
        name: item.name,
        image: item.image,
        price: parseFloat(item.price || 0),
        quantity: item.quantity,
        skuName: item.skuName
      }))
    };
    
    // 跳转到订单确认页
    wx.navigateTo({
      url: '/pages/order-confirm/order-confirm?from=cart'
    });
  }
});

