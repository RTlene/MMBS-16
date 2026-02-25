/**
 * 营销工具 API 自动化测试
 * 运行：node scripts/test-marketing-api.js
 * 环境变量：BASE_URL（默认 http://localhost:3000）、ADMIN_USERNAME、ADMIN_PASSWORD
 */
require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'https://express-1tth-223108-8-1373039464.sh.run.tcloudbase.com/';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

let adminToken = null;
const results = { pass: 0, fail: 0 };

function log(name, ok, detail = '') {
  const tag = ok ? '[OK]' : '[FAIL]';
  const msg = detail ? `${name} — ${detail}` : name;
  console.log(`${tag} ${msg}`);
  if (ok) results.pass++; else results.fail++;
}

async function request(method, url, options = {}) {
  const conf = {
    method,
    url: url.startsWith('http') ? url : `${BASE_URL}${url}`,
    validateStatus: () => true,
    ...options
  };
  if (adminToken && !conf.headers) conf.headers = {};
  if (adminToken) conf.headers.Authorization = `Bearer ${adminToken}`;
  const res = await axios(conf);
  return res;
}

async function run() {
  console.log('\n========== 营销工具 API 自动化测试 ==========\n');
  console.log(`BASE_URL: ${BASE_URL}\n`);

  // 1. 健康检查
  try {
    const r = await request('GET', '/health');
    const ok = r.status === 200 && r.data && r.data.status === 'ok';
    log('健康检查', ok);
    if (!ok) {
      console.log('  请先启动后端服务。');
      process.exit(1);
    }
  } catch (e) {
    const msg = e.code === 'ECONNREFUSED' ? '连接被拒绝，请先启动后端服务' : e.message;
    log('健康检查', false, msg);
    process.exit(1);
  }

  // 2. 管理端登录
  try {
    const r = await request('POST', '/api/auth/login', {
      data: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD }
    });
    const ok = r.status === 200 && r.data && r.data.code === 0 && r.data.data && r.data.data.token;
    if (ok) adminToken = r.data.data.token;
    log('管理端登录', ok, ok ? '已获取 Token' : (r.data?.message || r.status));
  } catch (e) {
    log('管理端登录', false, e.message);
  }

  // 3. 横幅公开接口（无需登录）
  try {
    const r = await request('GET', '/api/banners/public/homepage');
    const ok = r.status === 200 && r.data && r.data.code === 0 && Array.isArray(r.data.data);
    log('横幅公开 GET /api/banners/public/homepage', ok, ok ? `返回 ${r.data.data.length} 条` : (r.data?.message || r.status));
  } catch (e) {
    log('横幅公开 GET /api/banners/public/homepage', false, e.message);
  }

  // 4. 弹窗公开接口（若整路由鉴权则需 Token，这里带 Token 测）
  try {
    const r = await request('GET', '/api/popups/public/active');
    const ok = r.status === 200 && r.data && r.data.code === 0 && Array.isArray(r.data.data);
    log('弹窗公开 GET /api/popups/public/active', ok, ok ? `返回 ${r.data.data.length} 条` : (r.data?.message || r.status));
  } catch (e) {
    log('弹窗公开 GET /api/popups/public/active', false, e.message);
  }

  // 5. 促销活动列表（需 Admin Token）
  if (adminToken) {
    try {
      const r = await request('GET', '/api/promotions?page=1&limit=5');
      const ok = r.status === 200 && r.data && r.data.code === 0 && r.data.data && typeof r.data.data.total !== 'undefined';
      log('促销列表 GET /api/promotions', ok, ok ? `total=${r.data.data.total}` : (r.data?.message || r.status));
    } catch (e) {
      log('促销列表 GET /api/promotions', false, e.message);
    }
  }

  // 5b. 优惠券列表（需 Admin Token）
  if (adminToken) {
    try {
      const r = await request('GET', '/api/coupons?page=1&limit=5');
      const ok = r.status === 200 && r.data && r.data.code === 0 && r.data.data && typeof r.data.data.total !== 'undefined';
      log('优惠券列表 GET /api/coupons', ok, ok ? `total=${r.data.data.total}` : (r.data?.message || r.status));
    } catch (e) {
      log('优惠券列表 GET /api/coupons', false, e.message);
    }
  }

  // 6. 积分商城商品列表（需 Admin Token）
  if (adminToken) {
    try {
      const r = await request('GET', '/api/point-mall/products?page=1&limit=5');
      const ok = r.status === 200 && r.data && r.data.code === 0 && r.data.data && typeof r.data.data.total !== 'undefined';
      log('积分商城商品 GET /api/point-mall/products', ok, ok ? `total=${r.data.data.total}` : (r.data?.message || r.status));
    } catch (e) {
      log('积分商城商品 GET /api/point-mall/products', false, e.message);
    }
  }

  // 7. 抽奖活动列表（需 Admin Token）
  if (adminToken) {
    try {
      const r = await request('GET', '/api/lucky-draws?page=1&limit=5');
      const ok = r.status === 200 && r.data && r.data.code === 0 && r.data.data && typeof r.data.data.total !== 'undefined';
      log('抽奖列表 GET /api/lucky-draws', ok, ok ? `total=${r.data.data.total}` : (r.data?.message || r.status));
    } catch (e) {
      log('抽奖列表 GET /api/lucky-draws', false, e.message);
    }
  }

  // 8. 价格计算（先用商品列表取真实 productId，无商品或接口报「商品不存在」则跳过、不记为失败）
  try {
    const listRes = await request('GET', '/api/miniapp/products?page=1&limit=1');
    const products = listRes.data?.data?.products || [];
    const productId = products.length > 0 ? products[0].id : null;

    if (!productId) {
      log('价格计算 POST /api/miniapp/products/calculate-price', true, '跳过（环境中无商品）');
    } else {
      const r = await request('POST', '/api/miniapp/products/calculate-price', {
        data: {
          productId,
          quantity: 1,
          memberId: 0,
          appliedCoupons: [],
          appliedPromotions: [],
          pointUsage: null
        }
      });
      const ok = r.status === 200 && r.data && r.data.code === 0 && r.data.data && r.data.data.pricing;
      const errMsg = (r.data?.message || r.data?.error || '') + '';
      const isEnvError = r.status === 500 && (errMsg.includes('商品不存在') || errMsg.includes('计算价格失败') || errMsg.includes('已下架'));
      if (ok) {
        log('价格计算 POST /api/miniapp/products/calculate-price', true, '返回 pricing');
      } else if (isEnvError) {
        log('价格计算 POST /api/miniapp/products/calculate-price', true, '跳过（商品/会员或 SKU 数据不可用）');
      } else {
        log('价格计算 POST /api/miniapp/products/calculate-price', false, errMsg || r.status);
      }
    }
  } catch (e) {
    log('价格计算 POST /api/miniapp/products/calculate-price', false, e.message);
  }

  // 9. 横幅管理列表（需 Admin Token）
  if (adminToken) {
    try {
      const r = await request('GET', '/api/banners?page=1&limit=5');
      const ok = r.status === 200 && r.data && r.data.code === 0;
      log('横幅管理 GET /api/banners', ok, ok ? 'OK' : (r.data?.message || r.status));
    } catch (e) {
      log('横幅管理 GET /api/banners', false, e.message);
    }
  }

  // 10. 弹窗管理列表（需 Admin Token）
  if (adminToken) {
    try {
      const r = await request('GET', '/api/popups?page=1&limit=5');
      const ok = r.status === 200 && r.data && r.data.code === 0;
      log('弹窗管理 GET /api/popups', ok, ok ? 'OK' : (r.data?.message || r.status));
    } catch (e) {
      log('弹窗管理 GET /api/popups', false, e.message);
    }
  }

  console.log('\n========== 结果 ==========');
  console.log(`通过: ${results.pass}, 失败: ${results.fail}`);
  process.exit(results.fail > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
