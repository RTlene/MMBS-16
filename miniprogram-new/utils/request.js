/**
 * 网络请求封装
 * 统一处理请求、响应、错误
 */

const { API_BASE_URL, ENV_INFO, CLOUD_ENV, CLOUD_SERVICE_NAME } = require('../config/api.js');

// 生产环境降级到 wx.request 时只打一次提示
let _productionFallbackWarned = false;

// ==================== 请求配置 ====================

const DEFAULT_CONFIG = {
  timeout: 30000,        // 超时时间 30秒
  showLoading: true,     // 是否显示 loading
  showError: true,       // 是否自动显示错误提示
  needAuth: true,        // 是否需要认证
};

// ==================== 请求拦截器 ====================

/**
 * 请求前处理
 * @param {object} config - 请求配置
 * @returns {object} 处理后的配置
 */
function beforeRequest(config) {
  // 显示 loading
  if (config.showLoading) {
    wx.showLoading({
      title: '加载中...',
      mask: true
    });
  }
  
  // 添加认证信息
  if (config.needAuth) {
    // 优先使用员工token（如果是员工接口）
    const staffToken = wx.getStorageSync('staffToken');
    if (staffToken && config.isStaff) {
      config.header = {
        ...config.header,
        'Authorization': `Bearer ${staffToken}`
      };
    } else {
      // 普通会员认证
      const openid = wx.getStorageSync('openid');
      if (openid) {
        config.header = {
          ...config.header,
          'openid': openid
        };
      }
    }
  }
  
  // 添加通用 header
  config.header = {
    'Content-Type': 'application/json',
    'x-wx-source': 'miniprogram',
    ...config.header
  };
  
  return config;
}

/**
 * needAuth 请求前确保登录可用（首次进入/缓存失效场景）
 * @param {object} config
 */
async function ensureAuthReady(config) {
  if (!config || !config.needAuth) return;
  const openid = wx.getStorageSync('openid');
  if (openid) return;
  try {
    const auth = require('./auth.js');
    const ok = await auth.ensureLogin();
    if (!ok) {
      throw new Error('自动登录失败');
    }
  } catch (e) {
    throw {
      message: (e && e.message) || '请先登录',
      code: 401
    };
  }
}

/**
 * 响应后处理
 * @param {object} response - 响应数据
 * @param {object} config - 请求配置
 * @returns {Promise} 处理后的响应
 */
function afterResponse(response, config) {
  // 隐藏 loading
  if (config.showLoading) {
    wx.hideLoading();
  }
  
  const { statusCode, data, header } = response;
  
  console.log(`[Request] afterResponse 开始处理: statusCode=${statusCode}`);
  console.log(`[Request] 响应数据类型: ${typeof data}, 是否为null: ${data === null}, 是否为undefined: ${data === undefined}`);
  console.log(`[Request] 响应头:`, header);
  
  // 检查响应数据是否为空
  if (data === null || data === undefined) {
    console.error('[Request] ⚠️ 响应数据为空！', {
      statusCode,
      header,
      responseKeys: Object.keys(response || {})
    });
    return Promise.reject({
      message: '服务器返回数据为空，可能是响应体过大导致传输失败',
      code: statusCode,
      data: null
    });
  }
  
  // 检查响应数据大小
  try {
    const dataSize = JSON.stringify(data).length;
    console.log(`[Request] 响应数据大小: ${dataSize} 字符 (${(dataSize / 1024).toFixed(2)} KB)`);
    if (dataSize > 2 * 1024 * 1024) {
      console.warn(`[Request] ⚠️ 响应数据过大: ${(dataSize / 1024 / 1024).toFixed(2)} MB，可能导致传输超时`);
    }
  } catch (e) {
    console.warn('[Request] 无法计算响应数据大小:', e);
  }
  
  // HTTP 状态码检查
  if (statusCode >= 200 && statusCode < 300) {
    console.log(`[Request] HTTP状态码正常: ${statusCode}`);
    
    // 业务状态码检查
    if (data.success === false || (data.code !== undefined && data.code !== 0)) {
      console.error('[Request] 业务状态码错误:', {
        code: data.code,
        message: data.message,
        data: data
      });
      return Promise.reject({
        message: data.message || data.errMsg || '请求失败',
        code: data.code,
        data: data
      });
    }
    
    console.log(`[Request] ✅ 响应处理成功，返回数据`);
    return Promise.resolve(data);
  } else if (statusCode === 401) {
    // 未认证，清除登录信息
    wx.removeStorageSync('openid');
    wx.removeStorageSync('memberId');
    
    return Promise.reject({
      message: '请先登录',
      code: 401
    });
  } else if (statusCode === 403) {
    return Promise.reject({
      message: '无权限访问',
      code: 403
    });
  } else if (statusCode === 404) {
    return Promise.reject({
      message: '请求的资源不存在',
      code: 404
    });
  } else if (statusCode >= 500) {
    return Promise.reject({
      message: '服务器错误',
      code: statusCode
    });
  } else {
    return Promise.reject({
      message: data.message || '请求失败',
      code: statusCode
    });
  }
}

/**
 * 错误处理
 * @param {object} error - 错误对象
 * @param {object} config - 请求配置
 */
function handleError(error, config) {
  // 隐藏 loading
  if (config.showLoading) {
    wx.hideLoading();
  }
  
  // 显示错误提示
  if (config.showError) {
    wx.showToast({
      title: error.message || '网络请求失败',
      icon: 'none',
      duration: 2000
    });
  }
  
  // 打印错误日志
  console.error('Request Error:', error);
  
  return Promise.reject(error);
}

// ==================== 云托管 callContainer（生产环境，无需配置 request 合法域名） ====================

function requestWithCallContainer(url, config) {
  let path = url.indexOf('/') === 0 ? url : '/' + url;
  const method = (config.method || 'GET').toUpperCase();
  const header = {
    'X-WX-SERVICE': CLOUD_SERVICE_NAME,
    ...(config.header || {})
  };
  const data = config.data || {};

  // GET 请求将 data 转为 query 拼到 path（与 wx.request 行为一致）
  if (method === 'GET' && data && Object.keys(data).length > 0) {
    const query = Object.keys(data)
      .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(data[k]))
      .join('&');
    path += (path.indexOf('?') === -1 ? '?' : '&') + query;
  }

  return new Promise((resolve, reject) => {
    const requestStartTime = Date.now();
    console.log(`[Request] callContainer: ${method} ${path}`);

    wx.cloud.callContainer({
      config: { env: CLOUD_ENV },
      path: path,
      method: method,
      header: header,
      data: method === 'GET' ? undefined : data,
      success: (res) => {
        const requestDuration = Date.now() - requestStartTime;
        console.log(`[Request] callContainer 成功: ${path}, 耗时=${requestDuration}ms, statusCode=${res.statusCode}`);
        // callContainer 返回格式与 wx.request 类似：{ statusCode, header, data }
        afterResponse(res, config).then(resolve).catch(reject);
      },
      fail: (err) => {
        const requestDuration = Date.now() - requestStartTime;
        console.error(`[Request] callContainer 失败: ${path}, 耗时=${requestDuration}ms`, err);
        if (config.showLoading) wx.hideLoading();
        const msg = (err.errMsg || err.message || '网络请求失败').replace(/^request:fail\s*/i, '');
        if (config.showError) wx.showToast({ title: msg, icon: 'none', duration: 2000 });
        reject({ message: msg, error: err });
      }
    });
  });
}

// ==================== 核心请求方法 ====================

/**
 * 通用请求方法
 * @param {string} url - 请求地址（如 /api/miniapp/orders 或带 query 的路径）
 * @param {object} options - 请求选项
 * @returns {Promise} 请求结果
 */
function request(url, options = {}) {
  return (async () => {
    const fullUrl = API_BASE_URL + url;
    const retryAuth = !!options.__retryAuth;
    const config = {
      ...DEFAULT_CONFIG,
      ...options,
      url: fullUrl,
      method: options.method || 'GET',
      data: options.data || {},
    };
    delete config.__retryAuth;

    await ensureAuthReady(config);
    const processedConfig = beforeRequest(config);

    const doRequest = () => {
      // 生产环境：优先用云托管 callContainer（无需配置 request 合法域名）
      if (ENV_INFO.isProduction) {
        if (typeof wx !== 'undefined' && wx.cloud) {
          wx.cloud.init({ env: CLOUD_ENV, traceUser: true });
        }
        if (wx.cloud && typeof wx.cloud.callContainer === 'function') {
          return requestWithCallContainer(url, processedConfig);
        }
        if (!_productionFallbackWarned) {
          _productionFallbackWarned = true;
          console.warn(
            '[Request] 生产环境未使用云托管：当前环境无 wx.cloud.callContainer。',
            '请确保：1) 在微信开发者工具中开通「云开发」并选择与云托管一致的环境（' + CLOUD_ENV + '）；',
            '2) 或使用真机预览/正式版。否则 wx.request 可能因未配置合法域名而失败。'
          );
        }
      }

      // 开发环境或降级：使用 wx.request
      if (ENV_INFO.isDevelopment && !fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
        console.warn('[Request] ⚠️ 开发环境URL格式可能不正确:', fullUrl);
      }

      return new Promise((resolve, reject) => {
        const requestConfig = {
          ...processedConfig,
          timeout: config.timeout || DEFAULT_CONFIG.timeout,
        };
        const requestStartTime = Date.now();
        console.log(`[Request] 开始请求: ${config.method} ${config.url}, timeout=${requestConfig.timeout}ms`);

        wx.request({
          ...requestConfig,
          success: (response) => {
            const requestDuration = Date.now() - requestStartTime;
            console.log(`[Request] 请求成功: ${config.method} ${config.url}, 耗时=${requestDuration}ms`);
            console.log(`[Request] 响应状态码: ${response.statusCode}`);
            afterResponse(response, config).then(resolve).catch(reject);
          },
          fail: (error) => {
            const requestDuration = Date.now() - requestStartTime;
            console.error(`[Request] 请求失败: ${config.method} ${config.url}, 耗时=${requestDuration}ms`, error);
            let errorMessage = '网络连接失败';
            if (error.errMsg) {
              if (error.errMsg.includes('timeout')) errorMessage = '请求超时，请检查网络连接';
              else if (error.errMsg.includes('fail')) errorMessage = '网络请求失败，请检查服务器是否运行';
              else if (error.errMsg.includes('abort')) errorMessage = '请求被取消';
              else errorMessage = `网络错误: ${error.errMsg}`;
            }
            handleError({ message: errorMessage, error: error }, config).catch(reject);
          }
        });
      });
    };

    try {
      return await doRequest();
    } catch (err) {
      const code = err && err.code;
      const msg = (err && err.message) || '';
      const shouldRelogin = config.needAuth && !retryAuth && (code === 401 || msg.includes('请先登录'));
      if (!shouldRelogin) throw err;

      try {
        wx.removeStorageSync('openid');
        wx.removeStorageSync('memberId');
      } catch (_) {}
      const auth = require('./auth.js');
      const ok = await auth.ensureLogin();
      if (!ok) throw err;
      return request(url, { ...options, __retryAuth: true });
    }
  })();
}

// ==================== 快捷方法 ====================

/**
 * GET 请求
 * @param {string} url - 请求地址
 * @param {object} data - 查询参数
 * @param {object} options - 其他选项
 * @returns {Promise} 请求结果
 */
function get(url, data = {}, options = {}) {
  // 将 data 转换为查询字符串
  const queryString = Object.keys(data)
    .filter(key => data[key] !== undefined && data[key] !== null)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`)
    .join('&');
  
  const fullUrl = queryString ? `${url}?${queryString}` : url;
  
  // 添加调试日志（可通过options.debug=false关闭）
  if (options.debug !== false) {
    console.log('[Request] GET请求:', {
      url: fullUrl,
      fullUrl: API_BASE_URL + fullUrl,
      data: data
    });
  }
  
  return request(fullUrl, {
    ...options,
    method: 'GET'
  });
}

/**
 * POST 请求
 * @param {string} url - 请求地址
 * @param {object} data - 请求数据
 * @param {object} options - 其他选项
 * @returns {Promise} 请求结果
 */
function post(url, data = {}, options = {}) {
  return request(url, {
    ...options,
    method: 'POST',
    data: data
  });
}

/**
 * PUT 请求
 * @param {string} url - 请求地址
 * @param {object} data - 请求数据
 * @param {object} options - 其他选项
 * @returns {Promise} 请求结果
 */
function put(url, data = {}, options = {}) {
  return request(url, {
    ...options,
    method: 'PUT',
    data: data
  });
}

/**
 * DELETE 请求
 * @param {string} url - 请求地址
 * @param {object} data - 请求数据
 * @param {object} options - 其他选项
 * @returns {Promise} 请求结果
 */
function del(url, data = {}, options = {}) {
  return request(url, {
    ...options,
    method: 'DELETE',
    data: data
  });
}

// ==================== 上传文件 ====================

/**
 * 上传文件
 * @param {string} url - 上传地址
 * @param {string} filePath - 本地文件路径
 * @param {object} formData - 额外的表单数据
 * @param {object} options - 其他选项
 * @returns {Promise} 上传结果
 */
function upload(url, filePath, formData = {}, options = {}) {
  const config = {
    ...DEFAULT_CONFIG,
    ...options
  };
  
  if (config.showLoading) {
    wx.showLoading({
      title: '上传中...',
      mask: true
    });
  }
  
  return new Promise((resolve, reject) => {
    const openid = wx.getStorageSync('openid');
    
    wx.uploadFile({
      url: API_BASE_URL + url,
      filePath: filePath,
      name: 'file',
      formData: formData,
      header: {
        'openid': openid,
        'x-wx-source': 'miniprogram'
      },
      success: (response) => {
        if (config.showLoading) {
          wx.hideLoading();
        }
        
        try {
          const data = JSON.parse(response.data);
          if (data.success !== false) {
            resolve(data);
          } else {
            reject({
              message: data.message || '上传失败',
              data: data
            });
          }
        } catch (e) {
          reject({
            message: '响应数据解析失败',
            error: e
          });
        }
      },
      fail: (error) => {
        if (config.showLoading) {
          wx.hideLoading();
        }
        
        if (config.showError) {
          wx.showToast({
            title: '上传失败',
            icon: 'none'
          });
        }
        
        reject({
          message: '上传失败',
          error: error
        });
      }
    });
  });
}

// ==================== 导出 ====================

module.exports = {
  request,
  get,
  post,
  put,
  del,
  upload
};

