/**
 * 通用工具函数
 * 提供常用的格式化、验证、转换等功能
 */

// ==================== 日期时间处理 ====================

/**
 * 格式化日期时间
 * @param {Date|string|number} date - 日期对象、日期字符串或时间戳
 * @param {string} format - 格式化模板，默认 'YYYY-MM-DD HH:mm:ss'
 * @returns {string} 格式化后的日期字符串
 * 
 * @example
 * formatTime(new Date(), 'YYYY-MM-DD') // '2025-10-01'
 * formatTime(1633046400000, 'YYYY年MM月DD日') // '2021年10月01日'
 */
function formatTime(date, format = 'YYYY-MM-DD HH:mm:ss') {
  if (!date) return '';
  
  const d = new Date(date);
  
  if (isNaN(d.getTime())) return '';
  
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hour = d.getHours();
  const minute = d.getMinutes();
  const second = d.getSeconds();
  
  const pad = (n) => n < 10 ? '0' + n : n;
  
  return format
    .replace('YYYY', year)
    .replace('MM', pad(month))
    .replace('DD', pad(day))
    .replace('HH', pad(hour))
    .replace('mm', pad(minute))
    .replace('ss', pad(second));
}

/**
 * 获取友好的时间显示
 * @param {Date|string|number} date - 日期
 * @returns {string} 友好的时间字符串
 * 
 * @example
 * getTimeAgo(new Date()) // '刚刚'
 * getTimeAgo(Date.now() - 60000) // '1分钟前'
 */
function getTimeAgo(date) {
  const d = new Date(date);
  const now = new Date();
  const diff = now - d;
  
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const month = 30 * day;
  const year = 365 * day;
  
  if (diff < minute) {
    return '刚刚';
  } else if (diff < hour) {
    return Math.floor(diff / minute) + '分钟前';
  } else if (diff < day) {
    return Math.floor(diff / hour) + '小时前';
  } else if (diff < month) {
    return Math.floor(diff / day) + '天前';
  } else if (diff < year) {
    return Math.floor(diff / month) + '个月前';
  } else {
    return Math.floor(diff / year) + '年前';
  }
}

// ==================== 数字处理 ====================

/**
 * 格式化金额
 * @param {number} amount - 金额
 * @param {number} decimals - 小数位数，默认2位
 * @param {boolean} showSymbol - 是否显示货币符号，默认true
 * @returns {string} 格式化后的金额
 * 
 * @example
 * formatMoney(1234.5) // '¥1,234.50'
 * formatMoney(1234.5, 2, false) // '1,234.50'
 */
function formatMoney(amount, decimals = 2, showSymbol = true) {
  if (amount === null || amount === undefined) return showSymbol ? '¥0.00' : '0.00';
  
  const num = parseFloat(amount);
  if (isNaN(num)) return showSymbol ? '¥0.00' : '0.00';
  
  const parts = num.toFixed(decimals).split('.');
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decimalPart = parts[1] || '00';
  
  const result = `${integerPart}.${decimalPart}`;
  return showSymbol ? `¥${result}` : result;
}

/**
 * 格式化数字（添加千分位）
 * @param {number} num - 数字
 * @returns {string} 格式化后的数字
 */
function formatNumber(num) {
  if (num === null || num === undefined) return '0';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 格式化大数字（如：10000 -> 1万）
 * @param {number} num - 数字
 * @returns {string} 格式化后的字符串
 */
function formatBigNumber(num) {
  if (num === null || num === undefined) return '0';
  
  const n = parseFloat(num);
  if (isNaN(n)) return '0';
  
  if (n >= 100000000) {
    return (n / 100000000).toFixed(1) + '亿';
  } else if (n >= 10000) {
    return (n / 10000).toFixed(1) + '万';
  } else {
    return n.toString();
  }
}

// ==================== 字符串处理 ====================

/**
 * 隐藏手机号中间4位
 * @param {string} phone - 手机号
 * @returns {string} 隐藏后的手机号
 */
function hidePhone(phone) {
  if (!phone) return '';
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
}

/**
 * 隐藏身份证号部分信息
 * @param {string} idCard - 身份证号
 * @returns {string} 隐藏后的身份证号
 */
function hideIdCard(idCard) {
  if (!idCard) return '';
  return idCard.replace(/(\d{6})\d{8}(\d{4})/, '$1********$2');
}

/**
 * 截断文本并添加省略号
 * @param {string} text - 文本
 * @param {number} maxLength - 最大长度
 * @returns {string} 截断后的文本
 */
function ellipsis(text, maxLength = 20) {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

// ==================== 验证函数 ====================

/**
 * 验证手机号
 * @param {string} phone - 手机号
 * @returns {boolean} 是否有效
 */
function isValidPhone(phone) {
  return /^1[3-9]\d{9}$/.test(phone);
}

/**
 * 验证邮箱
 * @param {string} email - 邮箱
 * @returns {boolean} 是否有效
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * 验证身份证号
 * @param {string} idCard - 身份证号
 * @returns {boolean} 是否有效
 */
function isValidIdCard(idCard) {
  return /^[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/.test(idCard);
}

// ==================== 对象数组处理 ====================

/**
 * 深拷贝对象
 * @param {any} obj - 要拷贝的对象
 * @returns {any} 拷贝后的对象
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  
  if (obj instanceof Date) return new Date(obj);
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  
  const clonedObj = {};
  for (let key in obj) {
    if (obj.hasOwnProperty(key)) {
      clonedObj[key] = deepClone(obj[key]);
    }
  }
  return clonedObj;
}

/**
 * 数组去重
 * @param {Array} arr - 数组
 * @param {string} key - 如果是对象数组，指定去重的键
 * @returns {Array} 去重后的数组
 */
function uniqueArray(arr, key) {
  if (!Array.isArray(arr)) return [];
  
  if (key) {
    const seen = new Set();
    return arr.filter(item => {
      const val = item[key];
      if (seen.has(val)) {
        return false;
      }
      seen.add(val);
      return true;
    });
  }
  
  return [...new Set(arr)];
}

/**
 * 按字段分组
 * @param {Array} arr - 数组
 * @param {string} key - 分组的键
 * @returns {Object} 分组后的对象
 */
function groupBy(arr, key) {
  if (!Array.isArray(arr)) return {};
  
  return arr.reduce((result, item) => {
    const groupKey = item[key];
    if (!result[groupKey]) {
      result[groupKey] = [];
    }
    result[groupKey].push(item);
    return result;
  }, {});
}

// ==================== URL 处理 ====================

/**
 * 构建绝对URL
 * @param {string} url - 相对或绝对URL
 * @param {string} baseUrl - 基础URL，默认从config/api.js获取
 * @returns {string} 绝对URL
 */
function buildAbsoluteUrl(url, baseUrl) {
  if (!url) return '';
  if (/^data:image\//i.test(url)) return url;
  if (/^https?:\/\//i.test(url)) return url;
  
  // 如果没有提供baseUrl，尝试从config获取
  if (!baseUrl) {
    try {
      const { API_BASE_URL } = require('../config/api.js');
      baseUrl = API_BASE_URL;
    } catch (e) {
      console.warn('[util] 无法获取API_BASE_URL，使用空字符串');
      baseUrl = '';
    }
  }
  
  return `${baseUrl}${url.startsWith('/') ? url : `/${url}`}`;
}

/**
 * 构建优化后的图片URL（自动压缩）
 * @param {string} url - 图片URL
 * @param {object} options - 压缩选项
 * @param {number} options.width - 目标宽度
 * @param {number} options.height - 目标高度
 * @param {number} options.quality - 图片质量 (1-100)，默认 80
 * @param {string} options.format - 输出格式 (webp, jpeg, png)，默认 webp
 * @param {string} options.type - 预设类型 (thumbnail, list, detail, banner)
 * @returns {string} 优化后的图片URL
 * 
 * @example
 * buildOptimizedImageUrl('/uploads/products/1/image.jpg', { type: 'list' })
 * buildOptimizedImageUrl('/uploads/products/1/image.jpg', { width: 800, quality: 85 })
 */
function buildOptimizedImageUrl(url, options = {}) {
  if (!url) return '';
  
  // 如果是base64，直接返回
  if (/^data:image\//i.test(url)) {
    return url;
  }

  // 私有桶 COS 直链会 403，小程序需经后端 cos-url 换签名链接再加载
  if (/^https:\/\/[^/]+\.cos\.[^/]+\.myqcloud\.com\//.test(url)) {
    let apiBase = '';
    try {
      const { API_BASE_URL } = require('../config/api.js');
      apiBase = API_BASE_URL || '';
    } catch (e) {
      apiBase = '';
    }
    return apiBase ? `${apiBase.replace(/\/$/, '')}/api/storage/cos-url?url=${encodeURIComponent(url)}` : url;
  }
  
  // 如果是完整URL，需要先提取路径部分
  let imagePath = url;
  let baseUrl = '';
  
  if (/^https?:\/\//i.test(url)) {
    // 小程序运行时不保证存在全局 URL 构造器，这里用轻量解析替代
    // 期望：baseUrl = protocol + '//' + host；imagePath = path + query（保留原 query，便于后续继续拼接参数）
    const match = url.match(/^(https?:)\/\/([^\/?#]+)([^#]*)/i);
    if (match) {
      baseUrl = `${match[1]}//${match[2]}`;
      imagePath = match[3] || '/';
    } else {
      // 兜底：当作相对路径处理
      imagePath = url;
    }
  } else {
    // 相对路径，需要转换为绝对URL
    imagePath = url;
  }

  // 预设配置
  const presets = {
    thumbnail: { width: 200, quality: 75, format: 'webp' },      // 缩略图
    list: { width: 400, quality: 80, format: 'webp' },           // 列表图
    detail: { width: 800, quality: 85, format: 'webp' },         // 详情图
    banner: { width: 1920, quality: 92, format: null } // 横幅（高质量，保持原格式，不限制高度）
  };

  // 如果指定了type，使用预设
  if (options.type && presets[options.type]) {
    options = { ...presets[options.type], ...options };
  }

  // 默认值
  const {
    width = null,
    height = null,
    quality = 80,
    format = 'webp'
  } = options;

  // 构建查询参数
  const params = [];
  if (width) params.push(`w=${width}`);
  if (height) params.push(`h=${height}`);
  if (quality !== 80) params.push(`q=${quality}`);
  // 只有当format明确指定且不是原格式时才添加
  if (format && format !== 'jpeg' && format !== 'jpg' && format !== 'png') {
    params.push(`f=${format}`);
  }

  // 如果有压缩参数，添加到路径
  if (params.length > 0) {
    const separator = imagePath.includes('?') ? '&' : '?';
    imagePath = `${imagePath}${separator}${params.join('&')}`;
  }

  // 如果已经有baseUrl，直接拼接；否则使用buildAbsoluteUrl
  if (baseUrl) {
    return `${baseUrl}${imagePath.startsWith('/') ? imagePath : `/${imagePath}`}`;
  } else {
    return buildAbsoluteUrl(imagePath);
  }
}

/**
 * 媒体（视频/图片）URL：若是私有桶 COS 直链则返回后端 cos-url 代理地址，否则返回原 URL
 * 小程序端用此加载 COS 视频或非图片优化场景的 COS 图，避免 403
 */
function buildCosProxyUrlIfNeeded(url) {
  if (!url || typeof url !== 'string') return url || '';
  if (/^data:/.test(url)) return url;
  if (!/^https:\/\/[^/]+\.cos\.[^/]+\.myqcloud\.com\//.test(url)) return url;
  let apiBase = '';
  try {
    const { API_BASE_URL } = require('../config/api.js');
    apiBase = API_BASE_URL || '';
  } catch (e) {
    apiBase = '';
  }
  return apiBase ? `${apiBase.replace(/\/$/, '')}/api/storage/cos-url?url=${encodeURIComponent(url)}` : url;
}

/**
 * 解析 URL 参数
 * @param {string} url - URL 字符串
 * @returns {Object} 参数对象
 */
function parseUrlParams(url) {
  const params = {};
  const queryString = url.split('?')[1];
  
  if (!queryString) return params;
  
  queryString.split('&').forEach(param => {
    const [key, value] = param.split('=');
    params[decodeURIComponent(key)] = decodeURIComponent(value || '');
  });
  
  return params;
}

/**
 * 构建 URL 参数字符串
 * @param {Object} params - 参数对象
 * @returns {string} URL 参数字符串
 */
function buildUrlParams(params) {
  if (!params || typeof params !== 'object') return '';
  
  return Object.keys(params)
    .filter(key => params[key] !== undefined && params[key] !== null)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
}

// ==================== 存储处理 ====================

/**
 * 存储数据（带过期时间）
 * @param {string} key - 键
 * @param {any} value - 值
 * @param {number} expire - 过期时间（秒），0 表示永久
 */
function setStorage(key, value, expire = 0) {
  const data = {
    value: value,
    expire: expire > 0 ? Date.now() + expire * 1000 : 0
  };
  wx.setStorageSync(key, JSON.stringify(data));
}

/**
 * 获取存储的数据
 * @param {string} key - 键
 * @returns {any} 值，如果过期返回 null
 */
function getStorage(key) {
  try {
    const dataStr = wx.getStorageSync(key);
    if (!dataStr) return null;
    
    const data = JSON.parse(dataStr);
    
    // 检查是否过期
    if (data.expire > 0 && Date.now() > data.expire) {
      wx.removeStorageSync(key);
      return null;
    }
    
    return data.value;
  } catch (e) {
    return null;
  }
}

// ==================== 防抖节流 ====================

/**
 * 防抖函数
 * @param {Function} func - 要执行的函数
 * @param {number} wait - 等待时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
function debounce(func, wait = 500) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      func.apply(this, args);
    }, wait);
  };
}

/**
 * 节流函数
 * @param {Function} func - 要执行的函数
 * @param {number} wait - 等待时间（毫秒）
 * @returns {Function} 节流后的函数
 */
function throttle(func, wait = 500) {
  let lastTime = 0;
  return function(...args) {
    const now = Date.now();
    if (now - lastTime >= wait) {
      func.apply(this, args);
      lastTime = now;
    }
  };
}

// ==================== 图片处理 ====================

/**
 * 获取图片信息
 * @param {string} src - 图片路径
 * @returns {Promise<Object>} 图片信息
 */
function getImageInfo(src) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src: src,
      success: resolve,
      fail: reject
    });
  });
}

/**
 * 压缩图片
 * @param {string} src - 图片路径
 * @param {number} quality - 压缩质量 0-100
 * @returns {Promise<string>} 压缩后的图片路径
 */
function compressImage(src, quality = 80) {
  return new Promise((resolve, reject) => {
    wx.compressImage({
      src: src,
      quality: quality,
      success: (res) => resolve(res.tempFilePath),
      fail: reject
    });
  });
}

// ==================== 其他工具 ====================

/**
 * 复制到剪贴板
 * @param {string} text - 要复制的文本
 * @returns {Promise<void>}
 */
function copyToClipboard(text) {
  return new Promise((resolve, reject) => {
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({
          title: '复制成功',
          icon: 'success'
        });
        resolve();
      },
      fail: reject
    });
  });
}

/**
 * 拨打电话
 * @param {string} phoneNumber - 电话号码
 */
function makePhoneCall(phoneNumber) {
  wx.makePhoneCall({
    phoneNumber: phoneNumber,
    fail: (err) => {
      console.error('拨打电话失败:', err);
      wx.showToast({
        title: '拨打失败',
        icon: 'none'
      });
    }
  });
}

/**
 * 预览图片
 * @param {Array<string>} urls - 图片链接数组
 * @param {number} current - 当前显示图片的索引
 */
function previewImage(urls, current = 0) {
  wx.previewImage({
    urls: urls,
    current: urls[current]
  });
}

/**
 * 显示加载提示
 * @param {string} title - 提示文本
 */
function showLoading(title = '加载中...') {
  wx.showLoading({
    title: title,
    mask: true
  });
}

/**
 * 隐藏加载提示
 */
function hideLoading() {
  wx.hideLoading();
}

/**
 * 显示成功提示
 * @param {string} title - 提示文本
 * @param {number} duration - 持续时间
 */
function showSuccess(title, duration = 2000) {
  wx.showToast({
    title: title,
    icon: 'success',
    duration: duration
  });
}

/**
 * 显示错误提示
 * @param {string} title - 提示文本
 * @param {number} duration - 持续时间
 */
function showError(title, duration = 2000) {
  wx.showToast({
    title: title,
    icon: 'none',
    duration: duration
  });
}

// ==================== 导出 ====================

module.exports = {
  // 日期时间
  formatTime,
  getTimeAgo,
  
  // 数字
  formatMoney,
  formatNumber,
  formatBigNumber,
  
  // 字符串
  hidePhone,
  hideIdCard,
  ellipsis,
  
  // 验证
  isValidPhone,
  isValidEmail,
  isValidIdCard,
  
  // 对象数组
  deepClone,
  uniqueArray,
  groupBy,
  
  // URL
  buildAbsoluteUrl,
  buildOptimizedImageUrl,
  buildCosProxyUrlIfNeeded,
  parseUrlParams,
  buildUrlParams,
  
  // 存储
  setStorage,
  getStorage,
  
  // 防抖节流
  debounce,
  throttle,
  
  // 图片
  getImageInfo,
  compressImage,
  
  // 其他
  copyToClipboard,
  makePhoneCall,
  previewImage,
  showLoading,
  hideLoading,
  showSuccess,
  showError
};

