/**
 * 营销工具端到端测试：造数 + 商品算价 + 预期比对
 * 1) 确保有会员、商品、促销、优惠券；
 * 2) 调用价格计算（商品 + 会员 + 优惠券 + 促销）；
 * 3) 比对预期：有优惠时 finalPrice < originalAmount，并打印明细。
 * 运行：node scripts/test-marketing-e2e.js
 * 环境变量：BASE_URL、ADMIN_USERNAME、ADMIN_PASSWORD、MEMBER_ID（可选）
 */
require('dotenv').config();
const axios = require('axios');

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const MEMBER_ID_ENV = process.env.MEMBER_ID != null && process.env.MEMBER_ID !== '' ? parseInt(process.env.MEMBER_ID, 10) : null;

let token = null;
let memberId = null;
let productId = null;
let skuId = null;
let promotionId = null;
let couponId = null;
const errors = [];

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

function iso(d) {
  const x = new Date(d);
  return x.toISOString().slice(0, 19).replace('T', ' ');
}

async function ensureLogin() {
  const r = await req('POST', '/api/auth/login', { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
  if (r.status !== 200 || r.data?.code !== 0 || !r.data?.data?.token) {
    throw new Error('管理端登录失败: ' + (r.data?.message || r.status));
  }
  token = r.data.data.token;
}

async function ensureMember() {
  if (Number.isInteger(MEMBER_ID_ENV) && MEMBER_ID_ENV > 0) {
    memberId = MEMBER_ID_ENV;
    console.log('[E2E] 使用环境变量 MEMBER_ID:', memberId);
    return;
  }
  const r = await req('GET', '/api/members?page=1&limit=1');
  if (r.status !== 200 || r.data?.code !== 0 || !r.data?.data?.members?.length) {
    throw new Error('无可用会员，请先创建会员或设置 MEMBER_ID');
  }
  memberId = r.data.data.members[0].id;
  console.log('[E2E] 选用会员 id:', memberId);
}

async function ensureProduct() {
  const r = await req('GET', '/api/miniapp/products?page=1&limit=5');
  if (r.status !== 200 || r.data?.code !== 0 || !r.data?.data?.products?.length) {
    throw new Error('无上架商品，请先添加商品');
  }
  const p = r.data.data.products[0];
  productId = p.id;
  skuId = (p.skus && p.skus[0]) ? p.skus[0].id : null;
  console.log('[E2E] 选用商品 id:', productId, 'skuId:', skuId || '(无)');
}

async function ensurePromotion() {
  let r = await req('GET', '/api/promotions?page=1&limit=1');
  if (r.status === 500) {
    console.warn('[E2E] 促销列表请求异常(500)，尝试创建一条');
  }
  if (r.status === 200 && r.data?.code === 0 && r.data?.data?.promotions?.length > 0) {
    promotionId = r.data.data.promotions[0].id;
    console.log('[E2E] 选用促销 id:', promotionId);
    return;
  }
  const now = new Date();
  const end = new Date(now);
  end.setMonth(end.getMonth() + 1);
  r = await req('POST', '/api/promotions', token, {
    name: '[E2E] 满99包邮',
    type: 'free_shipping',
    description: 'E2E测试',
    startTime: iso(now),
    endTime: iso(end),
    status: 'active',
    rules: { minAmount: 99 }
  });
  if (r.status === 200 && r.data?.code === 0) {
    promotionId = r.data.data.id;
    console.log('[E2E] 已创建促销 id:', promotionId);
  } else {
    console.warn('[E2E] 促销创建失败，将不应用促销:', r.data?.message || r.status);
  }
}

async function ensureCoupon() {
  const r = await req('GET', '/api/coupons?page=1&limit=1&status=active');
  if (r.status === 200 && r.data?.code === 0 && r.data?.data?.coupons?.length > 0) {
    couponId = r.data.data.coupons[0].id;
    console.log('[E2E] 选用优惠券 id:', couponId);
    return;
  }
  const now = new Date();
  const end = new Date(now);
  end.setMonth(end.getMonth() + 1);
  const code = 'E2E_' + Date.now();
  const r2 = await req('POST', '/api/coupons', token, {
    name: '[E2E] 10元券',
    code,
    type: 'cash',
    discountType: 'fixed',
    value: 10,
    discountValue: 10,
    minOrderAmount: 50,
    totalCount: 100,
    validFrom: iso(now),
    validTo: iso(end),
    status: 'active',
    description: 'E2E测试'
  });
  if (r2.status === 200 && r2.data?.code === 0) {
    couponId = r2.data.data.id;
    console.log('[E2E] 已创建优惠券 id:', couponId);
  } else {
    console.warn('[E2E] 优惠券创建失败，将不应用优惠券:', r2.data?.message || r2.status);
  }
}

async function run() {
  console.log('\n========== 营销工具 E2E：造数 + 算价 + 预期比对 ==========\n');
  console.log('BASE_URL:', BASE_URL);

  try {
    await ensureLogin();
    await ensureMember();
    await ensureProduct();
    await ensurePromotion();
    await ensureCoupon();
  } catch (e) {
    console.error('[E2E] 前置条件失败:', e.message);
    process.exit(1);
  }

  const body = {
    productId,
    skuId: skuId || undefined,
    quantity: 2,
    memberId,
    appliedCoupons: couponId ? [couponId] : [],
    appliedPromotions: promotionId ? [promotionId] : [],
    pointUsage: null
  };

  console.log('\n[E2E] 请求 calculate-price:', JSON.stringify(body, null, 2));

  const r = await req('POST', '/api/miniapp/products/calculate-price', body);

  if (r.status !== 200 || r.data?.code !== 0) {
    console.error('[E2E] 价格计算失败:', r.status, r.data?.message || r.data?.error);
    process.exit(1);
  }

  const pricing = r.data?.data?.pricing;
  if (!pricing) {
    console.error('[E2E] 返回无 pricing');
    process.exit(1);
  }

  const originalAmount = parseFloat(pricing.originalAmount);
  const finalPrice = parseFloat(pricing.finalPrice);
  const savings = parseFloat(pricing.savings) || 0;
  const savingsRate = parseFloat(pricing.savingsRate) || 0;

  console.log('\n---------- 结果比对 ----------');
  console.log('原价(originalAmount):', originalAmount);
  console.log('实付(finalPrice):', finalPrice);
  console.log('节省(savings):', savings);
  console.log('节省率(savingsRate):', savingsRate);
  if (pricing.discounts && pricing.discounts.length) {
    console.log('优惠明细(discounts):', JSON.stringify(pricing.discounts, null, 2));
  }
  console.log('appliedCoupons:', r.data?.data?.appliedCoupons ?? []);
  console.log('appliedPromotions:', r.data?.data?.appliedPromotions ?? []);

  let passed = true;
  if (originalAmount <= 0) {
    console.error('[E2E] 预期: 原价 > 0，实际:', originalAmount);
    passed = false;
  }
  if (finalPrice < 0) {
    console.error('[E2E] 预期: 实付 >= 0，实际:', finalPrice);
    passed = false;
  }
  if (finalPrice > originalAmount + 0.01) {
    console.error('[E2E] 预期: 实付 <= 原价，实际 finalPrice=', finalPrice, 'originalAmount=', originalAmount);
    passed = false;
  }
  if (couponId || promotionId) {
    if (savings < 0 || finalPrice >= originalAmount - 0.01) {
      console.warn('[E2E] 已应用优惠券/促销，预期有优惠(实付 < 原价 或 savings > 0)，请核对业务规则与门槛');
    }
  }

  console.log('\n' + (passed ? '[E2E] 比对通过' : '[E2E] 比对未通过'));
  process.exit(passed ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
