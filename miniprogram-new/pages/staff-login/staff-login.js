const request = require('../../utils/request');
const { API, replaceUrlParams } = require('../../config/api');

Page({
  data: {
    username: '',
    password: '',
    loading: false
  },

  onLoad() {
    // 检查是否已登录
    const staffToken = wx.getStorageSync('staffToken');
    if (staffToken) {
      wx.redirectTo({
        url: '/pages/staff/staff'
      });
    }
  },

  onUsernameInput(e) {
    this.setData({ username: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  async onLogin() {
    const { username, password } = this.data;

    if (!username || !password) {
      wx.showToast({
        title: '请输入用户名和密码',
        icon: 'none'
      });
      return;
    }

    this.setData({ loading: true });

    try {
      const url = replaceUrlParams(API.STAFF.LOGIN, {});
      const res = await request.post(url, {
        username,
        password
      }, {
        showLoading: false
      });

      if (res.code === 0) {
        // 保存token
        wx.setStorageSync('staffToken', res.data.token);
        wx.setStorageSync('staffInfo', res.data.staff);

        wx.showToast({
          title: '登录成功',
          icon: 'success'
        });

        setTimeout(() => {
          wx.redirectTo({
            url: '/pages/staff/staff'
          });
        }, 1000);
      } else {
        wx.showToast({
          title: res.message || '登录失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('[StaffLogin] 登录失败:', error);
      wx.showToast({
        title: '登录失败',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  }
});

