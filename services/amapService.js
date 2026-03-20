/**
 * 高德地图 Web 服务 API（地理编码 / 逆地理编码）
 *
 * Web 服务（REST）Key 优先级：
 *   AMAP_WEB_SERVICE_KEY → 通用设置 amapWebServiceKey → AMAP_KEY → 通用设置 amapKey
 * 说明：仅勾选「Web端(JS API)」的 Key 调用 REST 会返回 USERKEY_PLAT_NOMATCH，需单独配置 Web 服务 Key
 *   或在控制台为 Key 同时勾选「Web服务」。
 */
const axios = require('axios');
const configStore = require('./configStore');

const BASE = 'https://restapi.amap.com/v3';

function getSys() {
    return configStore.getSection('system') || {};
}

/** 仅用于 geocode / regeo */
function getWebServiceKey() {
    const envDedicated = (process.env.AMAP_WEB_SERVICE_KEY || '').trim();
    if (envDedicated) return envDedicated;
    const sys = getSys();
    const cfgDedicated = String(sys.amapWebServiceKey || '').trim();
    if (cfgDedicated) return cfgDedicated;
    const envLegacy = (process.env.AMAP_KEY || '').trim();
    if (envLegacy) return envLegacy;
    return String(sys.amapKey || '').trim();
}

function formatAmapFailMessage(info, infocode) {
    const code = infocode != null ? String(infocode) : '';
    const i = info != null ? String(info) : '';
    if (i === 'USERKEY_PLAT_NOMATCH' || code === '10009') {
        return '高德 Key 与接口平台不匹配：地理编码需使用勾选「Web服务」的 Key。请在通用设置填写「Web 服务 Key」，或在同一 Key 上同时勾选「Web服务」与「Web端(JS API)」。';
    }
    if (i === 'INVALID_USER_KEY' || code === '10001') {
        return '高德 Key 无效或未开通对应服务，请检查控制台 Key 与服务权限。';
    }
    if (i === 'DAILY_QUERY_OVER_LIMIT' || code === '10044') {
        return '高德接口当日调用量已达上限。';
    }
    return i || '高德接口调用失败';
}

function getKey() {
    const key = getWebServiceKey();
    if (!key) {
        throw new Error('未配置高德 Web 服务 Key：请在「通用设置」填写「Web 服务 Key」，或设置环境变量 AMAP_WEB_SERVICE_KEY（亦可用同时支持 Web 服务的 AMAP_KEY）');
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
        throw new Error(formatAmapFailMessage(data.info, data.infocode));
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
        throw new Error(formatAmapFailMessage(data.info, data.infocode));
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
    getKeyConfigured: () => !!getWebServiceKey()
};
