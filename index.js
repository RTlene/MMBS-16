const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const bcrypt = require('bcryptjs');
const session = require('express-session');
const { init: initDB, User } = require("./db");
const userRoutes = require('./routes/user-routes');
const authRoutes = require('./routes/auth-routes');
const categoryRoutes = require('./routes/category-routes');
const productRoutes = require('./routes/product-routes');
const skuRoutes = require('./routes/sku-routes');
const productFilesRoutes = require('./routes/product-files-routes');
const memberLevelRoutes = require('./routes/member-level-routes');
const distributorLevelRoutes = require('./routes/distributor-level-routes');
const teamExpansionLevelRoutes = require('./routes/team-expansion-level-routes');
const memberRoutes = require('./routes/member-routes');
const orderRoutes = require('./routes/order-routes');
const returnRequestRoutes = require('./routes/return-request-routes');
const refundRecordRoutes = require('./routes/refund-record-routes');
const withdrawalRoutes = require('./routes/withdrawal-routes');
const commissionRoutes = require('./routes/commission-routes');
const pointMallRoutes = require('./routes/point-mall-routes');
const promotionRoutes = require('./routes/promotion-routes');
const luckyDrawRoutes = require('./routes/lucky-draw-routes');
const bannerRoutes = require('./routes/banner-routes');
const popupRoutes = require('./routes/popup-routes');
const pointSettingsRoutes = require('./routes/point-settings-routes');
const compressRoutes = require('./routes/compress-routes');
const dashboardRoutes = require('./routes/dashboard-routes');
// 引入小程序认证中间件
const { miniappLogin, authenticateMiniappUser, optionalAuthenticate } = require('./middleware/miniapp-auth');
// 引入小程序路由
const miniappProductRoutes = require('./routes/miniapp-product-routes');
const miniappOrderRoutes = require('./routes/miniapp-order-routes');
const miniappMemberRoutes = require('./routes/miniapp-member-routes');
const miniappAddressRoutes = require('./routes/miniapp-address-routes');
const miniappWithdrawalRoutes = require('./routes/miniapp-withdrawal-routes');
const miniappCommissionRoutes = require('./routes/miniapp-commission-routes');
const miniappCouponRoutes = require('./routes/miniapp-coupon-routes');
const miniappArticleRoutes = require('./routes/miniapp-article-routes');
const miniappVerificationRoutes = require('./routes/miniapp-verification-routes');
const staffRoutes = require('./routes/staff-routes');

const logger = morgan("tiny");

const app = express();
app.use(express.urlencoded({ extended: false, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));
app.use(cors());
app.use(logger);

// Configure session
app.use(session({
  secret: process.env.JWT_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// 图片服务中间件（放在静态文件服务之前，优先处理图片请求）
const imageService = require('./middleware/imageService');
app.use(imageService);

app.use(express.static(path.join(__dirname, 'public')));

// Add authentication routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', require('./middleware/auth').authenticateToken, dashboardRoutes);

// Protect user management API with authentication middleware
app.use('/api/users', require('./middleware/auth').authenticateToken, userRoutes);
// 添加分类管理路由
app.use('/api/categories', require('./middleware/auth').authenticateToken, categoryRoutes);
// 添加商品管理路由
app.use('/api/products', require('./middleware/auth').authenticateToken, productRoutes);
// 添加SKU管理路由
app.use('/api/skus', require('./middleware/auth').authenticateToken, skuRoutes);
// 添加商品文件管理路由
app.use('/api/product-files', require('./middleware/auth').authenticateToken, productFilesRoutes);
// 云托管存储：file_id 换临时链接（供 H5 展示 cloud://，可不鉴权以便 img src 直接请求）
app.use('/api/storage', require('./routes/storage-routes'));
// 添加会员等级管理路由
app.use('/api/member-levels', require('./middleware/auth').authenticateToken, memberLevelRoutes);
// 添加分销等级管理路由
app.use('/api/distributor-levels', require('./middleware/auth').authenticateToken, distributorLevelRoutes);
// 添加团队拓展等级管理路由
app.use('/api/team-expansion-levels', require('./middleware/auth').authenticateToken, teamExpansionLevelRoutes);
// 添加会员管理路由
app.use('/api/members', require('./middleware/auth').authenticateToken, memberRoutes);
// 添加订单管理路由
app.use('/api/orders', require('./middleware/auth').authenticateToken, orderRoutes);
// 添加退货管理路由
app.use('/api/return-requests', require('./middleware/auth').authenticateToken, returnRequestRoutes);
// 添加退款管理路由
app.use('/api/refund-records', require('./middleware/auth').authenticateToken, refundRecordRoutes);
// 添加佣金提现管理路由（后台）
app.use('/api/withdrawals', require('./middleware/auth').authenticateToken, withdrawalRoutes);
// 添加佣金管理路由（计算记录、确认/取消、统计、团队拓展激励）
app.use('/api/commission', require('./middleware/auth').authenticateToken, commissionRoutes);
// 添加积分商城管理路由
app.use('/api/point-mall', require('./middleware/auth').authenticateToken, pointMallRoutes);
// 添加促销活动管理路由
app.use('/api/promotions', require('./middleware/auth').authenticateToken, promotionRoutes);
// 添加抽奖活动管理路由
app.use('/api/lucky-draws', require('./middleware/auth').authenticateToken, luckyDrawRoutes);
// 添加横幅管理路由（内部在各自路由上控制权限）
app.use('/api/banners', bannerRoutes);
// 添加弹窗管理路由
app.use('/api/popups', require('./middleware/auth').authenticateToken, popupRoutes);
// 添加资讯/文章管理路由（后台）
const articleRoutes = require('./routes/article-routes');
app.use('/api/articles', require('./middleware/auth').authenticateToken, articleRoutes);
// 添加积分设置管理路由
app.use('/api/point-settings', require('./middleware/auth').authenticateToken, pointSettingsRoutes);
// 添加微信支付配置路由（含证书对象存储恢复）
const paymentConfigRoutes = require('./routes/payment-config-routes');
const ensureCertFromStorage = paymentConfigRoutes.ensureCertFromStorage;
app.use('/api/payment-config', require('./middleware/auth').authenticateToken, paymentConfigRoutes);
// 添加图片压缩管理路由
app.use('/api/compress', compressRoutes);
// 系统设置（通用设置、活跃会员检测等）
const settingsRoutes = require('./routes/settings-routes');
app.use('/api/settings', require('./middleware/auth').authenticateToken, settingsRoutes);


// ==================== 小程序相关路由 ====================
// 小程序登录接口（无需认证）
app.post('/api/auth/miniapp-login', miniappLogin);
// 小程序商品API（无需认证）
app.use('/api/miniapp', miniappProductRoutes);
// 小程序订单API（需要小程序用户认证）
app.use('/api/miniapp', miniappOrderRoutes);
// 小程序会员API（部分需要小程序用户认证）
app.use('/api/miniapp', miniappMemberRoutes);
// 小程序地址API
app.use('/api/miniapp', miniappAddressRoutes);
// 小程序提现API
app.use('/api/miniapp', miniappWithdrawalRoutes);
// 小程序佣金明细API
app.use('/api/miniapp', miniappCommissionRoutes);
// 小程序优惠券API
app.use('/api/miniapp', miniappCouponRoutes);
// 小程序文章API
app.use('/api/miniapp', miniappArticleRoutes);
// 小程序核销码API
app.use('/api/miniapp', miniappVerificationRoutes);
// 支付相关API
const paymentRoutes = require('./routes/payment-routes');
app.use('/api/payment', paymentRoutes);
// 员工管理API（小程序端）
app.use('/api', staffRoutes);
// 健康检查接口（用于云托管健康检查）
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// 获取本机公网出口 IP（用于商户平台配置：微信支付-商家转账-接口安全-IP 白名单等）
app.get('/api/outbound-ip', (req, res) => {
  const axios = require('axios');
  const urls = ['https://api.ipify.org?format=json', 'https://ifconfig.me/ip'];
  let index = 0;
  function tryNext() {
    const url = urls[index];
    axios.get(url, { timeout: 5000 })
      .then((r) => {
        const ip = r.data && (typeof r.data === 'string' ? r.data.trim() : r.data.ip);
        if (ip) {
          return res.json({ code: 0, outboundIp: ip, message: '当前服务出口 IP，可用于商户平台 IP 白名单配置' });
        }
        tryNext();
      })
      .catch(() => {
        index++;
        if (index < urls.length) tryNext();
        else res.status(502).json({ code: 1, message: '无法获取出口 IP' });
      });
  }
  tryNext();
});

// 就绪检查：数据库初始化完成后返回 200；否则返回 503（不建议作为存活探针）
app.get('/ready', (req, res) => {
  if (dbReady) {
    return res.json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  }
  return res.status(503).json({
    status: 'not_ready',
    timestamp: new Date().toISOString(),
    dbError: dbInitError ? dbInitError.message : null
  });
});

console.log('小程序登录路由已注册: POST /api/auth/miniapp-login');
console.log('健康检查路由已注册: GET /health');
console.log('就绪检查路由已注册: GET /ready');

// Homepage
app.get("/", async (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// 云托管默认探针检查 80 端口，未设置 PORT 时使用 80；本地开发可在 .env 中设置 PORT=3000
const port = process.env.PORT || 80;
const fs = require('fs');
const startupAt = Date.now();
let dbReady = false;
let dbInitError = null;

const configStore = require('./services/configStore');

function startActiveMemberCheckInterval() {
  const activeMemberCheckService = require('./services/activeMemberCheckService');
  const cfg = activeMemberCheckService.getConfig();
  if (cfg.simpleMode) return;
  function scheduleNext() {
    const c = activeMemberCheckService.getConfig();
    if (c.simpleMode) return;
    const hours = c.intervalHours || 24;
    const ms = Math.max(3600000, hours * 60 * 60 * 1000);
    setTimeout(() => {
      activeMemberCheckService.runActiveMemberCheck()
        .catch(e => console.error('[活跃检测] 执行失败:', e.message))
        .finally(scheduleNext);
    }, ms);
  }
  setTimeout(() => {
    activeMemberCheckService.runActiveMemberCheck()
      .catch(e => console.error('[活跃检测] 首次执行失败:', e.message))
      .finally(scheduleNext);
  }, 60 * 1000);
}

/** 启动时从配置文件恢复微信支付相关环境变量，避免每次部署后需重新在后台配置 */
function loadPaymentConfigIntoEnv() {
  const configPath = path.join(__dirname, 'config', 'wechat-payment-config.json');
  if (!fs.existsSync(configPath)) return;
  try {
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const map = {
      wxAppId: 'WX_APPID',
      wxMchId: 'WX_MCHID',
      wxPayKey: 'WX_PAY_KEY',
      wxApiV3Key: 'WX_PAY_API_V3_KEY',
      wxCertSerialNo: 'WX_PAY_CERT_SERIAL_NO',
      wxNotifyUrl: 'WX_PAY_NOTIFY_URL',
      baseUrl: 'BASE_URL',
      certPath: 'WX_PAY_CERT_PATH',
      keyPath: 'WX_PAY_KEY_PATH'
    };
    for (const [key, envKey] of Object.entries(map)) {
      const v = data[key];
      if (v != null && String(v).trim() !== '') process.env[envKey] = String(v).trim();
    }
    // 沙箱模式：若环境变量已设置（如 docker-compose WX_PAY_SANDBOX=true），则不覆盖，便于强制启用沙箱
    if (process.env.WX_PAY_SANDBOX === undefined || process.env.WX_PAY_SANDBOX === '') {
      if (data.sandbox === true || data.sandbox === 'true') process.env.WX_PAY_SANDBOX = 'true';
      else if (data.sandbox === false || data.sandbox === 'false') process.env.WX_PAY_SANDBOX = 'false';
    }
    console.log('[Startup] 已从 config/wechat-payment-config.json 恢复微信支付配置');
  } catch (e) {
    console.warn('[Startup] 读取微信支付配置失败:', e.message);
  }
}

async function bootstrap() {
  // 优先从统一配置存储（对象存储加密 / 本地）加载，并同步 payment 到本地文件供后续使用
  try {
    const configData = await configStore.read();
    configStore._cache = configData;
    const payment = configStore.getSection('payment');
    if (payment && Object.keys(payment).length > 0) {
      const configPath = path.join(__dirname, 'config', 'wechat-payment-config.json');
      const configDir = path.dirname(configPath);
      if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(payment, null, 2), 'utf8');
    }
  } catch (e) {
    console.warn('[Startup] 加载统一配置失败:', e.message);
    configStore._cache = {};
  }
  loadPaymentConfigIntoEnv();
  if (typeof ensureCertFromStorage === 'function') {
    try {
      await ensureCertFromStorage();
      const wechatPayService = require('./services/wechatPayService');
      if (wechatPayService && typeof wechatPayService.refreshFromEnv === 'function') {
        wechatPayService.refreshFromEnv();
        console.log('[Startup] 已刷新微信支付证书（从对象存储恢复后）');
      }
    } catch (e) {
      console.warn('[Startup] 从对象存储恢复证书失败:', e.message);
    }
  }
  // 先启动 HTTP 服务（保证云托管存活/就绪探针通过），再在后台初始化数据库
  app.listen(port, () => {
    console.log(`[Startup] HTTP 已监听端口 ${port}，耗时 ${Date.now() - startupAt}ms`);
  });
  const dbStartAt = Date.now();
  initDB().then(() => {
    dbReady = true;
    console.log(`[DB] 初始化完成，耗时 ${Date.now() - dbStartAt}ms`);
    startActiveMemberCheckInterval();
  }).catch((err) => {
    dbInitError = err;
    console.error("[DB] 初始化失败，服务已启动但数据库暂不可用:", err.message);
  });
}

bootstrap();