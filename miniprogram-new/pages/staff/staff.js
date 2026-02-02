const request = require('../../utils/request');
const { API, replaceUrlParams } = require('../../config/api');

Page({
  data: {
    currentTab: 'inventory', // inventory, orders, verification
    staffInfo: null
  },

  onLoad() {
    // 检查登录状态
    const staffToken = wx.getStorageSync('staffToken');
    const staffInfo = wx.getStorageSync('staffInfo');
    
    if (!staffToken) {
      wx.redirectTo({
        url: '/pages/staff-login/staff-login'
      });
      return;
    }

    this.setData({ staffInfo });
  },

  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
  },

  onLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('staffToken');
          wx.removeStorageSync('staffInfo');
          wx.redirectTo({
            url: '/pages/staff-login/staff-login'
          });
        }
      }
    });
  }
});

