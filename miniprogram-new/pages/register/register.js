const request = require('../../utils/request');
const auth = require('../../utils/auth');
const { API, API_BASE_URL } = require('../../config/api');

async function refreshMemberCache() {
  try {
    const res = await request.get(API.MEMBER.PROFILE, {}, { needAuth: true, showLoading: false, showError: false });
    const member = res && res.data && res.data.member ? res.data.member : null;
    if (!member) return null;
    wx.setStorageSync('memberInfo', member);
    try {
      const app = getApp();
      if (app && app.globalData) app.globalData.memberInfo = member;
    } catch (_) {}
    return member;
  } catch (_) {
    return null;
  }
}

Page({
  data: {
    profileStatus: '',
    phoneStatus: '',
    nickname: '',
    avatarTempPath: ''
  },

  onNicknameInput(e) {
    this.setData({ nickname: (e.detail && e.detail.value) || '' });
  },

  onChooseAvatar(e) {
    const p = e && e.detail && e.detail.avatarUrl ? String(e.detail.avatarUrl) : '';
    if (!p) {
      this.setData({ profileStatus: '未选择头像' });
      return;
    }
    this.setData({ avatarTempPath: p, profileStatus: '已选择头像' });
  },

  async onSaveProfile() {
    try {
      const nickname = (this.data.nickname || '').trim();
      if (!nickname) {
        this.setData({ profileStatus: '请先填写昵称' });
        return;
      }

      // 1) 先保存昵称
      const res1 = await request.put(API.MEMBER.UPDATE_PROFILE, { nickname }, { needAuth: true, showLoading: true });
      if (res1.code !== 0) throw new Error(res1.message || '保存昵称失败');

      // 2) 若有选择头像，则上传到对象存储（云托管/COS/本地回退），避免只保存微信临时 URL
      const avatarTempPath = this.data.avatarTempPath;
      if (avatarTempPath) {
        const openid = wx.getStorageSync('openid');
        if (!openid) throw new Error('未登录');
        const uploadRes = await new Promise((resolve, reject) => {
          wx.uploadFile({
            url: API_BASE_URL + '/api/miniapp/members/avatar-upload',
            filePath: avatarTempPath,
            name: 'image',
            header: { openid },
            success: resolve,
            fail: reject
          });
        });
        const data = uploadRes && uploadRes.data ? JSON.parse(uploadRes.data) : null;
        if (!data || data.code !== 0) throw new Error((data && data.message) || '头像上传失败');
      }

      await refreshMemberCache();
      this.setData({ profileStatus: '已更新头像昵称' });
    } catch (e) {
      this.setData({ profileStatus: e.message || '更新失败，将使用默认昵称' });
    }
  },

  async onGetPhoneNumber(e) {
    try {
      const phoneNumber = await auth.getPhoneNumber(e);
      if (!phoneNumber) throw new Error('未获取到手机号');
      const res = await request.put(API.MEMBER.UPDATE_PROFILE, { phone: phoneNumber }, { needAuth: true, showLoading: true });
      if (res.code === 0) {
        await refreshMemberCache();
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

