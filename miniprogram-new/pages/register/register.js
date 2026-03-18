const request = require('../../utils/request');
const auth = require('../../utils/auth');
const { API, API_BASE_URL } = require('../../config/api');
const { buildOptimizedImageUrl } = require('../../utils/util');

function getDefaultAvatar() {
  // 1x1 透明 PNG，占位头像
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
}

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
    avatarTempPath: '',
    defaultAvatar: getDefaultAvatar(),
    avatarDisplayUrl: '',
    phone: ''
  },

  onShow() {
    if (!auth.isLogin()) return;
    this.loadMemberInfo();
  },

  async loadMemberInfo() {
    try {
      const member = await refreshMemberCache();
      if (!member) return;
      const avatarDisplayUrl = member.avatar ? buildOptimizedImageUrl(member.avatar, { type: 'thumbnail' }) : '';
      this.setData({
        nickname: member.nickname || '',
        phone: member.phone || '',
        avatarDisplayUrl
      });
    } catch (_) {}
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
    // chooseAvatar 返回的是临时路径/可直接用于 <image src> 的地址
    this.setData({ avatarTempPath: p, avatarDisplayUrl: p, profileStatus: '' });
  },

  // 资料完善页：用户点击昵称后，触发微信“获取头像昵称”的授权弹窗
  onTapNickname() {
    return this.onGetProfile();
  },

  async onGetProfile() {
    try {
      // 必须用户主动点击触发，微信才允许获取头像昵称
      const userInfo = await auth.getUserProfile();
      const nickname = userInfo && userInfo.nickName ? String(userInfo.nickName).trim() : '';
      const avatarUrl = userInfo && userInfo.avatarUrl ? String(userInfo.avatarUrl).trim() : '';
      if (!nickname) throw new Error('未获取到昵称');

      // 微信可能返回默认头像占位图（通常不是真实用户头像文件）
      const looksLikeDefaultAvatar = !avatarUrl || /\/0(\?|$)/.test(avatarUrl);

      // 1) 先填充昵称并保存到后端（无论头像是否默认，都要保证昵称一定落库）
      this.setData({ nickname, avatarTempPath: '', profileStatus: '' });
      const res1 = await request.put(API.MEMBER.UPDATE_PROFILE, { nickname }, { needAuth: true, showLoading: true });
      if (res1.code !== 0) throw new Error(res1.message || '保存昵称失败');

      // 2) 再处理头像：如果是默认占位图，则让用户选一张；否则直接下载上传。
      let tempFilePath = '';
      if (looksLikeDefaultAvatar) {
        const choose = await new Promise((resolve) => {
          wx.chooseMedia({
            count: 1,
            mediaType: ['image'],
            sourceType: ['album', 'camera'],
            sizeType: ['compressed'],
            success: resolve,
            fail: resolve // 用户取消也走 resolve
          });
        });
        tempFilePath = choose && choose.tempFiles && choose.tempFiles[0] ? choose.tempFiles[0].tempFilePath : '';
      } else if (avatarUrl) {
        const dl = await new Promise((resolve, reject) => {
          wx.downloadFile({
            url: avatarUrl,
            success: resolve,
            fail: reject
          });
        });
        tempFilePath = dl && dl.tempFilePath ? dl.tempFilePath : '';
      }

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

      await refreshMemberCache();
      const member = wx.getStorageSync('memberInfo') || {};
      const avatarDisplayUrl = member.avatar ? buildOptimizedImageUrl(member.avatar, { type: 'thumbnail' }) : '';
      this.setData({
        avatarDisplayUrl,
        phone: member.phone || '',
        nickname: member.nickname || nickname
      });
    } catch (e) {
      // 最小化页面：不额外展示复杂提示
      this.setData({ profileStatus: '' });
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
      this.setData({ profileStatus: '' });
      wx.navigateBack({ delta: 1 });
    } catch (e) {
      this.setData({ profileStatus: '' });
    }
  },

  async onGetPhoneNumber(e) {
    try {
      const phoneNumber = await auth.getPhoneNumber(e);
      if (!phoneNumber) throw new Error('未获取到手机号');
      const res = await request.put(API.MEMBER.UPDATE_PROFILE, { phone: phoneNumber }, { needAuth: true, showLoading: true });
      if (res.code === 0) {
        await refreshMemberCache();
        const member = wx.getStorageSync('memberInfo') || {};
        this.setData({
          phone: member.phone || '',
          phoneStatus: ''
        });
      } else {
        throw new Error(res.message || '更新失败');
      }
    } catch (e2) {
      this.setData({ phoneStatus: '' });
    }
  },

  onSkip() {
    wx.navigateBack({ delta: 1 });
  },

  onFinish() {
    wx.navigateBack({ delta: 1 });
  }
});

