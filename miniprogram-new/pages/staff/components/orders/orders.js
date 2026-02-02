const request = require('../../../../utils/request');
const { API, replaceUrlParams } = require('../../../../config/api');

Component({
  data: {
    orders: [],
    status: 'paid', // paid-待发货, shipped-已发货
    keyword: '',
    page: 1,
    limit: 20,
    hasMore: true,
    loading: false,
    selectedOrder: null,
    showShipModal: false,
    shippingCompany: '',
    trackingNumber: '',
    shippingMethod: 'express'
  },

  attached() {
    this.loadOrders();
  },

  methods: {
    onStatusChange(e) {
      const status = e.currentTarget.dataset.status;
      if (status === this.data.status) return;
      
      this.setData({
        status,
        page: 1,
        orders: [],
        hasMore: true
      });
      this.loadOrders();
    },

    onKeywordInput(e) {
      this.setData({ keyword: e.detail.value });
    },

    onSearch() {
      this.setData({ page: 1, orders: [], hasMore: true });
      this.loadOrders();
    },

    async loadOrders() {
      if (this.data.loading || !this.data.hasMore) return;

      this.setData({ loading: true });

      try {
        const url = replaceUrlParams(API.STAFF.ORDERS, {});
        const res = await request.get(url, {
          status: this.data.status,
          keyword: this.data.keyword,
          page: this.data.page,
          limit: this.data.limit
        }, {
          isStaff: true,
          needAuth: true,
          showLoading: false
        });

        if (res.code === 0) {
          const { orders, hasMore } = res.data;
          const newOrders = this.data.page === 1 ? orders : [...this.data.orders, ...orders];
          
          this.setData({
            orders: newOrders,
            hasMore,
            page: this.data.page + 1
          });
        }
      } catch (error) {
        console.error('[Orders] 加载失败:', error);
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        });
      } finally {
        this.setData({ loading: false });
      }
    },

    onOrderTap(e) {
      const order = e.currentTarget.dataset.order;
      if (order.status === 'paid') {
        this.setData({
          selectedOrder: order,
          shippingCompany: '',
          trackingNumber: '',
          shippingMethod: 'express',
          showShipModal: true
        });
      }
    },

    onShippingCompanyInput(e) {
      this.setData({ shippingCompany: e.detail.value });
    },

    onTrackingNumberInput(e) {
      this.setData({ trackingNumber: e.detail.value });
    },

    onShippingMethodChange(e) {
      const methods = ['express', 'standard', 'ems'];
      const index = parseInt(e.detail.value);
      this.setData({ shippingMethod: methods[index] });
    },

    async onShipOrder() {
      const { selectedOrder, shippingCompany, trackingNumber, shippingMethod } = this.data;

      if (!shippingCompany || !trackingNumber) {
        wx.showToast({
          title: '请填写物流信息',
          icon: 'none'
        });
        return;
      }

      try {
        const url = replaceUrlParams(API.STAFF.SHIP_ORDER, { id: selectedOrder.id });
        const res = await request.put(url, {
          shippingCompany,
          trackingNumber,
          shippingMethod
        }, {
          isStaff: true,
          needAuth: true
        });

        if (res.code === 0) {
          wx.showToast({
            title: '发货成功',
            icon: 'success'
          });

          // 更新本地数据
          const orders = this.data.orders.map(order => {
            if (order.id === selectedOrder.id) {
              return {
                ...order,
                status: 'shipped',
                shippingCompany,
                trackingNumber,
                shippedAt: new Date()
              };
            }
            return order;
          });

          this.setData({
            orders,
            showShipModal: false,
            selectedOrder: null
          });
        }
      } catch (error) {
        console.error('[Orders] 发货失败:', error);
        wx.showToast({
          title: '发货失败',
          icon: 'none'
        });
      }
    },

    onCloseShipModal() {
      this.setData({
        showShipModal: false,
        selectedOrder: null,
        shippingCompany: '',
        trackingNumber: ''
      });
    }
  }
});

