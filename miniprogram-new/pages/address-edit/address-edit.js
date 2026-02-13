const { API, replaceUrlParams } = require('../../config/api');
const request = require('../../utils/request');
const { splitRegionDetail } = require('../../utils/address.js');

Page({
  data: {
    addressId: null,
    formData: {
      name: '',
      phone: '',
      region: '',
      detail: ''
    },
    saving: false
  },

  onLoad(options) {
    const { id } = options;
    if (id) {
      this.setData({ addressId: id });
      this.loadDetail(id);
    }
  },

  async loadDetail(id) {
    try {
      wx.showLoading({ title: '加载中' });
      const res = await request.get(replaceUrlParams(API.ADDRESS.UPDATE, { id }), {}, { showLoading: false });
      if (res.code === 0 && res.data) {
        this.setData({ formData: res.data });
      } else {
        wx.showToast({ title: res.message || '加载失败', icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({
      formData: { ...this.data.formData, [field]: e.detail.value }
    });
  },

  onRegionChange(e) {
    const regionArr = e.detail.value || [];
    const region = Array.isArray(regionArr) ? regionArr.join(' ') : '';
    this.setData({
      formData: { ...this.data.formData, region }
    });
  },

  async onChooseLocation() {
    try {
      const res = await wx.chooseLocation();
      if (res && res.address) {
        const parsed = splitRegionDetail(res.address || '', res.name || '');
        this.setData({
          formData: {
            ...this.data.formData,
            region: parsed.region,
            detail: parsed.detail
          }
        });
      }
    } catch (err) {
      // 用户取消不提示
    }
  },

  validate() {
    const { name, phone, region, detail } = this.data.formData;
    if (!name.trim()) return { err: '请输入收货人' };
    const purePhone = (phone || '').replace(/\s+/g, '');
    if (!/^1\d{10}$/.test(purePhone)) return { err: '手机号格式不正确' };
    if (!region.trim()) return { err: '请输入省市区' };
    if (!detail.trim()) return { err: '请输入详细地址' };
    const normalized = { ...this.data.formData, phone: purePhone };
    return { err: '', formData: normalized };
  },

  async onSave() {
    const { err, formData } = this.validate();
    if (err) return wx.showToast({ title: err, icon: 'none' });

    const { addressId } = this.data;
    const isEdit = !!addressId;
    const url = isEdit
      ? replaceUrlParams(API.ADDRESS.UPDATE, { id: addressId })
      : API.ADDRESS.CREATE;
    const method = isEdit ? 'PUT' : 'POST';

    try {
      this.setData({ saving: true });
      wx.showLoading({ title: '保存中' });
      console.log('[Address] saving', { url, method, formData });
      const res = await request.request(url, {
        method,
        data: formData,
        timeout: 20000,
        showLoading: false
      });
      console.log('[Address] save response', res);
      if (res.code === 0) {
        wx.showToast({ title: '保存成功', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 400);
      } else {
        wx.showToast({ title: res.message || '保存失败', icon: 'none' });
      }
    } catch (err) {
      console.warn('[Address] save error', err);
      wx.showToast({ title: err?.errMsg || '网络异常', icon: 'none' });
    } finally {
      this.setData({ saving: false });
      wx.hideLoading();
    }
  }
});

