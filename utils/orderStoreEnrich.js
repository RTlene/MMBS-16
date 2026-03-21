/**
 * 自提门店补全：Sequelize 可能未映射 orders 表中的门店列（列名 storeId / store_id），
 * 导致 toJSON() 无 storeId、无法 JOIN Store。此处用 describeTable 解析真实列名并 raw 读写。
 */
const { Store, sequelize } = require('../db');

let _ordersDescCache = null;

/** db 启动时 ALTER 增加列后需清空，否则会一直认为无 storeId 列 */
function invalidateOrdersTableDescCache() {
    _ordersDescCache = null;
}

async function getOrdersTableDesc() {
    if (!_ordersDescCache) {
        try {
            _ordersDescCache = await sequelize.getQueryInterface().describeTable('orders');
        } catch (e) {
            _ordersDescCache = {};
        }
    }
    return _ordersDescCache;
}

function findColumnKey(desc, logicalCompact) {
    return Object.keys(desc || {}).find((k) => k.toLowerCase().replace(/_/g, '') === logicalCompact);
}

async function getOrdersStoreIdColumnName() {
    const desc = await getOrdersTableDesc();
    return findColumnKey(desc, 'storeid') || null;
}

async function getOrdersDeliveryTypeColumnName() {
    const desc = await getOrdersTableDesc();
    return findColumnKey(desc, 'deliverytype') || null;
}

async function getOrdersShippingMethodColumnName() {
    const desc = await getOrdersTableDesc();
    return findColumnKey(desc, 'shippingmethod') || null;
}

/**
 * 创建订单后强制写入自提字段（避免 Sequelize 已移除属性/列名不一致导致 INSERT 未落库）
 */
async function persistMiniappOrderPickupFields(orderId, { storeId, isPickup }) {
    if (!orderId || !isPickup) return;
    const sid = parseInt(storeId, 10);
    const storeCol = await getOrdersStoreIdColumnName();
    const dtCol = await getOrdersDeliveryTypeColumnName();
    const smCol = await getOrdersShippingMethodColumnName();
    if (!storeCol && !dtCol && !smCol) {
        console.warn('[OrderStore] persist pickup skipped: orders 表无 storeId/deliveryType/shippingMethod 列');
        return;
    }
    if (storeCol && (!Number.isFinite(sid) || sid <= 0)) {
        console.warn('[OrderStore] persist pickup skipped: bad storeId', storeId);
        return;
    }
    const parts = [];
    const repl = { id: orderId };
    if (storeCol) {
        repl.sid = sid;
        parts.push(`\`${storeCol.replace(/`/g, '``')}\` = :sid`);
    }
    if (dtCol) {
        repl.dt = 'pickup';
        parts.push(`\`${dtCol.replace(/`/g, '``')}\` = :dt`);
    }
    if (smCol) {
        repl.pmsm = 'pickup';
        parts.push(`\`${smCol.replace(/`/g, '``')}\` = :pmsm`);
    }
    if (parts.length === 0) return;
    await sequelize.query(`UPDATE orders SET ${parts.join(', ')} WHERE id = :id`, { replacements: repl });
    console.log('[OrderStore] persist pickup fields OK', { orderId, storeCol, dtCol, smCol, sid });
}

/** 支付回调等场景：不依赖 Sequelize 模型是否含 deliveryType/storeId */
async function isPickupOrderByRaw(orderId) {
    if (!orderId) return false;
    const dtCol = await getOrdersDeliveryTypeColumnName();
    const storeCol = await getOrdersStoreIdColumnName();
    const smCol = await getOrdersShippingMethodColumnName();
    // 历史库可能仅有 shippingMethod（pickup/自提），无 deliveryType/storeId 列；此前会误判为非自提导致未同步微信发货
    if (!dtCol && !storeCol && !smCol) return false;
    const cols = ['id'];
    if (dtCol) cols.push(`\`${dtCol.replace(/`/g, '``')}\` AS dt`);
    if (storeCol) cols.push(`\`${storeCol.replace(/`/g, '``')}\` AS sid`);
    if (smCol) cols.push(`\`${smCol.replace(/`/g, '``')}\` AS sm`);
    const [rows] = await sequelize.query(`SELECT ${cols.join(', ')} FROM orders WHERE id = :id LIMIT 1`, {
        replacements: { id: orderId }
    });
    const r = rows && rows[0];
    if (!r) return false;
    if (String(r.dt || '').toLowerCase() === 'pickup') return true;
    if (r.sid != null && parseInt(r.sid, 10) > 0) return true;
    const sm = String(r.sm || '').trim();
    const sml = sm.toLowerCase();
    if (sml === 'pickup' || sm === '自提' || sml === 'store_pickup' || sml === 'store') return true;
    return false;
}

/**
 * @returns {Map<number, number>} orderId -> storeId
 */
async function readStoreIdsForOrderIds(orderIds) {
    const map = new Map();
    const ids = [...new Set((orderIds || []).filter((id) => id != null).map((id) => parseInt(id, 10)))].filter(
        (n) => Number.isFinite(n) && n > 0
    );
    if (!ids.length) return map;
    const col = await getOrdersStoreIdColumnName();
    if (!col) return map;
    const safeCol = col.replace(/`/g, '``');
    const ph = ids.map(() => '?').join(',');
    const [rows] = await sequelize.query(
        `SELECT id AS oid, \`${safeCol}\` AS sid FROM orders WHERE id IN (${ph})`,
        { replacements: ids }
    );
    for (const r of rows || []) {
        if (r.sid == null) continue;
        const sid = parseInt(r.sid, 10);
        if (Number.isFinite(sid) && sid > 0) map.set(parseInt(r.oid, 10), sid);
    }
    return map;
}

async function enrichPickupStoreOnOrderJson(orderJson) {
    if (!orderJson) return;
    let sid = orderJson.storeId != null ? parseInt(orderJson.storeId, 10) : NaN;
    if (!Number.isFinite(sid) || sid <= 0) {
        const m = await readStoreIdsForOrderIds([orderJson.id]);
        const fromDb = m.get(parseInt(orderJson.id, 10));
        if (fromDb) {
            sid = fromDb;
            orderJson.storeId = sid;
        }
    }
    if (!Number.isFinite(sid) || sid <= 0) return;
    if (orderJson.store && orderJson.store.id) return;
    const st = await Store.findByPk(sid);
    if (st) orderJson.store = st.toJSON();
}

async function enrichPickupStoresOnOrderJsonList(orderJsonList) {
    if (!Array.isArray(orderJsonList) || orderJsonList.length === 0) return;
    const missingId = [];
    for (const o of orderJsonList) {
        const sid = o.storeId != null ? parseInt(o.storeId, 10) : NaN;
        if ((!Number.isFinite(sid) || sid <= 0) && o.id) missingId.push(o.id);
    }
    const idToSid = await readStoreIdsForOrderIds(missingId);
    const ids = [
        ...new Set(
            orderJsonList
                .map((o) => {
                    let s = o.storeId != null ? parseInt(o.storeId, 10) : NaN;
                    if ((!Number.isFinite(s) || s <= 0) && o.id) {
                        const fromDb = idToSid.get(parseInt(o.id, 10));
                        if (fromDb) {
                            s = fromDb;
                            o.storeId = fromDb;
                        }
                    }
                    return s;
                })
                .filter((n) => Number.isFinite(n) && n > 0)
        )
    ];
    if (ids.length === 0) return;
    const stores = await Store.findAll({ where: { id: ids } });
    const smap = new Map(stores.map((s) => [s.id, s.toJSON()]));
    for (const o of orderJsonList) {
        const sid = o.storeId != null ? parseInt(o.storeId, 10) : NaN;
        if (!Number.isFinite(sid) || sid <= 0) continue;
        if (o.store && o.store.id) continue;
        const st = smap.get(sid);
        if (st) o.store = st;
    }
}

module.exports = {
    invalidateOrdersTableDescCache,
    getOrdersStoreIdColumnName,
    getOrdersDeliveryTypeColumnName,
    getOrdersShippingMethodColumnName,
    persistMiniappOrderPickupFields,
    isPickupOrderByRaw,
    readStoreIdsForOrderIds,
    enrichPickupStoreOnOrderJson,
    enrichPickupStoresOnOrderJsonList
};
