const request = require('../../../../utils/request');
const { API, replaceUrlParams } = require('../../../../config/api');

Component({
  data: {
    products: [],
    keyword: '',
    page: 1,
    limit: 20,
    hasMore: true,
    loading: false,
    selectedSku: null,
    showStockModal: false,
    stockValue: '',
    stockOperation: 'set'
  },

  attached() {
    this.loadProducts();
  },

  methods: {
    onKeywordInput(e) {
      this.setData({ keyword: e.detail.value });
    },

    onSearch() {
      this.setData({ page: 1, products: [], hasMore: true });
      this.loadProducts();
    },

    async loadProducts() {
      if (this.data.loading || !this.data.hasMore) return;

      this.setData({ loading: true });

      try {
        const url = replaceUrlParams(API.STAFF.PRODUCTS, {});
        const res = await request.get(url, {
          keyword: this.data.keyword,
          page: this.data.page,
          limit: this.data.limit
        }, {
          isStaff: true,
          needAuth: true,
          showLoading: false
        });

        if (res.code === 0) {
          const { products, hasMore } = res.data;
          const newProducts = this.data.page === 1 ? products : [...this.data.products, ...products];
          
          this.setData({
            products: newProducts,
            hasMore,
            page: this.data.page + 1
          });
        }
      } catch (error) {
        console.error('[Inventory] 加载失败:', error);
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        });
      } finally {
        this.setData({ loading: false });
      }
    },

    onSkuTap(e) {
      const sku = e.currentTarget.dataset.sku;
      this.setData({
        selectedSku: sku,
        stockValue: sku.stock.toString(),
        stockOperation: 'set',
        showStockModal: true
      });
    },

    onStockOperationChange(e) {
      const operations = ['set', 'add', 'subtract'];
      const index = parseInt(e.detail.value);
      this.setData({ stockOperation: operations[index] });
    },

    onStockValueInput(e) {
      this.setData({ stockValue: e.detail.value });
    },

    async onUpdateStock() {
      const { selectedSku, stockValue, stockOperation } = this.data;

      if (!stockValue || isNaN(stockValue)) {
        wx.showToast({
          title: '请输入有效数字',
          icon: 'none'
        });
        return;
      }

      try {
        const url = replaceUrlParams(API.STAFF.UPDATE_STOCK, { id: selectedSku.id });
        const res = await request.put(url, {
          stock: parseInt(stockValue),
          operation: stockOperation
        }, {
          isStaff: true,
          needAuth: true
        });

        if (res.code === 0) {
          wx.showToast({
            title: '更新成功',
            icon: 'success'
          });

          // 更新本地数据
          const products = this.data.products.map(product => {
            if (product.skus) {
              product.skus = product.skus.map(sku => {
                if (sku.id === selectedSku.id) {
                  return { ...sku, stock: res.data.sku.stock };
                }
                return sku;
              });
            }
            return product;
          });

          this.setData({
            products,
            showStockModal: false,
            selectedSku: null
          });
        }
      } catch (error) {
        console.error('[Inventory] 更新库存失败:', error);
        wx.showToast({
          title: '更新失败',
          icon: 'none'
        });
      }
    },

    onCloseStockModal() {
      this.setData({
        showStockModal: false,
        selectedSku: null,
        stockValue: ''
      });
    }
  }
});

