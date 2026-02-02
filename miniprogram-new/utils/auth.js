/**
 * 认证工具
 * 处理用户登录、身份验证相关逻辑
 */

const request = require('./request.js');
const { API } = require('../config/api.js');

// ==================== 用户登录 ====================

/**
 * 小程序登录
 * 调用 wx.login 获取 code，然后调用后台接口换取 openid
 * @returns {Promise<object>} 登录结果
 */
async function login() {
  try {
    console.log('[Auth] 开始登录流程...');
    
    // 1. 调用微信登录接口获取 code
    const loginRes = await new Promise((resolve, reject) => {
      wx.login({
        success: resolve,
        fail: reject
      });
    });
    
    if (!loginRes.code) {
      throw new Error('获取登录凭证失败');
    }
    
    console.log('[Auth] 获取到 code:', loginRes.code);
    
    // 2. 准备用户信息（如果已经授权过头像昵称，带给后台）
    let userInfo = wx.getStorageSync('userProfile') || null;
    
    if (!userInfo) {
      try {
        userInfo = await getUserProfile();
      } catch (error) {
        console.warn('[Auth] 用户未授权头像昵称或授权失败，使用默认昵称', error);
      }
    }

    // 从本地存储读取推荐人ID（如果有）
    let referrerId = null;
    try {
      referrerId = wx.getStorageSync('referrerId');
      if (referrerId) {
        console.log('[Auth] 检测到推荐人ID:', referrerId);
      }
    } catch (err) {
      console.warn('[Auth] 读取推荐人ID失败:', err);
    }

    const payload = {
      code: loginRes.code
    };

    if (userInfo && typeof userInfo === 'object') {
      payload.userInfo = userInfo;
      payload.nickname = userInfo.nickName;
      payload.avatar = userInfo.avatarUrl;
    }

    // 如果有推荐人ID，添加到请求中
    if (referrerId) {
      payload.referrerId = referrerId;
    }
    
    // 3. 调用后台接口，用 code 换取 openid 和会员信息
    const result = await request.post(API.AUTH.LOGIN, payload, {
      showLoading: true,
      showError: true,
      needAuth: false  // 登录接口不需要认证
    });
    
    if (!result.success) {
      throw new Error(result.message || '登录失败');
    }
    
    console.log('[Auth] 登录成功:', result);
    
    // 3. 缓存登录信息
    const { openid, memberId, member } = result;
    
    wx.setStorageSync('openid', openid);
    wx.setStorageSync('memberId', memberId);
    
    if (member) {
      wx.setStorageSync('memberInfo', member);
    }
    
    // 登录成功后清除推荐人ID（避免重复使用）
    if (referrerId) {
      try {
        wx.removeStorageSync('referrerId');
        console.log('[Auth] 推荐人ID已清除');
      } catch (err) {
        console.warn('[Auth] 清除推荐人ID失败:', err);
      }
    }
    
    console.log('[Auth] 登录信息已缓存');
    
    // 4. 更新全局数据
    const app = getApp();
    if (app.globalData) {
      app.globalData.openid = openid;
      app.globalData.memberId = memberId;
      app.globalData.isLogin = true;
    }
    
    return {
      success: true,
      openid: openid,
      memberId: memberId,
      member: member
    };
    
  } catch (error) {
    console.error('[Auth] 登录失败:', error);
    
    wx.showToast({
      title: error.message || '登录失败',
      icon: 'none',
      duration: 2000
    });
    
    return {
      success: false,
      message: error.message || '登录失败'
    };
  }
}

// ==================== 检查登录状态 ====================

/**
 * 检查用户是否已登录
 * @returns {boolean} 是否已登录
 */
function isLogin() {
  const openid = wx.getStorageSync('openid');
  return !!openid;
}

/**
 * 获取缓存的 openid
 * @returns {string|null} openid
 */
function getOpenid() {
  return wx.getStorageSync('openid') || null;
}

/**
 * 获取缓存的会员ID
 * @returns {number|null} 会员ID
 */
function getMemberId() {
  return wx.getStorageSync('memberId') || null;
}

/**
 * 获取缓存的会员信息
 * @returns {object|null} 会员信息
 */
function getMemberInfo() {
  return wx.getStorageSync('memberInfo') || null;
}

// ==================== 退出登录 ====================

/**
 * 退出登录
 * 清除所有缓存的登录信息
 */
function logout() {
  try {
    console.log('[Auth] 退出登录');
    
    // 清除缓存
    wx.removeStorageSync('openid');
    wx.removeStorageSync('memberId');
    wx.removeStorageSync('memberInfo');
    
    // 清除全局数据
    const app = getApp();
    if (app.globalData) {
      app.globalData.openid = null;
      app.globalData.memberId = null;
      app.globalData.isLogin = false;
    }
    
    // 清空购物车数据
    if (app.globalData) {
      app.globalData.cartItems = [];
      app.globalData.cartTotal = 0;
    }
    
    wx.showToast({
      title: '已退出登录',
      icon: 'success',
      duration: 1500
    });
    
    // 跳转到首页
    setTimeout(() => {
      wx.switchTab({
        url: '/pages/index/index'
      });
    }, 1500);
    
  } catch (error) {
    console.error('[Auth] 退出登录失败:', error);
  }
}

// ==================== 确保已登录 ====================

/**
 * 确保用户已登录，如果未登录则自动调用登录
 * @returns {Promise<boolean>} 是否登录成功
 */
async function ensureLogin() {
  if (isLogin()) {
    console.log('[Auth] 用户已登录');
    return true;
  }
  
  console.log('[Auth] 用户未登录，开始自动登录...');
  
  const result = await login();
  return result.success;
}

// ==================== 获取用户信息 ====================

/**
 * 获取用户授权信息（头像、昵称）
 * 注意：微信官方已废弃 getUserInfo，推荐使用头像昵称填写组件
 * @returns {Promise<object>} 用户信息
 */
async function getUserProfile() {
  return new Promise((resolve, reject) => {
    wx.getUserProfile({
      desc: '用于完善会员资料',
      success: (res) => {
        console.log('[Auth] 获取用户信息成功:', res.userInfo);
        
        // 缓存用户信息
        wx.setStorageSync('userProfile', res.userInfo);
        
        resolve(res.userInfo);
      },
      fail: (error) => {
        console.error('[Auth] 获取用户信息失败:', error);
        reject(error);
      }
    });
  });
}

/**
 * 获取用户手机号
 * @param {object} event - button 组件的 getPhoneNumber 事件
 * @returns {Promise<string>} 手机号
 */
async function getPhoneNumber(event) {
  try {
    const { code, errMsg } = event.detail;
    
    if (code) {
      console.log('[Auth] 获取手机号 code:', code);
      
      // 调用后台接口解密手机号
      const result = await request.post('/api/auth/get-phone-number', {
        code: code
      });
      
      if (result.success && result.phoneNumber) {
        console.log('[Auth] 获取手机号成功:', result.phoneNumber);
        return result.phoneNumber;
      } else {
        throw new Error(result.message || '获取手机号失败');
      }
    } else {
      throw new Error(errMsg || '用户拒绝授权');
    }
  } catch (error) {
    console.error('[Auth] 获取手机号失败:', error);
    throw error;
  }
}

// ==================== 检查权限 ====================

/**
 * 检查是否有某个权限
 * @param {string} scope - 权限名称，如 'scope.userLocation'
 * @returns {Promise<boolean>} 是否有权限
 */
async function checkPermission(scope) {
  return new Promise((resolve) => {
    wx.getSetting({
      success: (res) => {
        resolve(!!res.authSetting[scope]);
      },
      fail: () => {
        resolve(false);
      }
    });
  });
}

/**
 * 请求权限
 * @param {string} scope - 权限名称
 * @returns {Promise<boolean>} 是否授权成功
 */
async function requestPermission(scope) {
  return new Promise((resolve) => {
    wx.authorize({
      scope: scope,
      success: () => {
        console.log('[Auth] 授权成功:', scope);
        resolve(true);
      },
      fail: () => {
        console.log('[Auth] 授权失败:', scope);
        // 引导用户打开设置页面
        wx.showModal({
          title: '需要授权',
          content: '请在设置中开启相关权限',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) {
              wx.openSetting();
            }
          }
        });
        resolve(false);
      }
    });
  });
}

// ==================== 导出 ====================

module.exports = {
  login,
  logout,
  isLogin,
  getOpenid,
  getMemberId,
  getMemberInfo,
  ensureLogin,
  getUserProfile,
  getPhoneNumber,
  checkPermission,
  requestPermission
};

