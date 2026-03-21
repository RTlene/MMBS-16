/**
 * 自提门店补全：Sequelize 可能未映射 orders 表中的门店列（列名 storeId / store_id），
 * 导致 toJSON() 无 storeId、无法 JOIN Store。此处用 describeTable 解析真实列名并 raw 读取。
 */
const { Store, sequelize } = require('../db');

let _storeIdColName = null;
let _storeIdColResolved = false;

async function getOrdersStoreIdColumnName() {
    if (_storeIdColResolved) return _storeIdColName;
    _storeIdColResolved = true;
    try {
        const desc = await sequelize.getQueryInterface().describeTable('orders');
        const key = Object.keys(desc || {}).find(
            (k) => k.toLowerCase().replace(/_/g, '') === 'storeid'
        );
        _storeIdColName = key || null;
    } catch (e) {
        _storeIdColName = null;
    }
    return _storeIdColName;
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
    getOrdersStoreIdColumnName,
    readStoreIdsForOrderIds,
    enrichPickupStoreOnOrderJson,
    enrichPickupStoresOnOrderJsonList
};
