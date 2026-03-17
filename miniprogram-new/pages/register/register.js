const request = require('../../utils/request');
const auth = require('../../utils/auth');
const { API } = require('../../config/api');

Page({
  data: {
    profileStatus: '',
    phoneStatus: ''
  },

  async onGetProfile() {
    try {
      const userInfo = await auth.getUserProfile();
      const nickname = userInfo && userInfo.nickName ? String(userInfo.nickName).trim() : '';
      const avatar = userInfo && userInfo.avatarUrl ? String(userInfo.avatarUrl).trim() : '';
      if (!nickname) throw new Error('未获取到昵称');

      const res = await request.put(API.MEMBER.UPDATE_PROFILE, { nickname, avatar }, { needAuth: true, showLoading: true });
      if (res.code === 0) {
        const memberInfo = wx.getStorageSync('memberInfo') || {};
        wx.setStorageSync('memberInfo', { ...memberInfo, nickname, avatar });
        this.setData({ profileStatus: '已更新头像昵称' });
      } else {
        throw new Error(res.message || '更新失败');
      }
    } catch (e) {
      this.setData({ profileStatus: '未授权或更新失败，将使用默认昵称' });
    }
  },

  async onGetPhoneNumber(e) {
    try {
      const phoneNumber = await auth.getPhoneNumber(e);
      if (!phoneNumber) throw new Error('未获取到手机号');
      const res = await request.put(API.MEMBER.UPDATE_PROFILE, { phone: phoneNumber }, { needAuth: true, showLoading: true });
      if (res.code === 0) {
        const memberInfo = wx.getStorageSync('memberInfo') || {};
        wx.setStorageSync('memberInfo', { ...memberInfo, phone: phoneNumber });
        this.setData({ phoneStatus: '已绑定手机号' });
      } else {
        throw new Error(res.message || '更新失败');
      }
    } catch (e2) {
      this.setData({ phoneStatus: '未授权或获取失败，可稍后在个人资料中完善' });
    }
  },

  onSkip() {
    wx.navigateBack({ delta: 1 });
  },

  onFinish() {
    wx.navigateBack({ delta: 1 });
  }
});

