/**
 * API 配置文件
 * 统一管理所有 API 地址
 * 
 * 使用说明：
 * 1. 本地测试：保持 ENV = 'development'，确保 DEV_BASE_URL 指向本地服务器
 * 2. 部署生产：将 ENV 改为 'production'，并配置 PROD_BASE_URL 为实际域名
 * 3. 自动检测：如果未设置 ENV，会根据编译模式自动判断（开发工具=development，真机=production）
 */

// ==================== 环境配置 ====================

// 开发环境（本地测试）
// 本地测试时，请确保后端服务正在运行，并修改为实际地址
// 例如：http://localhost:3000 或 http://你的内网IP:端口 1 http://jp-2.frp.one:20262
const DEV_BASE_URL = 'http://jp-2.frp.one:20262';

// 生产环境（云托管公网域名）
// 用作：1) 小程序请求服务器 2) 支付/回调等填写的完整地址 = PROD_BASE_URL + 路径（如 /api/payment/wechat/notify）
// 开发工具联调云托管：ENV 改为 'production'，并在微信公众平台将本域名加入「request合法域名」
const PROD_BASE_URL = 'https://express-1tth-223108-8-1373039464.sh.run.tcloudbase.com';

// ==================== 环境配置 ====================

// 当前环境（手动设置）
// 'production' - 使用云托管地址（开发工具、真机、发布均请求云托管）
// 'development' - 使用下方 DEV_BASE_URL（用于联调本地或 frp 后端）
const ENV = 'production';

// 根据环境选择 API 地址
const API_BASE_URL = (ENV === 'production' ? PROD_BASE_URL : DEV_BASE_URL);

// 环境信息（用于调试和日志）
const ENV_INFO = {
  env: ENV,
  apiBaseUrl: API_BASE_URL,
  isDevelopment: ENV === 'development',
  isProduction: ENV === 'production',
  devBaseUrl: DEV_BASE_URL,
  prodBaseUrl: PROD_BASE_URL
};

// ==================== API 端点配置 ====================

const API = {
  // 基础地址
  BASE_URL: API_BASE_URL,
  
  // 认证相关
  AUTH: {
    LOGIN: '/api/auth/miniapp-login',           // 小程序登录
  },
  
  // 商品相关
  PRODUCT: {
    LIST: '/api/miniapp/products',              // 商品列表
    DETAIL: '/api/miniapp/products/:id/detail', // 商品详情（含运营工具）
    DETAIL_IMAGES: '/api/miniapp/products/:id/detail-images', // 商品详情图（分段加载）
    SKU_IMAGES: '/api/miniapp/products/:id/sku-images', // SKU图片（分段加载）
    CALCULATE_PRICE: '/api/miniapp/products/calculate-price', // 计算价格
    SEARCH: '/api/miniapp/products/search',     // 搜索商品
    RECOMMENDED: '/api/miniapp/products/recommended', // 推荐商品
    SKU_DETAIL: '/api/miniapp/products/:productId/skus', // SKU详情
  },
  // 横幅相关
  BANNER: {
    PUBLIC: '/api/banners/public/:position',    // 指定位置的横幅
  },
  
  // 分类相关
  CATEGORY: {
    LIST: '/api/miniapp/categories',            // 分类列表
  },
  
  // 订单相关
  ORDER: {
    CREATE: '/api/miniapp/orders',              // 创建订单
    LIST: '/api/miniapp/orders',                // 订单列表
    DETAIL: '/api/miniapp/orders/:id',          // 订单详情
    UPDATE_STATUS: '/api/miniapp/orders/:id/status', // 更新订单状态
    REQUEST_RETURN: '/api/miniapp/orders/:id/return', // 申请退货
    RETURN_LOGISTICS: '/api/miniapp/orders/:id/return-logistics', // 提交退货物流
    REQUEST_REFUND: '/api/miniapp/orders/:id/refund', // 申请退款
    STATS: '/api/miniapp/orders/stats',         // 订单统计
    UPLOAD_AFTER_SALES_IMAGE: '/api/miniapp/after-sales/upload-image', // 售后凭证图上传（对象存储）
  },

  // 支付相关
  PAYMENT: {
    WECHAT_CREATE: '/api/payment/wechat/create', // 创建微信支付
    WECHAT_QUERY: '/api/payment/wechat/query/:orderId', // 查询支付状态
    WECHAT_CLOSE: '/api/payment/wechat/close/:orderId', // 关闭支付订单
  },
  
  // 会员相关
  MEMBER: {
    CREATE: '/api/miniapp/members',             // 创建会员（注册）
    PROFILE: '/api/miniapp/members/profile',    // 会员信息
    LEVEL_CARD: '/api/miniapp/members/level-card', // 等级卡片（会员等级+分销等级进度）
    UPDATE_PROFILE: '/api/miniapp/members/profile', // 更新会员信息
    TEAM: '/api/miniapp/members/team',          // 团队成员
    STATS: '/api/miniapp/members/stats',        // 会员统计
    VERIFY_REFERRAL: '/api/miniapp/members/verify-referral', // 验证推荐码
  },

  // 佣金明细相关
  COMMISSION: {
    LIST: '/api/miniapp/commissions',          // 佣金明细列表
    STATS: '/api/miniapp/commissions/stats',    // 佣金统计
  },
  
  // 优惠券相关
  COUPON: {
    MY_LIST: '/api/miniapp/coupons/my',         // 我的优惠券
    CLAIMABLE: '/api/miniapp/coupons/claimable', // 可领取的优惠券
    AVAILABLE: '/api/miniapp/coupons/available', // 可用优惠券
    RECEIVE: '/api/miniapp/coupons/:id/receive', // 领取优惠券
  },

  // 门店相关（自提）
  STORE: {
    LIST: '/api/miniapp/stores',
  },

  // 地址相关
  ADDRESS: {
    LIST: '/api/miniapp/addresses',               // 地址列表
    CREATE: '/api/miniapp/addresses',             // 新建地址
    UPDATE: '/api/miniapp/addresses/:id',         // 更新地址
    DELETE: '/api/miniapp/addresses/:id',         // 删除地址
    SET_DEFAULT: '/api/miniapp/addresses/:id/default', // 设为默认地址
  },

  // 提现相关
  WITHDRAWAL: {
    CREATE: '/api/miniapp/withdrawals',           // 创建提现申请
    LIST: '/api/miniapp/withdrawals',             // 提现申请列表
    DETAIL: '/api/miniapp/withdrawals/:id',       // 提现申请详情
    CANCEL: '/api/miniapp/withdrawals/:id/cancel', // 取消提现申请
  },
  
  // 积分相关
  POINT: {
    BALANCE: '/api/miniapp/points/balance',     // 积分余额
    HISTORY: '/api/miniapp/points/history',     // 积分历史
    PRODUCTS: '/api/miniapp/points/products',   // 积分商品
    EXCHANGE: '/api/miniapp/points/exchange',   // 积分兑换
  },

  // 文章相关
  ARTICLE: {
    LIST: '/api/miniapp/articles',              // 文章列表
    DETAIL: '/api/miniapp/articles/:id',        // 文章详情
    INCREMENT_READ: '/api/miniapp/articles/:id/read', // 增加阅读数
  },

  // 核销码相关
  VERIFICATION: {
    LIST: '/api/miniapp/verification-codes',    // 核销码列表
    DETAIL: '/api/miniapp/verification-codes/:id', // 核销码详情
    QUERY: '/api/miniapp/verification-codes/code/:code', // 根据核销码查询
  },

  // 员工管理相关
  STAFF: {
    LOGIN: '/api/staff/login',                    // 员工登录
    PRODUCTS: '/api/staff/products',             // 商品列表
    UPDATE_STOCK: '/api/staff/skus/:id/stock',   // 更新库存
    ORDERS: '/api/staff/orders',                 // 订单列表
    SHIP_ORDER: '/api/staff/orders/:id/ship',   // 订单发货
    VERIFICATION_QUERY: '/api/staff/verification-codes/:code', // 查询核销码
    VERIFICATION_USE: '/api/staff/verification-codes/:id/use', // 核销核销码
  },
};

// ==================== URL 参数替换工具 ====================

/**
 * 替换 URL 中的参数占位符
 * @param {string} url - 包含占位符的 URL，如 '/api/products/:id'
 * @param {object} params - 参数对象，如 { id: 1 }
 * @returns {string} 替换后的 URL
 * 
 * @example
 * replaceUrlParams('/api/products/:id', { id: 1 })
 * // 返回: '/api/products/1'
 */
function replaceUrlParams(url, params = {}) {
  let result = url;
  Object.keys(params).forEach(key => {
    result = result.replace(`:${key}`, params[key]);
  });
  return result;
}

// ==================== 导出 ====================

// ==================== 导出 ====================

module.exports = {
  API_BASE_URL,
  API,
  replaceUrlParams,
  ENV: ENV || detectEnvironment(),
  ENV_INFO,
  // 便捷方法
  isDevelopment: () => ENV_INFO.isDevelopment,
  isProduction: () => ENV_INFO.isProduction,
};

