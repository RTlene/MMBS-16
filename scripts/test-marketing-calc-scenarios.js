/**
 * 营销计算场景测试：创建商品/促销/优惠券（脚本内固定数值），在四种条件下算价并比对预期
 *
 * 脚本内固定数值：
 * - 商品单价 100 元，数量 1 → 原价 100
 * - 促销：满 100 减 10（full_reduction）
 * - 优惠券：固定减 10 元，满 50 可用
 *
 * 四种场景与预期：
 * 1) 无促销、无优惠券 → 预期实付 100
 * 2) 有促销、无优惠券 → 预期实付 90
 * 3) 无促销、有优惠券 → 预期实付 90
 * 4) 有促销、有优惠券 → 预期实付 80（促销与券叠加）
 *
 * 运行：node scripts/test-marketing-calc-scenarios.js
 * 环境变量：
 *   BASE_URL、ADMIN_USERNAME、ADMIN_PASSWORD、MEMBER_ID（可选）
 *   USE_EXISTING=1 且同时设置 PRODUCT_ID、SKU_ID、PROMOTION_ID、COUPON_ID 时，不创建新数据，直接使用已有 ID 跑算价（避免重复创建）
 */
require('dotenv').config();
const axios = require('axios');

const BASE_URL = (process.env.BASE_URL || 'https://express-1tth-223108-8-1373039464.sh.run.tcloudbase.com/').replace(/\/$/, '');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const MEMBER_ID_ENV = process.env.MEMBER_ID != null && process.env.MEMBER_ID !== '' ? parseInt(process.env.MEMBER_ID, 10) : null;

const USE_EXISTING = process.env.USE_EXISTING === '1';
const EXISTING_PRODUCT_ID = process.env.PRODUCT_ID != null && process.env.PRODUCT_ID !== '' ? parseInt(process.env.PRODUCT_ID, 10) : null;
const EXISTING_SKU_ID = process.env.SKU_ID != null && process.env.SKU_ID !== '' ? parseInt(process.env.SKU_ID, 10) : null;
const EXISTING_PROMOTION_ID = process.env.PROMOTION_ID != null && process.env.PROMOTION_ID !== '' ? parseInt(process.env.PROMOTION_ID, 10) : null;
const EXISTING_COUPON_ID = process.env.COUPON_ID != null && process.env.COUPON_ID !== '' ? parseInt(process.env.COUPON_ID, 10) : null;
const USE_EXISTING_IDS = USE_EXISTING && EXISTING_PRODUCT_ID && EXISTING_SKU_ID && EXISTING_PROMOTION_ID && EXISTING_COUPON_ID;

// ---------- 脚本内固定数值（可改） ----------
const PRODUCT_PRICE = 100;
const QUANTITY = 1;
const PROMO_FULL_REDUCTION = { minAmount: 100, discountAmount: 10 };
const COUPON_DISCOUNT = 10;
const COUPON_MIN_ORDER = 50;

const EXPECTED = {
  noPromoNoCoupon: 100,
  promoNoCoupon: 90,
  noPromoCoupon: 90,
  promoCoupon: 80
};

let token = null;
let memberId = null;
let productId = null;
let skuId = null;
let promotionId = null;
let couponId = null;

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

async function login() {
  const r = await req('POST', '/api/auth/login', { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
  if (r.status !== 200 || r.data?.code !== 0 || !r.data?.data?.token) {
    throw new Error('管理端登录失败: ' + (r.data?.message || r.status));
  }
  token = r.data.data.token;
}

async function ensureMember() {
  if (Number.isInteger(MEMBER_ID_ENV) && MEMBER_ID_ENV > 0) {
    memberId = MEMBER_ID_ENV;
    return;
  }
  const r = await req('GET', '/api/members?page=1&limit=1');
  if (r.status !== 200 || r.data?.code !== 0 || !r.data?.data?.members?.length) {
    throw new Error('无可用会员，请先创建会员或设置 MEMBER_ID');
  }
  memberId = r.data.data.members[0].id;
}

async function createProduct() {
  const r = await req('POST', '/api/products', {
    name: '[场景测试] 单价' + PRODUCT_PRICE + '元',
    status: 'active',
    skus: [
      {
        sku: 'SCENARIO-SKU-' + Date.now(),
        name: '默认规格',
        price: PRODUCT_PRICE,
        stock: 999
      }
    ]
  });
  if (r.status !== 200 || r.data?.code !== 0) {
    throw new Error('创建商品失败: ' + (r.data?.message || r.status));
  }
  const product = r.data.data;
  productId = product.id;
  skuId = product.skus && product.skus[0] ? product.skus[0].id : null;
  console.log('[创建] 商品 id=', productId, ' skuId=', skuId, ' 单价=', PRODUCT_PRICE);
}

async function createPromotion() {
  const now = new Date();
  const end = new Date(now);
  end.setMonth(end.getMonth() + 1);
  const r = await req('POST', '/api/promotions', {
    name: '[场景测试] 满' + PROMO_FULL_REDUCTION.minAmount + '减' + PROMO_FULL_REDUCTION.discountAmount,
    type: 'full_reduction',
    description: '脚本场景测试',
    startTime: iso(now),
    endTime: iso(end),
    status: 'active',
    rules: {
      fullReductionRules: [
        {
          conditionType: 'amount',
          minAmount: PROMO_FULL_REDUCTION.minAmount,
          discountAmount: PROMO_FULL_REDUCTION.discountAmount
        }
      ]
    }
  });
  if (r.status !== 200 || r.data?.code !== 0) {
    throw new Error('创建促销失败: ' + (r.data?.message || r.status));
  }
  promotionId = r.data.data.id;
  console.log('[创建] 促销 id=', promotionId, ' 满', PROMO_FULL_REDUCTION.minAmount, '减', PROMO_FULL_REDUCTION.discountAmount);
}

async function createCoupon() {
  const now = new Date();
  const end = new Date(now);
  end.setMonth(end.getMonth() + 1);
  const code = 'SCENARIO_' + Date.now();
  const r = await req('POST', '/api/coupons', {
    name: '[场景测试] ' + COUPON_DISCOUNT + '元券',
    code,
    type: 'cash',
    discountType: 'fixed',
    value: COUPON_DISCOUNT,
    discountValue: COUPON_DISCOUNT,
    minOrderAmount: COUPON_MIN_ORDER,
    totalCount: 100,
    validFrom: iso(now),
    validTo: iso(end),
    status: 'active',
    description: '脚本场景测试'
  });
  if (r.status !== 200 || r.data?.code !== 0) {
    throw new Error('创建优惠券失败: ' + (r.data?.message || r.status));
  }
  couponId = r.data.data.id;
  console.log('[创建] 优惠券 id=', couponId, ' 减', COUPON_DISCOUNT, ' 满', COUPON_MIN_ORDER, '可用');
}

const DEBUG_CALC = process.env.DEBUG_CALC === '1';

async function calculatePrice(appliedCoupons, appliedPromotions) {
  const path = '/api/miniapp/products/calculate-price' + (DEBUG_CALC ? '?debug=1' : '');
  const r = await req('POST', path, {
    productId,
    skuId: skuId || undefined,
    quantity: QUANTITY,
    memberId,
    appliedCoupons: appliedCoupons || [],
    appliedPromotions: appliedPromotions || [],
    pointUsage: null
  });
  if (r.status !== 200 || r.data?.code !== 0) {
    return { ok: false, error: r.data?.message || r.data?.error || r.status };
  }
  const pricing = r.data?.data?.pricing;
  if (!pricing) return { ok: false, error: '无 pricing' };
  return {
    ok: true,
    originalAmount: parseFloat(pricing.originalAmount),
    finalPrice: parseFloat(pricing.finalPrice),
    savings: parseFloat(pricing.savings) || 0,
    discounts: pricing.discounts || []
  };
}

function assertScenario(name, result, expectedFinal) {
  if (!result.ok) {
    console.log('[FAIL]', name, '—', result.error);
    return false;
  }
  const diff = Math.abs(result.finalPrice - expectedFinal);
  const pass = diff < 0.02;
  console.log(
    pass ? '[OK]' : '[FAIL]',
    name,
    '— 预期实付',
    expectedFinal,
    '实际',
    result.finalPrice.toFixed(2),
    result.discounts.length ? ' 优惠: ' + JSON.stringify(result.discounts) : ''
  );
  return pass;
}

async function run() {
  console.log('\n========== 营销计算场景测试（固定数值 + 四条件 + 预期比对） ==========\n');
  console.log('BASE_URL:', BASE_URL);
  console.log('脚本内数值: 商品单价', PRODUCT_PRICE, ' 数量', QUANTITY, ' 促销满', PROMO_FULL_REDUCTION.minAmount, '减', PROMO_FULL_REDUCTION.discountAmount, ' 券减', COUPON_DISCOUNT, ' 券门槛', COUPON_MIN_ORDER);
  console.log('预期: 无促销无券=', EXPECTED.noPromoNoCoupon, ' 仅促销=', EXPECTED.promoNoCoupon, ' 仅券=', EXPECTED.noPromoCoupon, ' 促销+券=', EXPECTED.promoCoupon);
  console.log('');

  try {
    await login();
    await ensureMember();
    if (USE_EXISTING_IDS) {
      productId = EXISTING_PRODUCT_ID;
      skuId = EXISTING_SKU_ID;
      promotionId = EXISTING_PROMOTION_ID;
      couponId = EXISTING_COUPON_ID;
      console.log('[复用] 使用已有 ID: productId=', productId, 'skuId=', skuId, 'promotionId=', promotionId, 'couponId=', couponId);
    } else {
      await createProduct();
      await createPromotion();
      await createCoupon();
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  const r1 = await calculatePrice([], []);
  if (assertScenario('1) 无促销、无优惠券', r1, EXPECTED.noPromoNoCoupon)) passed++; else failed++;

  const r2 = await calculatePrice([], [promotionId]);
  if (assertScenario('2) 有促销、无优惠券', r2, EXPECTED.promoNoCoupon)) passed++; else failed++;

  const r3 = await calculatePrice([couponId], []);
  if (assertScenario('3) 无促销、有优惠券', r3, EXPECTED.noPromoCoupon)) passed++; else failed++;

  const r4 = await calculatePrice([couponId], [promotionId]);
  if (assertScenario('4) 有促销、有优惠券', r4, EXPECTED.promoCoupon)) passed++; else failed++;

  console.log('\n========== 结果 ==========');
  console.log('通过:', passed, ' 失败:', failed);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
