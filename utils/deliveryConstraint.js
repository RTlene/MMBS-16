/**
 * 商品配送限制：与订单 deliveryType（delivery / pickup）对齐
 * express_only → 仅快递；pickup_only → 仅自提；both → 均可
 */

const VALID = new Set(['express_only', 'pickup_only', 'both']);

function normalizeDeliveryConstraint(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (VALID.has(s)) return s;
  return 'both';
}

/** @returns {Set<'delivery'|'pickup'>} */
function allowedDeliveryTypesForProduct(constraint) {
  const c = normalizeDeliveryConstraint(constraint);
  if (c === 'express_only') return new Set(['delivery']);
  if (c === 'pickup_only') return new Set(['pickup']);
  return new Set(['delivery', 'pickup']);
}

/**
 * 多商品订单允许的 deliveryType 集合（交集）
 * @param {string[]} constraints - 各不重复商品的 deliveryConstraint
 * @returns {Set<'delivery'|'pickup'>}
 */
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
  deliveryConstraintLabel,
  orderDeliveryTypeLabel,
  VALID_CONSTRAINTS: [...VALID]
};
