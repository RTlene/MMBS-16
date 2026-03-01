/**
 * 订单确认页
 */

const request = require('../../utils/request.js');
const { API } = require('../../config/api.js');
const { splitRegionDetail } = require('../../utils/address.js');

Page({
  data: {
    items: [],
    originalAmount: 0,
    discountAmount: 0,
    totalAmount: 0,
    selectedCoupon: null,
    availableCoupons: [],
    showCouponPicker: false,
    addressList: [],
    selectedAddressId: null,
    receiverName: '',
    receiverPhone: '',
    shippingAddress: '',
    shippingRegion: '',
    shippingDetail: '',
    remark: '',
    submitting: false,
    // 配送方式：delivery-配送上门，pickup-门店自提
    deliveryType: 'delivery',
    storeList: [],           // 门店列表（含距离）
    selectedStore: null,     // 选中的自提门店
    showStorePicker: false,  // 是否显示门店选择弹窗
    userLat: null,           // 用户纬度（用于请求带距离的门店列表）
    userLng: null,
    memberInfo: null,
    availableCommission: 0,
    availablePoints: 0,
    useCommission: 0,
    usePoints: 0,
    commissionDeduction: 0,
    pointsDeduction: 0,
    POINTS_TO_MONEY_RATE: 100
  },

  onLoad() {
    const app = getApp();
    const pendingOrder = app.globalData.pendingOrder;

    if (!pendingOrder || !pendingOrder.items || pendingOrder.items.length === 0) {
      wx.showToast({
        title: '没有待结算的商品',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
      return;
    }

    this.pendingOrder = pendingOrder;
    const items = pendingOrder.items;
    
    // 计算价格明细
    const originalAmount = items.reduce((sum, item) => {
      return sum + (parseFloat(item.price || 0) * (item.quantity || 1));
    }, 0);
    
    // 暂时没有优惠，后续可以接入优惠券API
    const discountAmount = 0;
    const totalAmount = originalAmount - discountAmount;

    const appMember = app.globalData.memberInfo || {};

    this.setData({
      items,
      originalAmount: parseFloat(originalAmount.toFixed(2)),
      discountAmount: parseFloat(discountAmount.toFixed(2)),
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      availableCoupons: [],
      receiverName: appMember.realName || appMember.nickname || '',
      receiverPhone: appMember.phone || appMember.mobile || '',
      shippingAddress: ''
    });
    
    // 加载可用优惠券
    this.loadAvailableCoupons();

    this.loadAddresses();
    this.loadMemberInfo();
    // 获取定位并加载门店列表（自提时按距离排序）
    this.getUserLocationAndLoadStores();
  },

  /** 获取用户定位并加载门店列表 */
  async getUserLocationAndLoadStores() {
    try {
      const loc = await new Promise((resolve, reject) => {
        wx.getLocation({ type: 'gcj02', success: resolve, fail: reject });
      });
      if (loc && loc.latitude != null && loc.longitude != null) {
        this.setData({ userLat: loc.latitude, userLng: loc.longitude });
        this.loadStores(loc.latitude, loc.longitude);
      } else {
        this.loadStores();
      }
    } catch (e) {
      this.loadStores();
    }
  },

  /** 加载门店列表，可选传入 lat/lng 以按距离排序 */
  async loadStores(lat, lng) {
    try {
      const params = {};
      if (lat != null && lng != null) {
        params.lat = lat;
        params.lng = lng;
      }
      const res = await request.get(API.STORE.LIST, params, { needAuth: false, showLoading: false, showError: false });
      if (res.code === 0 && Array.isArray(res.data)) {
        this.setData({ storeList: res.data });
      }
    } catch (err) {
      console.warn('[OrderConfirm] loadStores fail', err);
    }
  },

  /** 切换配送方式 */
  onDeliveryTypeChange(e) {
    const type = e.currentTarget.dataset.type;
    if (type === this.data.deliveryType) return;
    this.setData({
      deliveryType: type,
      selectedStore: type === 'delivery' ? null : this.data.selectedStore
    });
  },

  /** 打开门店选择弹窗 */
  onShowStorePicker() {
    const { userLat, userLng } = this.data;
    if (userLat == null || userLng == null) {
      this.getUserLocationAndLoadStores();
    }
    this.setData({ showStorePicker: true });
  },

  onHideStorePicker() {
    this.setData({ showStorePicker: false });
  },

  /** 选择门店 */
  onSelectStore(e) {
    const store = e.currentTarget.dataset.store;
    if (!store) return;
    this.setData({
      selectedStore: store,
      showStorePicker: false
    });
  },

  /** 打开门店地图（小程序内） */
  onOpenStoreMap(e) {
    const store = e.currentTarget.dataset.store;
    if (!store || store.latitude == null || store.longitude == null) {
      wx.showToast({ title: '该门店暂无坐标', icon: 'none' });
      return;
    }
    wx.openLocation({
      latitude: parseFloat(store.latitude),
      longitude: parseFloat(store.longitude),
      name: store.name || '门店',
      address: store.address || '',
      scale: 16
    });
  },

  /** 打开外部地图（腾讯/高德/苹果地图） */
  onOpenExternalMap(e) {
    const store = e.currentTarget.dataset.store;
    if (!store || !store.address) {
      wx.showToast({ title: '暂无地址', icon: 'none' });
      return;
    }
    const name = (store.name || '门店').replace(/"/g, '');
    const address = (store.address || '').replace(/"/g, '');
    const lat = store.latitude;
    const lng = store.longitude;
    const items = ['复制地址'];
    if (lat != null && lng != null) {
      items.push('腾讯地图', '高德地图', '苹果地图');
    }
    wx.showActionSheet({
      itemList: items,
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.setClipboardData({ data: address, success: () => wx.showToast({ title: '已复制', icon: 'success' }) });
          return;
        }
        if (res.tapIndex === 1 && lat != null && lng != null) {
          wx.setClipboardData({
            data: `https://apis.map.qq.com/uri/v1/marker?marker=coord:${lat},${lng};title:${encodeURIComponent(name)};addr:${encodeURIComponent(address)}`,
            success: () => wx.showToast({ title: '链接已复制，可粘贴到浏览器打开腾讯地图', icon: 'none' })
          });
        }
        if (res.tapIndex === 2 && lat != null && lng != null) {
          wx.setClipboardData({
            data: `https://uri.amap.com/marker?position=${lng},${lat}&name=${encodeURIComponent(name)}&address=${encodeURIComponent(address)}`,
            success: () => wx.showToast({ title: '链接已复制，可粘贴到浏览器打开高德地图', icon: 'none' })
          });
        }
        if (res.tapIndex === 3 && lat != null && lng != null) {
          wx.setClipboardData({
            data: `https://maps.apple.com/?q=${encodeURIComponent(name)}&ll=${lat},${lng}`,
            success: () => wx.showToast({ title: '链接已复制，可粘贴到浏览器打开苹果地图', icon: 'none' })
          });
        }
      }
    });
  },
  
  /**
   * 加载会员信息
   */
  async loadMemberInfo() {
    try {
      const result = await request.get(API.MEMBER.PROFILE, {}, {
        needAuth: true,
        showLoading: false,
        showError: false
      });
      
      if (result.code === 0 && result.data && result.data.member) {
        const member = result.data.member;
        this.setData({
          memberInfo: member,
          availableCommission: parseFloat(member.availableCommission || 0),
          availablePoints: parseInt(member.availablePoints || 0)
        });
      }
    } catch (error) {
      console.error('[OrderConfirm] 加载会员信息失败:', error);
    }
  },

  async loadAddresses() {
    try {
      const res = await request.get(API.ADDRESS.LIST, {}, { needAuth: true, showLoading: false });
      if (res.code === 0 && Array.isArray(res.data)) {
        const list = res.data;
        const defaultAddr = list.find(a => a.isDefault) || list[0];
        if (defaultAddr) {
          this.applyAddress(defaultAddr);
        }
        this.setData({
          addressList: list,
          selectedAddressId: defaultAddr ? defaultAddr.id : null
        });
      }
    } catch (err) {
      console.warn('[OrderConfirm] loadAddresses fail', err);
    }
  },

  applyAddress(addr) {
    if (!addr) return;
    this.setData({
      selectedAddressId: addr.id,
      receiverName: addr.name || '',
      receiverPhone: addr.phone || '',
      shippingAddress: `${addr.region || ''} ${addr.detail || ''}`.trim(),
      shippingRegion: addr.region || '',
      shippingDetail: addr.detail || ''
    });
  },

  /** 地图选址（临时地址） */
  async onChooseLocation() {
    try {
      const res = await wx.chooseLocation();
      if (res && res.address) {
        const parsed = splitRegionDetail(res.address || '', res.name || '');
        const fullText = [parsed.region, parsed.detail].filter(Boolean).join(' ').trim();
        this.setData({
          shippingAddress: fullText,
          shippingRegion: parsed.region,
          shippingDetail: parsed.detail,
          selectedAddressId: null
        });
      }
    } catch (err) {
      // 用户取消不提示
    }
  },

  onChooseSavedAddress() {
    const { addressList } = this.data;
    if (!addressList.length) {
      wx.showToast({ title: '请先新增地址', icon: 'none' });
      return;
    }
    wx.showActionSheet({
      itemList: addressList.map(a => `${a.name} ${a.phone} ${a.region} ${a.detail}`),
      success: (res) => {
        const idx = res.tapIndex;
        const addr = addressList[idx];
        this.applyAddress(addr);
      }
    });
  },

  onInputChange(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({
      [field]: e.detail.value
    });
  },

  /**
   * 显示优惠券选择器
   */
  onShowCouponPicker() {
    // 跳转到优惠券列表页
    wx.navigateTo({
      url: '/pages/coupon/coupon?from=order'
    });
  },

  /**
   * 从优惠券页面返回时选择优惠券
   */
  selectCoupon(coupon) {
    if (!coupon) return;
    
    // 计算优惠金额
    let discountAmount = 0;
    const originalAmount = this.data.originalAmount;
    
    if (coupon.discountType === 'fixed') {
      discountAmount = parseFloat(coupon.discountValue || 0);
    } else if (coupon.discountType === 'percentage') {
      discountAmount = originalAmount * (parseFloat(coupon.discountValue || 0) / 100);
      if (coupon.maxDiscountAmount) {
        discountAmount = Math.min(discountAmount, parseFloat(coupon.maxDiscountAmount));
      }
      if (coupon.maxDiscount) {
        discountAmount = Math.min(discountAmount, parseFloat(coupon.maxDiscount));
      }
    }
    
    // 检查最低订单金额
    if (coupon.minOrderAmount && originalAmount < parseFloat(coupon.minOrderAmount)) {
      wx.showToast({
        title: `订单金额需满${coupon.minOrderAmount}元`,
        icon: 'none'
      });
      return;
    }
    
    const totalAmount = Math.max(0, originalAmount - discountAmount);
    
    this.setData({
      selectedCoupon: coupon,
      discountAmount: parseFloat(discountAmount.toFixed(2)),
      totalAmount: parseFloat(totalAmount.toFixed(2))
    });
    
    // 重新计算抵扣后的金额
    this.calculateFinalAmount();
  },

  /**
   * 隐藏优惠券选择器
   */
  onHideCouponPicker() {
    this.setData({
      showCouponPicker: false
    });
  },

  /**
   * 选择优惠券
   */
  onSelectCoupon(e) {
    const { coupon, id: tapId } = e.currentTarget.dataset;
    const selected = this.data.selectedCoupon;
    // 再次点击已选中的优惠券则取消选择（用 data-id 比较最可靠，兼容数字/字符串）
    const selectedId = selected ? String(selected.id) : '';
    const tappedId = tapId != null ? String(tapId) : (coupon && coupon.id != null ? String(coupon.id) : '');
    if (selectedId && tappedId && selectedId === tappedId) {
      this.setData({
        selectedCoupon: null,
        discountAmount: 0,
        totalAmount: this.data.originalAmount,
        showCouponPicker: false
      });
      this.calculateFinalAmount();
      return;
    }
    if (!coupon || !coupon.id) return;
    
    // 计算优惠金额（discountType: fixed-固定金额, percentage/percent-折扣）
    let discountAmount = 0;
    if (coupon.discountType === 'fixed') {
      discountAmount = parseFloat(coupon.discountValue != null ? coupon.discountValue : coupon.value || 0);
    } else if (coupon.discountType === 'percent' || coupon.discountType === 'percentage') {
      const rate = parseFloat(coupon.discountValue != null ? coupon.discountValue : 0);
      const pct = rate > 0 && rate <= 1 ? rate * 100 : rate; // 支持 0.9 或 90
      discountAmount = this.data.originalAmount * (pct / 100);
      if (coupon.maxDiscountAmount != null) {
        discountAmount = Math.min(discountAmount, parseFloat(coupon.maxDiscountAmount));
      }
    }
    
    const totalAmount = Math.max(0, this.data.originalAmount - discountAmount);
    
    this.setData({
      selectedCoupon: coupon,
      discountAmount: parseFloat(discountAmount.toFixed(2)),
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      showCouponPicker: false
    });
  },

  /**
   * 取消选择优惠券
   */
  onRemoveCoupon() {
    this.setData({
      selectedCoupon: null,
      discountAmount: 0,
      totalAmount: this.data.originalAmount
    });
    
    // 重新计算抵扣后的金额
    this.calculateFinalAmount();
  },
  
  /**
   * 计算最终金额（考虑优惠券、佣金、积分抵扣）
   */
  calculateFinalAmount() {
    const { originalAmount, discountAmount, availableCommission, availablePoints, useCommission, usePoints, POINTS_TO_MONEY_RATE } = this.data;
    
    // 先减去优惠券折扣
    let finalAmount = Math.max(0, originalAmount - discountAmount);
    
    // 计算佣金抵扣
    let commissionDeduction = 0;
    if (useCommission > 0) {
      const maxCommission = Math.min(useCommission, availableCommission, finalAmount);
      commissionDeduction = maxCommission;
      finalAmount -= commissionDeduction;
    }
    
    // 计算积分抵扣
    let pointsDeduction = 0;
    if (usePoints > 0) {
      const maxPoints = Math.min(usePoints, availablePoints);
      const pointsMoneyValue = maxPoints / POINTS_TO_MONEY_RATE;
      pointsDeduction = Math.min(pointsMoneyValue, finalAmount);
      finalAmount -= pointsDeduction;
    }
    
    // 确保最终金额不为负数
    finalAmount = Math.max(0, finalAmount);
    
    this.setData({
      commissionDeduction: parseFloat(commissionDeduction.toFixed(2)),
      pointsDeduction: parseFloat(pointsDeduction.toFixed(2)),
      totalAmount: parseFloat(finalAmount.toFixed(2))
    });
  },
  
  /**
   * 切换佣金使用
   */
  onToggleCommission() {
    const { useCommission, availableCommission } = this.data;
    const newUseCommission = useCommission > 0 ? 0 : Math.min(availableCommission, this.data.totalAmount);
    this.setData({
      useCommission: newUseCommission
    });
    this.calculateFinalAmount();
  },
  
  /**
   * 佣金使用量输入
   */
  onCommissionInput(e) {
    const value = parseFloat(e.detail.value) || 0;
    const { availableCommission, totalAmount } = this.data;
    const maxCommission = Math.min(availableCommission, totalAmount);
    const useCommission = Math.min(Math.max(0, value), maxCommission);
    this.setData({
      useCommission: useCommission
    });
    this.calculateFinalAmount();
  },
  
  /**
   * 切换积分使用
   */
  onTogglePoints() {
    const { usePoints, availablePoints, POINTS_TO_MONEY_RATE } = this.data;
    const maxPointsMoney = this.data.totalAmount;
    const maxPoints = Math.floor(maxPointsMoney * POINTS_TO_MONEY_RATE);
    const newUsePoints = usePoints > 0 ? 0 : Math.min(availablePoints, maxPoints);
    this.setData({
      usePoints: newUsePoints
    });
    this.calculateFinalAmount();
  },
  
  /**
   * 积分使用量输入
   */
  onPointsInput(e) {
    const value = parseInt(e.detail.value) || 0;
    const { availablePoints, totalAmount, POINTS_TO_MONEY_RATE } = this.data;
    const maxPointsMoney = totalAmount;
    const maxPoints = Math.floor(maxPointsMoney * POINTS_TO_MONEY_RATE);
    const usePoints = Math.min(Math.max(0, value), availablePoints, maxPoints);
    this.setData({
      usePoints: usePoints
    });
    this.calculateFinalAmount();
  },

  _formatCouponDisplayValue(c) {
    if (!c) return '';
    const type = (c.discountType || 'fixed').toLowerCase();
    if (type === 'percentage' || type === 'percent') {
      const v = c.discountValue != null ? Number(c.discountValue) : Number(c.value);
      const zhe = v > 10 ? v / 10 : (v > 0 && v < 1 ? v * 10 : v);
      return (Number.isFinite(zhe) ? zhe : 0) + '折';
    }
    // 固定金额/代金券：优先显示面值 value，没有再用 discountValue
    const face = c.value != null ? Number(c.value) : (c.discountValue != null ? Number(c.discountValue) : 0);
    return '¥' + (Number.isFinite(face) ? face.toFixed(2) : '0.00');
  },
  _formatCouponThreshold(c) {
    const min = c.minOrderAmount != null ? Number(c.minOrderAmount) : (c.minAmount != null ? Number(c.minAmount) : null);
    if (min != null && min > 0) return '满' + min.toFixed(2) + '可用';
    return '无门槛';
  },
  _formatCouponValidRange(c) {
    const fmt = (d) => {
      if (!d) return '';
      const t = new Date(d);
      if (isNaN(t.getTime())) return String(d);
      const y = t.getFullYear();
      const m = String(t.getMonth() + 1).padStart(2, '0');
      const day = String(t.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + day;
    };
    const from = fmt(c.validFrom);
    const to = fmt(c.validTo);
    if (from && to) return from + ' 至 ' + to;
    return from || to || '';
  },

  /**
   * 加载可用优惠券
   */
  async loadAvailableCoupons() {
    try {
      const { items, originalAmount } = this.data;
      if (!items || items.length === 0) return;

      // 计算商品ID和总金额
      const productIds = items.map(item => item.productId).filter(Boolean);
      const subtotal = originalAmount;

      const params = {
        subtotal: subtotal
      };
      
      if (productIds.length > 0) {
        params.productId = productIds[0]; // 取第一个商品ID
      }

      const result = await request.get(API.COUPON.AVAILABLE, params, {
        needAuth: true,
        showLoading: false,
        showError: false
      });
      
      if (result.code === 0 && result.data) {
        const list = (result.data.coupons || []).map(c => ({
          ...c,
          displayValue: this._formatCouponDisplayValue(c),
          thresholdText: this._formatCouponThreshold(c),
          validRange: this._formatCouponValidRange(c)
        }));
        this.setData({
          availableCoupons: list
        });
      }
    } catch (error) {
      console.error('[OrderConfirm] 加载优惠券失败:', error);
    }
  },

  /**
   * 阻止事件冒泡
   */
  stopPropagation() {
    // 空函数，用于阻止事件冒泡
  },

  async onSubmitOrder() {
    if (this.data.submitting) return;

    const { items, deliveryType, selectedStore, receiverName, receiverPhone, shippingAddress, remark } = this.data;
    const isPickup = deliveryType === 'pickup';

    if (!items || items.length === 0) {
      wx.showToast({ title: '没有商品可结算', icon: 'none' });
      return;
    }

    if (isPickup) {
      if (!selectedStore || !selectedStore.id) {
        wx.showToast({ title: '请选择自提门店', icon: 'none' });
        return;
      }
    } else {
      if (!receiverName.trim()) {
        wx.showToast({ title: '请填写收货人', icon: 'none' });
        return;
      }
      if (!receiverPhone.trim()) {
        wx.showToast({ title: '请填写手机号', icon: 'none' });
        return;
      }
      if (!shippingAddress.trim()) {
        wx.showToast({ title: '请填写收货地址', icon: 'none' });
        return;
      }
    }

    const payload = {
      items: items.map(item => ({
        productId: item.productId,
        skuId: item.skuId,
        quantity: item.quantity
      })),
      deliveryType: isPickup ? 'pickup' : 'delivery',
      storeId: isPickup ? selectedStore.id : null,
      receiverName: isPickup ? '' : receiverName.trim(),
      receiverPhone: isPickup ? '' : receiverPhone.trim(),
      shippingAddress: isPickup ? '' : shippingAddress.trim(),
      remark: remark.trim(),
      appliedCoupons: this.data.selectedCoupon ? [{ id: this.data.selectedCoupon.id, code: this.data.selectedCoupon.code }] : [],
      commissionUsage: this.data.useCommission > 0 ? this.data.useCommission : null,
      pointsUsage: this.data.usePoints > 0 ? this.data.usePoints : null
    };

    this.setData({ submitting: true });

    try {
      const result = await request.post(API.ORDER.CREATE, payload, {
        showLoading: true,
        needAuth: true
      });

      if (result.code === 0 && result.data && result.data.order) {
        const app = getApp();
        const orderId = result.data.order.id;
        const order = result.data.order;
        
        if (this.pendingOrder && this.pendingOrder.source === 'cart') {
          items.forEach(cartItem => {
            app.removeFromCart(cartItem.productId, cartItem.skuId);
          });
        }
        app.globalData.pendingOrder = null;

        // 如果订单已支付（总价为0），显示不同的提示
        if (order.status === 'paid') {
          wx.showToast({
            title: '订单已创建并完成支付',
            icon: 'success'
          });
        } else {
          wx.showToast({
            title: '订单已创建',
            icon: 'success'
          });
        }

        const goToDetail = () => {
          wx.redirectTo({
            url: `/pages/order-detail/order-detail?id=${orderId}&from=create`
          });
        };

        const selectedAddressId = this.data.selectedAddressId;
        const isPickupOrder = (order.deliveryType || 'delivery') === 'pickup';
        if (isPickupOrder || selectedAddressId) {
          setTimeout(goToDetail, 300);
        } else {
          wx.showModal({
            title: '保存地址',
            content: '是否将当前收货地址保存到地址管理中？',
            success: (modalRes) => {
              if (modalRes.confirm) {
                const region = this.data.shippingRegion || '';
                const detail = this.data.shippingDetail || this.data.shippingAddress || '';
                if (!receiverName.trim() || !receiverPhone.trim() || !detail.trim()) {
                  goToDetail();
                  return;
                }
                request.post(API.ADDRESS.CREATE, {
                  name: receiverName.trim(),
                  phone: receiverPhone.trim(),
                  region: region,
                  detail: detail.trim()
                }, { needAuth: true, showLoading: false, showError: false })
                  .then((saveRes) => {
                    if (saveRes.code === 0) {
                      wx.showToast({ title: '地址已保存', icon: 'success' });
                    }
                  })
                  .catch(() => {})
                  .finally(() => {
                    setTimeout(goToDetail, 800);
                  });
              } else {
                setTimeout(goToDetail, 500);
              }
            },
            fail: () => setTimeout(goToDetail, 500)
          });
        }
      } else {
        throw new Error(result.message || '下单失败');
      }
    } catch (error) {
      wx.showToast({
        title: error.message || '下单失败',
        icon: 'none'
      });
    } finally {
      this.setData({ submitting: false });
    }
  }
});


