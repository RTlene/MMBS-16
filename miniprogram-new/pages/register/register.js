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

  async onGetProfile() {
    try {
      // 必须用户主动点击触发，微信才允许获取头像昵称
      const userInfo = await auth.getUserProfile();
      const nickname = userInfo && userInfo.nickName ? String(userInfo.nickName).trim() : '';
      const avatarUrl = userInfo && userInfo.avatarUrl ? String(userInfo.avatarUrl).trim() : '';
      if (!nickname) throw new Error('未获取到昵称');

      // 微信在部分情况下会返回“默认资料”（例如昵称=微信用户、头像为默认占位图）
      // 这类数据没有真实用户头像文件，体验会比较差；此时引导用户走 chooseAvatar + 手动昵称。
      const DEFAULT_NICKNAME = '微信用户';
      const looksLikeDefaultAvatar = !avatarUrl || /\/0(\?|$)/.test(avatarUrl);
      const isDefaultNickname = !nickname || nickname === DEFAULT_NICKNAME || nickname.startsWith(DEFAULT_NICKNAME);
      if (isDefaultNickname || looksLikeDefaultAvatar) {
        this.setData({
          nickname: '',
          avatarTempPath: '',
          profileStatus: '获取到默认头像/昵称，请使用「选择头像」并填写昵称后再保存'
        });
        return;
      }

      // 1) 先填充昵称并保存
      this.setData({ nickname });
      const res1 = await request.put(API.MEMBER.UPDATE_PROFILE, { nickname }, { needAuth: true, showLoading: true });
      if (res1.code !== 0) throw new Error(res1.message || '保存昵称失败');

      // 2) 将微信头像URL下载为临时文件，再上传到对象存储（避免只保存远端URL）
      if (avatarUrl) {
        const dl = await new Promise((resolve, reject) => {
          wx.downloadFile({
            url: avatarUrl,
            success: resolve,
            fail: reject
          });
        });
        const tempFilePath = dl && dl.tempFilePath ? dl.tempFilePath : '';
        if (tempFilePath) {
          const openid = wx.getStorageSync('openid');
          if (!openid) throw new Error('未登录');
          const uploadRes = await new Promise((resolve, reject) => {
            wx.uploadFile({
              url: API_BASE_URL + '/api/miniapp/members/avatar-upload',
              filePath: tempFilePath,
              name: 'image',
              header: { openid },
              success: resolve,
              fail: reject
            });
          });
          const data = uploadRes && uploadRes.data ? JSON.parse(uploadRes.data) : null;
          if (!data || data.code !== 0) throw new Error((data && data.message) || '头像上传失败');
        }
      }

      await refreshMemberCache();
      this.setData({ profileStatus: '已更新头像昵称' });
    } catch (e) {
      this.setData({ profileStatus: '用户拒绝授权或获取失败，可改用“选择头像”+手动输入昵称' });
    }
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

