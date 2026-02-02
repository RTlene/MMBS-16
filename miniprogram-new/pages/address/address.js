const { API, replaceUrlParams } = require('../../config/api');
const request = require('../../utils/request');

Page({
  data: {
    loading: false,
    addressList: []
  },

  onLoad() {
    this.fetchList();
  },

  onShow() {
    // 编辑/新增返回后刷新
    this.fetchList();
  },

  async fetchList() {
    this.setData({ loading: true });
    try {
      const res = await request.get(API.ADDRESS.LIST, {}, { showLoading: false });
      if (res.code === 0) {
        this.setData({ addressList: res.data || [] });
      } else {
        wx.showToast({ title: res.message || '加载失败', icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onAddAddress() {
    wx.navigateTo({
      url: '/pages/address-edit/address-edit'
    });
  },

  onEditAddress(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/address-edit/address-edit?id=${id}`
    });
  },

  async onDeleteAddress(e) {
    const { id } = e.currentTarget.dataset;
    const resModal = await wx.showModal({
      title: '删除地址',
      content: '确定删除该地址吗？'
    });
    if (!resModal.confirm) return;

    try {
      wx.showLoading({ title: '删除中' });
      const url = replaceUrlParams(API.ADDRESS.DELETE, { id });
      const res = await request.del(url, {}, { showLoading: false });
      if (res.code === 0) {
        wx.showToast({ title: '已删除', icon: 'none' });
        this.fetchList();
      } else {
        wx.showToast({ title: res.message || '删除失败', icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async onSetDefault(e) {
    const { id } = e.currentTarget.dataset;
    try {
      wx.showLoading({ title: '设置中' });
      const url = replaceUrlParams(API.ADDRESS.SET_DEFAULT, { id });
      const res = await request.put(url, {}, { showLoading: false });
      if (res.code === 0) {
        wx.showToast({ title: '已设为默认', icon: 'none' });
        this.fetchList();
      } else {
        wx.showToast({ title: res.message || '设置失败', icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  }
});

