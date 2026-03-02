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
    storeList: [],
    selectedStore: null,
    showStorePicker: false,
    userLat: null,
    userLng: null,
    memberInfo: null,
    availableCommission: 0,
    availablePoints: 0,
    useCommission: 0,
    usePoints: 0,
    commissionDeduction: 0,
    pointsDeduction: 0,
    POINTS_TO_MONEY_RATE: 100,
    // 价格计算与公式展示
    pricingLoading: true,
    orderOriginalAmount: 0,
    promotionDiscountTotal: 0,
    subtotalAfterPromo: 0,
    pricingDiscounts: [],
    promotionDiscountInvalidatedByCoupon: 0  // 选不可与促销同享的券时，保存被失效的促销金额用于展示划掉
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

    const localOriginal = items.reduce((sum, item) => {
      return sum + (parseFloat(item.price || 0) * (item.quantity || 1));
    }, 0);

    const appMember = app.globalData.memberInfo || {};

    this.setData({
      items,
      originalAmount: parseFloat(localOriginal.toFixed(2)),
      orderOriginalAmount: parseFloat(localOriginal.toFixed(2)),
      discountAmount: 0,
      totalAmount: parseFloat(localOriginal.toFixed(2)),
      subtotalAfterPromo: parseFloat(localOriginal.toFixed(2)),
      promotionDiscountTotal: 0,
      pricingDiscounts: [],
      pricingLoading: true,
      availableCoupons: [],
      receiverName: appMember.realName || appMember.nickname || '',
      receiverPhone: appMember.phone || appMember.mobile || '',
      shippingAddress: ''
    });

    this.loadOrderPricing();
    this.loadAddresses();
    this.loadMemberInfo();
    // 获取定位并加载门店列表（自提时按距离排序）
    this.getUserLocationAndLoadStores();
  },

  /**
   * 请求后端计算每项价格（含促销/券不叠加逻辑），汇总原价、促销后小计、促销明细
   * @param {Object} selectedCouponOpt - 当前选中的优惠券，传入时后端会按「不可叠加」规则返回价格
   */
  async loadOrderPricing(selectedCouponOpt) {
    const items = this.data.items || [];
    const app = getApp();
    const memberId = (app.globalData.memberInfo && app.globalData.memberInfo.id) || (app.globalData.memberId) || 0;
    const appliedCoupons = selectedCouponOpt ? [{ id: selectedCouponOpt.id }] : [];

    if (!items.length) {
      this.setData({ pricingLoading: false });
      return;
    }

    let orderOriginalAmount = 0;
    let orderSubtotalAfterPromo = 0;
    const discountMap = {};

    const fetchPrice = async (item) => {
      const body = {
        productId: item.productId,
        skuId: item.skuId || null,
        quantity: item.quantity || 1,
        memberId: memberId || 0,
        appliedCoupons,
        appliedPromotions: []
      };
      let res = await request.post(API.PRODUCT.CALCULATE_PRICE, body, { showLoading: false, showError: false });
      if (res.code === 0 && res.data && res.data.pricing) return res.data.pricing;
      res = await request.post(API.PRODUCT.CALCULATE_PRICE, body, { showLoading: false, showError: false });
      return (res.code === 0 && res.data && res.data.pricing) ? res.data.pricing : null;
    };

    try {
      for (const item of items) {
        const p = await fetchPrice(item);
        const unit = parseFloat(item.price || 0) * (item.quantity || 1);
        const orig = p ? (parseFloat(p.originalAmount) || 0) : unit;
        const finalP = p && parseFloat(p.finalPrice) != null ? parseFloat(p.finalPrice) : (p ? orig : unit);
        orderOriginalAmount += orig;
        orderSubtotalAfterPromo += finalP;
        if (p && p.discounts && p.discounts.length) {
          p.discounts.forEach(d => {
            const name = (d.name || d.description || '促销').trim();
            const amt = parseFloat(d.amount) || 0;
            if (amt > 0) discountMap[name] = (discountMap[name] || 0) + amt;
          });
        }
      }

      const promotionDiscountTotal = Math.round((orderOriginalAmount - orderSubtotalAfterPromo) * 100) / 100;
      const pricingDiscounts = Object.keys(discountMap).map(name => ({
        type: 'promotion',
        name,
        amount: parseFloat((discountMap[name] || 0).toFixed(2))
      }));

      const subtotal = parseFloat(orderSubtotalAfterPromo.toFixed(2));
      let discountAmount = this.data.discountAmount || 0;
      if (selectedCouponOpt) {
        const c = selectedCouponOpt;
        const isCashOrFixed = c.type === 'cash' || c.discountType === 'fixed';
        if (isCashOrFixed) {
          discountAmount = parseFloat(c.value != null ? c.value : (c.discountValue != null ? c.discountValue : 0));
        } else if (c.type === 'discount' || c.discountType === 'percent' || c.discountType === 'percentage') {
          const v = parseFloat(c.discountValue != null ? c.discountValue : 0);
          let payRatio = 1;
          if (v > 0 && v <= 1) payRatio = v;
          else if (v > 1 && v <= 10) payRatio = v / 10;
          else if (v > 10) payRatio = v / 100;
          discountAmount = subtotal * (1 - Math.min(1, payRatio));
          if (c.maxDiscountAmount != null) discountAmount = Math.min(discountAmount, parseFloat(c.maxDiscountAmount));
        }
      }
      const totalAmount = Math.max(0, subtotal - discountAmount - (this.data.commissionDeduction || 0) - (this.data.pointsDeduction || 0));

      this.setData({
        pricingLoading: false,
        orderOriginalAmount: parseFloat(orderOriginalAmount.toFixed(2)),
        promotionDiscountTotal: parseFloat(promotionDiscountTotal.toFixed(2)),
        subtotalAfterPromo: subtotal,
        pricingDiscounts,
        originalAmount: parseFloat(orderOriginalAmount.toFixed(2)),
        discountAmount: parseFloat(discountAmount.toFixed(2)),
        totalAmount: parseFloat(totalAmount.toFixed(2))
      });

      this.loadAvailableCoupons(this.data.items, subtotal);
    } catch (e) {
      console.error('[OrderConfirm] loadOrderPricing fail', e);
      this.setData({
        pricingLoading: false,
        subtotalAfterPromo: this.data.originalAmount,
        orderOriginalAmount: this.data.originalAmount
      });
      this.loadAvailableCoupons(this.data.items, this.data.originalAmount);
    }
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
   * 显示优惠券选择器（本页弹窗，并刷新可用优惠券列表）
   */
  onShowCouponPicker() {
    this.setData({ showCouponPicker: true });
    this.loadAvailableCoupons();
  },

  /**
   * 从优惠券页面返回时选择优惠券
   */
  selectCoupon(coupon) {
    if (!coupon) return;

    const baseAmount = (this.data.subtotalAfterPromo != null && this.data.subtotalAfterPromo > 0) ? this.data.subtotalAfterPromo : this.data.originalAmount;
    let discountAmount = 0;
    const isCashOrFixed = coupon.type === 'cash' || coupon.discountType === 'fixed';
    if (isCashOrFixed) {
      discountAmount = parseFloat(coupon.value != null ? coupon.value : (coupon.discountValue != null ? coupon.discountValue : 0));
    } else if (coupon.type === 'discount' || coupon.discountType === 'percent' || coupon.discountType === 'percentage') {
      const v = parseFloat(coupon.discountValue != null ? coupon.discountValue : 0);
      let payRatio = 1;
      if (v > 0 && v <= 1) payRatio = v;
      else if (v > 1 && v <= 10) payRatio = v / 10;
      else if (v > 10) payRatio = v / 100;
      discountAmount = baseAmount * (1 - Math.min(1, payRatio));
      if (coupon.maxDiscountAmount != null) discountAmount = Math.min(discountAmount, parseFloat(coupon.maxDiscountAmount));
      if (coupon.maxDiscount != null) discountAmount = Math.min(discountAmount, parseFloat(coupon.maxDiscount));
    }

    if (coupon.minOrderAmount && baseAmount < parseFloat(coupon.minOrderAmount)) {
      wx.showToast({ title: `订单金额需满${coupon.minOrderAmount}元`, icon: 'none' });
      return;
    }

    const totalAmount = Math.max(0, baseAmount - discountAmount);
    const invalidated = (coupon.stackWithPromotion === false) ? (this.data.promotionDiscountTotal || 0) : 0;
    this.setData({
      selectedCoupon: coupon,
      discountAmount: parseFloat(discountAmount.toFixed(2)),
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      promotionDiscountInvalidatedByCoupon: invalidated
    });
    this.loadOrderPricing(coupon);
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
    const baseAmount = (this.data.subtotalAfterPromo != null && this.data.subtotalAfterPromo > 0) ? this.data.subtotalAfterPromo : this.data.originalAmount;
    if (selectedId && tappedId && selectedId === tappedId) {
      this.setData({
        selectedCoupon: null,
        discountAmount: 0,
        totalAmount: parseFloat(baseAmount.toFixed(2)),
        showCouponPicker: false,
        promotionDiscountInvalidatedByCoupon: 0
      });
      this.loadOrderPricing(null);
      return;
    }
    if (!coupon || !coupon.id) return;

    let discountAmount = 0;
    const isCashOrFixed = coupon.type === 'cash' || coupon.discountType === 'fixed';
    if (isCashOrFixed) {
      discountAmount = parseFloat(coupon.value != null ? coupon.value : (coupon.discountValue != null ? coupon.discountValue : 0));
    } else if (coupon.type === 'discount' || coupon.discountType === 'percent' || coupon.discountType === 'percentage') {
      const v = parseFloat(coupon.discountValue != null ? coupon.discountValue : 0);
      let payRatio = 1;
      if (v > 0 && v <= 1) payRatio = v;
      else if (v > 1 && v <= 10) payRatio = v / 10;
      else if (v > 10) payRatio = v / 100;
      discountAmount = baseAmount * (1 - Math.min(1, payRatio));
      if (coupon.maxDiscountAmount != null) discountAmount = Math.min(discountAmount, parseFloat(coupon.maxDiscountAmount));
    }

    const totalAmount = Math.max(0, baseAmount - discountAmount);
    const invalidated = (coupon.stackWithPromotion === false) ? (this.data.promotionDiscountTotal || 0) : 0;
    this.setData({
      selectedCoupon: coupon,
      discountAmount: parseFloat(discountAmount.toFixed(2)),
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      showCouponPicker: false,
      promotionDiscountInvalidatedByCoupon: invalidated
    });
    this.loadOrderPricing(coupon);
  },

  /**
   * 取消选择优惠券
   */
  onRemoveCoupon() {
    const baseAmount = (this.data.subtotalAfterPromo != null && this.data.subtotalAfterPromo > 0) ? this.data.subtotalAfterPromo : this.data.originalAmount;
    this.setData({
      selectedCoupon: null,
      discountAmount: 0,
      totalAmount: parseFloat(baseAmount.toFixed(2)),
      promotionDiscountInvalidatedByCoupon: 0
    });
    this.loadOrderPricing(null);
  },
  
  /**
   * 计算最终金额（促销后小计 - 优惠券 - 佣金 - 积分）
   */
  calculateFinalAmount() {
    const { subtotalAfterPromo, originalAmount, discountAmount, availableCommission, availablePoints, useCommission, usePoints, POINTS_TO_MONEY_RATE } = this.data;
    const baseAmount = (subtotalAfterPromo != null && subtotalAfterPromo > 0) ? subtotalAfterPromo : originalAmount;

    let finalAmount = Math.max(0, baseAmount - discountAmount);
    
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
    // 代金券：只显示面值 value。折扣券：只显示折扣率 discountValue 转成「x折」
    const isCashOrFixed = c.type === 'cash' || (c.discountType || '').toLowerCase() === 'fixed';
    if (isCashOrFixed) {
      const face = c.value != null ? Number(c.value) : (c.discountValue != null ? Number(c.discountValue) : 0);
      return '¥' + (Number.isFinite(face) ? face.toFixed(2) : '0.00');
    }
    if (c.type === 'discount' || (c.discountType || '').toLowerCase() === 'percentage' || (c.discountType || '').toLowerCase() === 'percent') {
      const v = c.discountValue != null ? Number(c.discountValue) : 0;
      const zhe = v > 10 ? v / 10 : (v > 0 && v < 1 ? v * 10 : v);
      return (Number.isFinite(zhe) ? zhe : 0) + '折';
    }
    const face = c.value != null ? Number(c.value) : 0;
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
   * 加载可用优惠券（subtotal 建议用促销后小计，以便门槛正确）
   */
  async loadAvailableCoupons(itemsArg, subtotalArg) {
    try {
      const items = itemsArg != null ? itemsArg : (this.data.items || []);
      const subtotal = subtotalArg != null ? subtotalArg : (this.data.subtotalAfterPromo != null && this.data.subtotalAfterPromo > 0 ? this.data.subtotalAfterPromo : this.data.originalAmount || 0);
      if (!items.length) return;

      const productIds = items.map(item => item.productId).filter(Boolean);

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
          app.updateCartInfo();
          try {
            if (app.globalData.cartCount > 0) {
              wx.setTabBarBadge({ index: 3, text: String(app.globalData.cartCount) });
            } else {
              wx.removeTabBarBadge({ index: 3 });
            }
          } catch (e) { /* tabBar 可能未就绪 */ }
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


