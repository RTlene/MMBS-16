const request = require('../../utils/request');
const auth = require('../../utils/auth');
const { API, API_BASE_URL } = require('../../config/api');
const { buildOptimizedImageUrl } = require('../../utils/util');

Page({
  data: {
    defaultAvatar: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    avatar: '',
    nickname: '',
    phone: '',
    saving: false
  },

  onShow() {
    this.loadProfile();
  },

  async loadProfile() {
    try {
      const res = await request.get(API.MEMBER.PROFILE, {}, { needAuth: true, showLoading: false, showError: false });
      const m = res && res.data && res.data.member ? res.data.member : null;
      if (!m) return;
      this.setData({
        avatar: m.avatar ? buildOptimizedImageUrl(m.avatar, { type: 'thumbnail' }) : '',
        nickname: m.nickname || '',
        phone: m.phone || ''
      });
    } catch (_) {}
  },

  onNicknameInput(e) {
    this.setData({ nickname: (e.detail && e.detail.value) || '' });
  },

  async onChooseAvatar(e) {
    if (!auth.isLogin()) return;
    try {
      let filePath = e && e.detail && e.detail.avatarUrl ? String(e.detail.avatarUrl) : '';
      if (!filePath) {
        const choose = await new Promise((resolve, reject) => {
          wx.chooseMedia({
            count: 1,
            mediaType: ['image'],
            sourceType: ['album', 'camera'],
            sizeType: ['compressed'],
            success: resolve,
            fail: reject
          });
        });
        filePath = choose && choose.tempFiles && choose.tempFiles[0] ? choose.tempFiles[0].tempFilePath : '';
      }
      if (!filePath) return;

      const openid = wx.getStorageSync('openid');
      if (!openid) throw new Error('未登录');

      wx.showLoading({ title: '上传中...', mask: true });
      const uploadRes = await new Promise((resolve, reject) => {
        wx.uploadFile({
          url: API_BASE_URL + '/api/miniapp/members/avatar-upload',
          filePath,
          name: 'image',
          header: { openid },
          success: resolve,
          fail: reject
        });
      });
      wx.hideLoading();
      const data = uploadRes && uploadRes.data ? JSON.parse(uploadRes.data) : null;
      if (!data || data.code !== 0 || !data.data || !data.data.avatar) {
        throw new Error((data && data.message) || '上传失败');
      }
      const avatar = buildOptimizedImageUrl(data.data.avatar, { type: 'thumbnail' });
      const memberInfo = wx.getStorageSync('memberInfo') || {};
      wx.setStorageSync('memberInfo', { ...memberInfo, avatar: data.data.avatar });
      try {
        const app = getApp();
        if (app && app.globalData) app.globalData.memberInfo = { ...(app.globalData.memberInfo || {}), avatar: data.data.avatar };
      } catch (_) {}
      this.setData({ avatar });
      wx.showToast({ title: '头像已更新', icon: 'success' });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: e.message || '上传失败', icon: 'none' });
    }
  },

  async onGetPhoneNumber(e) {
    try {
      const phoneNumber = await auth.getPhoneNumber(e);
      if (!phoneNumber) throw new Error('未获取到手机号');
      const res = await request.put(API.MEMBER.UPDATE_PROFILE, { phone: phoneNumber }, { needAuth: true, showLoading: true });
      if (res.code !== 0) throw new Error(res.message || '绑定失败');
      const memberInfo = wx.getStorageSync('memberInfo') || {};
      wx.setStorageSync('memberInfo', { ...memberInfo, phone: phoneNumber });
      this.setData({ phone: phoneNumber });
      wx.showToast({ title: '手机号已绑定', icon: 'success' });
    } catch (e2) {
      wx.showToast({ title: e2.message || '绑定失败', icon: 'none' });
    }
  },

  async onSave() {
    if (this.data.saving) return;
    const nickname = (this.data.nickname || '').trim();
    if (!nickname) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      const res = await request.put(API.MEMBER.UPDATE_PROFILE, { nickname }, { needAuth: true, showLoading: true });
      if (res.code !== 0) throw new Error(res.message || '保存失败');
      const memberInfo = wx.getStorageSync('memberInfo') || {};
      wx.setStorageSync('memberInfo', { ...memberInfo, nickname });
      try {
        const app = getApp();
        if (app && app.globalData) app.globalData.memberInfo = { ...(app.globalData.memberInfo || {}), nickname };
      } catch (_) {}
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 400);
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  onCancel() {
    wx.navigateBack({ delta: 1 });
  }
});

