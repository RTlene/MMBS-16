/**
 * 营销测试数据种子脚本
 * 通过管理端 API 创建：1 条促销活动（包邮）、1 张优惠券。
 * 运行：node scripts/seed-marketing-test-data.js
 * 环境变量：BASE_URL、ADMIN_USERNAME、ADMIN_PASSWORD（同 test-marketing-api.js）
 */
require('dotenv').config();
const axios = require('axios');

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

async function request(method, url, token, data = null) {
  const config = {
    method,
    url: url.startsWith('http') ? url : `${BASE_URL}${url}`,
    headers: { 'Content-Type': 'application/json' },
    validateStatus: () => true
  };
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (data) config.data = data;
  return axios(config);
}

async function run() {
  console.log('[Seed] BASE_URL:', BASE_URL);
  let token = null;

  const rLogin = await request('POST', '/api/auth/login', null, {
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD
  });
  if (rLogin.status !== 200 || rLogin.data?.code !== 0 || !rLogin.data?.data?.token) {
    console.error('[Seed] 管理端登录失败:', rLogin.data?.message || rLogin.status);
    process.exit(1);
  }
  token = rLogin.data.data.token;
  console.log('[Seed] 管理端登录成功');

  const now = new Date();
  const nextMonth = new Date(now);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const iso = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

  // 1. 创建一条包邮促销（无商品依赖）
  const promoBody = {
    name: '[种子] 满99包邮',
    type: 'free_shipping',
    description: '营销测试数据，可删除',
    startTime: iso(now),
    endTime: iso(nextMonth),
    status: 'active',
    rules: { minAmount: 99 }
  };
  const rPromo = await request('POST', '/api/promotions', token, promoBody);
  if (rPromo.status === 200 && rPromo.data?.code === 0) {
    console.log('[Seed] 促销已创建:', rPromo.data.data?.name, 'id=', rPromo.data.data?.id);
  } else {
    console.warn('[Seed] 促销创建失败（可能已存在类似数据）:', rPromo.data?.message || rPromo.status);
  }

  // 2. 创建一张优惠券（代金券 10 元，满 50 可用）
  const code = 'SEED10_' + Date.now();
  const couponBody = {
    name: '[种子] 10元券',
    code,
    type: 'cash',
    discountType: 'fixed',
    value: 10,
    discountValue: 10,
    minOrderAmount: 50,
    totalCount: 100,
    validFrom: iso(now),
    validTo: iso(nextMonth),
    status: 'active',
    description: '营销测试数据，可删除'
  };
  const rCoupon = await request('POST', '/api/coupons', token, couponBody);
  if (rCoupon.status === 200 && rCoupon.data?.code === 0) {
    console.log('[Seed] 优惠券已创建:', rCoupon.data.data?.name, 'code=', code);
  } else {
    console.warn('[Seed] 优惠券创建失败:', rCoupon.data?.message || rCoupon.status);
  }

  console.log('[Seed] 完成。可运行 node scripts/test-marketing-api.js 做接口回归。');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
