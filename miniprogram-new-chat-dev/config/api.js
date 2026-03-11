/**
 * API 配置文件（从主项目复制，保持与现有后端一致）
 * 注意：改动只影响客服开发专用小程序，不影响正式小程序工程。
 */

// ==================== 环境配置 ====================

// 开发环境（本地测试）
const DEV_BASE_URL = 'http://jp-2.frp.one:20262';

// 生产环境（云托管公网域名）
const PROD_BASE_URL = 'https://express-1tth-223108-8-1373039464.sh.run.tcloudbase.com';

// 当前环境
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
  BASE_URL: API_BASE_URL,
  AUTH: {
    LOGIN: '/api/auth/miniapp-login',
  },
  PRODUCT: {
    LIST: '/api/miniapp/products',
    DETAIL: '/api/miniapp/products/:id/detail',
    DETAIL_IMAGES: '/api/miniapp/products/:id/detail-images',
    SKU_IMAGES: '/api/miniapp/products/:id/sku-images',
    CALCULATE_PRICE: '/api/miniapp/products/calculate-price',
    SEARCH: '/api/miniapp/products/search',
    RECOMMENDED: '/api/miniapp/products/recommended',
    SKU_DETAIL: '/api/miniapp/products/:productId/skus',
  },
  BANNER: {
    PUBLIC: '/api/banners/public/:position',
  },
  CATEGORY: {
    LIST: '/api/miniapp/categories',
  },
  ORDER: {
    CREATE: '/api/miniapp/orders',
    LIST: '/api/miniapp/orders',
    DETAIL: '/api/miniapp/orders/:id',
    UPDATE_STATUS: '/api/miniapp/orders/:id/status',
    REQUEST_RETURN: '/api/miniapp/orders/:id/return',
    RETURN_LOGISTICS: '/api/miniapp/orders/:id/return-logistics',
    REQUEST_REFUND: '/api/miniapp/orders/:id/refund',
    STATS: '/api/miniapp/orders/stats',
    UPLOAD_AFTER_SALES_IMAGE: '/api/miniapp/after-sales/upload-image',
  },
  PAYMENT: {
    WECHAT_CREATE: '/api/payment/wechat/create',
    WECHAT_QUERY: '/api/payment/wechat/query/:orderId',
    WECHAT_CLOSE: '/api/payment/wechat/close/:orderId',
  },
  MEMBER: {
    CREATE: '/api/miniapp/members',
    PROFILE: '/api/miniapp/members/profile',
    LEVEL_CARD: '/api/miniapp/members/level-card',
    UPDATE_PROFILE: '/api/miniapp/members/profile',
    TEAM: '/api/miniapp/members/team',
    STATS: '/api/miniapp/members/stats',
    VERIFY_REFERRAL: '/api/miniapp/members/verify-referral',
  },
  COMMISSION: {
    LIST: '/api/miniapp/commissions',
    STATS: '/api/miniapp/commissions/stats',
  },
  COUPON: {
    MY_LIST: '/api/miniapp/coupons/my',
    CLAIMABLE: '/api/miniapp/coupons/claimable',
    AVAILABLE: '/api/miniapp/coupons/available',
    RECEIVE: '/api/miniapp/coupons/:id/receive',
  },
  STORE: {
    LIST: '/api/miniapp/stores',
  },
  ADDRESS: {
    LIST: '/api/miniapp/addresses',
    CREATE: '/api/miniapp/addresses',
    UPDATE: '/api/miniapp/addresses/:id',
    DELETE: '/api/miniapp/addresses/:id',
    SET_DEFAULT: '/api/miniapp/addresses/:id/default',
  },
  WITHDRAWAL: {
    CREATE: '/api/miniapp/withdrawals',
    LIST: '/api/miniapp/withdrawals',
    DETAIL: '/api/miniapp/withdrawals/:id',
    CANCEL: '/api/miniapp/withdrawals/:id/cancel',
  },
  POINT: {
    BALANCE: '/api/miniapp/points/balance',
    HISTORY: '/api/miniapp/points/history',
    PRODUCTS: '/api/miniapp/points/products',
    EXCHANGE: '/api/miniapp/points/exchange',
  },
  ARTICLE: {
    LIST: '/api/miniapp/articles',
    DETAIL: '/api/miniapp/articles/:id',
    INCREMENT_READ: '/api/miniapp/articles/:id/read',
  },
  VERIFICATION: {
    LIST: '/api/miniapp/verification-codes',
    DETAIL: '/api/miniapp/verification-codes/:id',
    QUERY: '/api/miniapp/verification-codes/code/:code',
  },
  CHAT: {
    WS_TOKEN: '/api/miniapp/chat/ws-token',
    CONVERSATIONS: '/api/miniapp/chat/conversations',
    CREATE_CONV: '/api/miniapp/chat/conversations',
    BY_VERIFICATION: '/api/miniapp/chat/conversations/by-verification-code',
    MESSAGES: '/api/miniapp/chat/conversations/:id/messages',
    READ: '/api/miniapp/chat/conversations/:id/read',
    UPLOAD_IMAGE: '/api/miniapp/chat/upload-image',
  },
  STAFF: {
    LOGIN: '/api/staff/login',
    PRODUCTS: '/api/staff/products',
    UPDATE_STOCK: '/api/staff/skus/:id/stock',
    ORDERS: '/api/staff/orders',
    SHIP_ORDER: '/api/staff/orders/:id/ship',
    VERIFICATION_QUERY: '/api/staff/verification-codes/:code',
    VERIFICATION_USE: '/api/staff/verification-codes/:id/use',
    CHAT_QUEUE: '/api/staff/chat/queue',
    CHAT_CONVERSATIONS: '/api/staff/chat/conversations',
    CHAT_ACCEPT: '/api/staff/chat/conversations/:id/accept',
    CHAT_END: '/api/staff/chat/conversations/:id/end',
    CHAT_MESSAGES: '/api/staff/chat/conversations/:id/messages',
    CHAT_READ: '/api/staff/chat/conversations/:id/read',
    CHAT_QUICK_REPLIES: '/api/staff/chat/quick-replies',
  },
};

// URL 参数替换工具
function replaceUrlParams(url, params = {}) {
  let result = url;
  Object.keys(params).forEach(key => {
    result = result.replace(`:${key}`, params[key]);
  });
  return result;
}

module.exports = {
  API_BASE_URL,
  API,
  replaceUrlParams,
  ENV,
  ENV_INFO,
  isDevelopment: () => ENV_INFO.isDevelopment,
  isProduction: () => ENV_INFO.isProduction,
};

