/**
 * 与后端 utils/deliveryConstraint.js 逻辑一致（小程序端）
 */

const VALID = new Set(['express_only', 'pickup_only', 'both']);

function normalizeDeliveryConstraint(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (VALID.has(s)) return s;
  return 'both';
}

function allowedDeliveryTypesForProduct(constraint) {
  const c = normalizeDeliveryConstraint(constraint);
  if (c === 'express_only') return new Set(['delivery']);
  if (c === 'pickup_only') return new Set(['pickup']);
  return new Set(['delivery', 'pickup']);
}

function intersectDeliveryTypesForProducts(constraints) {
  const list = Array.isArray(constraints) ? constraints : [];
  if (list.length === 0) return new Set(['delivery', 'pickup']);
  let acc = null;
  for (const c of list) {
    const s = allowedDeliveryTypesForProduct(c);
    if (acc == null) acc = new Set(s);
    else acc = new Set([...acc].filter((x) => s.has(x)));
  }
  return acc || new Set();
}

/**
 * 根据待结算行项计算可选配送方式（每项需含 deliveryConstraint，缺省按 both）
 * @param {Array<{ deliveryConstraint?: string }>} items
 */
function computeCartDeliveryOptions(items) {
  const arr = Array.isArray(items) ? items : [];
  const constraints = arr.map((it) => normalizeDeliveryConstraint(it && it.deliveryConstraint));
  const allowed = intersectDeliveryTypesForProducts(constraints);
  if (allowed.size === 0) {
    return {
      ok: false,
      message: '所选商品配送方式不一致：部分商品仅支持快递，部分仅支持自提，请分开下单。',
      allowed: allowed,
      forcedDeliveryType: null,
      allowDelivery: false,
      allowPickup: false
    };
  }
  const allowDelivery = allowed.has('delivery');
  const allowPickup = allowed.has('pickup');
  let forcedDeliveryType = null;
  if (allowed.size === 1) {
    forcedDeliveryType = allowPickup ? 'pickup' : 'delivery';
  }
  return {
    ok: true,
    message: '',
    allowed,
    forcedDeliveryType,
    allowDelivery,
    allowPickup
  };
}

function deliveryConstraintLabel(constraint) {
  const c = normalizeDeliveryConstraint(constraint);
  if (c === 'express_only') return '仅支持快递配送';
  if (c === 'pickup_only') return '仅支持门店自提';
  return '快递或自提均可';
}

function orderDeliveryTypeLabel(deliveryType) {
  const t = String(deliveryType || '').toLowerCase();
  if (t === 'pickup') return '门店自提';
  return '快递配送';
}

module.exports = {
  normalizeDeliveryConstraint,
  allowedDeliveryTypesForProduct,
  intersectDeliveryTypesForProducts,
  computeCartDeliveryOptions,
  deliveryConstraintLabel,
  orderDeliveryTypeLabel
};
