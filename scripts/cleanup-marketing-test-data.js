/**
 * 清理由 test-marketing-calc-scenarios.js 创建的测试数据（名称含「场景测试」的商品、促销、优惠券）
 *
 * 运行：node scripts/cleanup-marketing-test-data.js
 * 环境变量：BASE_URL、ADMIN_USERNAME、ADMIN_PASSWORD（与场景测试脚本一致）
 */
require('dotenv').config();
const axios = require('axios');

const BASE_URL = (process.env.BASE_URL || 'https://express-1tth-223108-8-1373039464.sh.run.tcloudbase.com/').replace(/\/$/, '');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const SEARCH = '场景测试';
let token = null;

function req(method, url, data = null) {
  const conf = {
    method,
    url: url.startsWith('http') ? url : `${BASE_URL}${url}`,
    headers: { 'Content-Type': 'application/json' },
    validateStatus: () => true
  };
  if (token) conf.headers.Authorization = `Bearer ${token}`;
  if (data) conf.data = data;
  return axios(conf);
}

async function login() {
  const r = await req('POST', '/api/auth/login', { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
  if (r.status !== 200 || r.data?.code !== 0 || !r.data?.data?.token) {
    throw new Error('管理端登录失败: ' + (r.data?.message || r.status));
  }
  token = r.data.data.token;
}

async function run() {
  console.log('BASE_URL:', BASE_URL);
  console.log('清理名称包含「' + SEARCH + '」的测试数据…\n');

  await login();

  let deletedProducts = 0;
  let deletedPromotions = 0;
  let deletedCoupons = 0;

  // 商品（含 SKU 会随商品级联删除）
  const productsRes = await req('GET', `/api/products?search=${encodeURIComponent(SEARCH)}&limit=100`);
  if (productsRes.status === 200 && productsRes.data?.code === 0 && productsRes.data?.data?.products?.length) {
    const products = productsRes.data.data.products;
    for (const p of products) {
      const del = await req('DELETE', `/api/products/${p.id}`);
      if (del.status === 200 && del.data?.code === 0) {
        console.log('[删除] 商品 id=', p.id, p.name);
        deletedProducts++;
      } else {
        console.warn('[跳过] 商品 id=', p.id, del.data?.message || del.status);
      }
    }
  }

  // 促销
  const promotionsRes = await req('GET', `/api/promotions?search=${encodeURIComponent(SEARCH)}&limit=100`);
  if (promotionsRes.status === 200 && promotionsRes.data?.code === 0 && promotionsRes.data?.data?.promotions?.length) {
    const promotions = promotionsRes.data.data.promotions;
    for (const p of promotions) {
      const del = await req('DELETE', `/api/promotions/${p.id}`);
      if (del.status === 200 && del.data?.code === 0) {
        console.log('[删除] 促销 id=', p.id, p.name);
        deletedPromotions++;
      } else {
        console.warn('[跳过] 促销 id=', p.id, del.data?.message || del.status);
      }
    }
  }

  // 优惠券
  const couponsRes = await req('GET', `/api/coupons?search=${encodeURIComponent(SEARCH)}&limit=100`);
  if (couponsRes.status === 200 && couponsRes.data?.code === 0 && couponsRes.data?.data?.coupons?.length) {
    const coupons = couponsRes.data.data.coupons;
    for (const c of coupons) {
      const del = await req('DELETE', `/api/coupons/${c.id}`);
      if (del.status === 200 && del.data?.code === 0) {
        console.log('[删除] 优惠券 id=', c.id, c.name);
        deletedCoupons++;
      } else {
        console.warn('[跳过] 优惠券 id=', c.id, del.data?.message || del.status);
      }
    }
  }

  console.log('\n========== 清理结果 ==========');
  console.log('商品:', deletedProducts, ' 促销:', deletedPromotions, ' 优惠券:', deletedCoupons);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
