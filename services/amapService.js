/**
 * 高德地图 Web 服务 API（地理编码 / 逆地理编码）
 * Key 来源（优先级）：环境变量 AMAP_KEY / AMAP_WEB_SERVICE_KEY → 通用设置 system.amapKey
 */
const axios = require('axios');
const configStore = require('./configStore');

const BASE = 'https://restapi.amap.com/v3';

function getKeyFromEnv() {
    return (process.env.AMAP_KEY || process.env.AMAP_WEB_SERVICE_KEY || '').trim();
}

function getKeyFromSettings() {
    const sys = configStore.getSection('system') || {};
    return String(sys.amapKey || '').trim();
}

function getKey() {
    const key = getKeyFromEnv() || getKeyFromSettings();
    if (!key) {
        throw new Error('未配置高德地图 Key：请在「通用设置」中填写，或设置环境变量 AMAP_KEY');
    }
    return key;
}

function normalizeCity(city) {
    if (city == null) return '';
    if (Array.isArray(city)) return city[0] ? String(city[0]) : '';
    return String(city);
}

/**
 * 组装「省市区」展示字段（与门店 region 字段一致）
 */
function buildRegion(province, city, district) {
    const p = province || '';
    const c = normalizeCity(city) || p;
    const d = district || '';
    const parts = [p, c, d].filter(Boolean);
    const out = [];
    for (const x of parts) {
        if (x && !out.includes(x)) out.push(x);
    }
    return out.join('');
}

/**
 * 逆地理编码：经纬度 → 地址
 * @param {number} lng
 * @param {number} lat
 */
async function reverseGeocode(lng, lat) {
    const key = getKey();
    const location = `${lng},${lat}`;
    const { data } = await axios.get(`${BASE}/geocode/regeo`, {
        params: {
            key,
            location,
            output: 'json',
            extensions: 'base',
            radius: 1000
        },
        timeout: 15000
    });
    if (String(data.status) !== '1') {
        throw new Error(data.info || '逆地理编码失败');
    }
    const re = data.regeocode || {};
    const ac = re.addressComponent || {};
    const province = ac.province || '';
    const cityRaw = normalizeCity(ac.city);
    const city = cityRaw || province;
    const district = ac.district || '';
    const formatted = re.formatted_address || '';

    return {
        formattedAddress: formatted,
        address: formatted,
        region: buildRegion(province, ac.city, district),
        province,
        city,
        district,
        lng,
        lat
    };
}

/**
 * 地理编码：地址 → 经纬度
 * @param {string} address
 */
async function geocode(address) {
    const key = getKey();
    const { data } = await axios.get(`${BASE}/geocode/geo`, {
        params: {
            key,
            address: String(address).trim(),
            output: 'json'
        },
        timeout: 15000
    });
    if (String(data.status) !== '1') {
        throw new Error(data.info || '地理编码失败');
    }
    const list = data.geocodes || [];
    if (!list.length) {
        throw new Error('未找到该地址对应的坐标，请尝试更完整的地址');
    }
    const g = list[0];
    const loc = (g.location || '').split(',');
    const glng = parseFloat(loc[0]);
    const glat = parseFloat(loc[1]);
    if (!Number.isFinite(glng) || !Number.isFinite(glat)) {
        throw new Error('地理编码返回坐标无效');
    }
    const province = g.province || '';
    const cityRaw = normalizeCity(g.city);
    const city = cityRaw || province;
    const district = g.district || '';
    const formatted = g.formatted_address || address;

    return {
        formattedAddress: formatted,
        address: formatted,
        region: buildRegion(province, g.city, district),
        province,
        city,
        district,
        lng: glng,
        lat: glat,
        level: g.level
    };
}

module.exports = {
    reverseGeocode,
    geocode,
    getKeyConfigured: () => !!(getKeyFromEnv() || getKeyFromSettings())
};
