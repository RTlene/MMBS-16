const { API, replaceUrlParams } = require('../../config/api');
const request = require('../../utils/request');
const { splitRegionDetail } = require('../../utils/address.js');

// 与后端 member_addresses 字段长度一致
const LIMITS = { name: 50, phone: 20, region: 200, detail: 200 };

Page({
  data: {
    addressId: null,
    formData: {
      name: '',
      phone: '',
      region: '',
      detail: ''
    },
    phoneError: '',
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
    let value = e.detail.value || '';
    const maxLen = LIMITS[field];
    let showOverTip = false;
    if (maxLen && value.length > maxLen) {
      value = value.slice(0, maxLen);
      showOverTip = true;
    }
    this.setData({
      formData: { ...this.data.formData, [field]: value },
      phoneError: field === 'phone' ? this._phoneError(value) : this.data.phoneError
    });
    if (showOverTip) {
      const tips = { name: '收货人最多50字', phone: '手机号最多20位', region: '省市区最多200字', detail: '详细地址最多200字' };
      wx.showToast({ title: tips[field] || '已超出字数限制', icon: 'none' });
    }
  },

  _phoneError(phone) {
    const p = (phone || '').replace(/\s+/g, '');
    if (!p) return '请输入手机号';
    if (!/^\d+$/.test(p)) return '手机号格式不正确';
    if (p.length > LIMITS.phone) return '手机号最多20位';
    return '';
  },

  onPhoneBlur() {
    const phone = this.data.formData.phone || '';
    this.setData({ phoneError: this._phoneError(phone) });
  },

  onRegionChange(e) {
    const regionArr = e.detail.value || [];
    let region = Array.isArray(regionArr) ? regionArr.join(' ') : '';
    if (region.length > LIMITS.region) {
      region = region.slice(0, LIMITS.region);
      wx.showToast({ title: '省市区最多200字', icon: 'none' });
    }
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
    const phoneErr = this._phoneError(phone);
    if (phoneErr) {
      this.setData({ phoneError: phoneErr });
      return { err: phoneErr };
    }
    this.setData({ phoneError: '' });
    if (!region.trim()) return { err: '请选择省市区' };
    if (!detail.trim()) return { err: '请输入详细地址' };
    const normalized = {
      name: name.trim().slice(0, LIMITS.name),
      phone: purePhone.slice(0, LIMITS.phone),
      region: region.trim().slice(0, LIMITS.region),
      detail: detail.trim().slice(0, LIMITS.detail),
      isDefault: this.data.formData.isDefault
    };
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

