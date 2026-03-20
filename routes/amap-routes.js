/**
 * 高德地图代理（后台登录后调用，Key 仅存服务端）
 */
const express = require('express');
const amapService = require('../services/amapService');
const configStore = require('../services/configStore');

const router = express.Router();

function resolveMapJsKey() {
    const env = (process.env.AMAP_KEY || process.env.AMAP_WEB_SERVICE_KEY || '').trim();
    if (env) return env;
    const sys = configStore.getSection('system') || {};
    return String(sys.amapKey || '').trim();
}

function resolveSecurityJsCode() {
    const env = (process.env.AMAP_SECURITY_JS_CODE || '').trim();
    if (env) return env;
    const sys = configStore.getSection('system') || {};
    return String(sys.amapSecurityJsCode || '').trim();
}

/** 前端加载 JS 地图所需（需在高德控制台同一 Key 勾选「Web端(JS API)」；安全密钥：环境变量或通用设置） */
router.get('/config', (req, res) => {
    const mapJsKey = resolveMapJsKey();
    const securityJsCode = resolveSecurityJsCode();
    res.json({
        code: 0,
        data: {
            enabled: !!mapJsKey,
            mapJsKey: mapJsKey || undefined,
            securityJsCode: securityJsCode || undefined
        }
    });
});

/** 逆地理：lng, lat → 地址、省市区 */
router.get('/regeo', async (req, res) => {
    try {
        const lng = parseFloat(req.query.lng);
        const lat = parseFloat(req.query.lat);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
            return res.status(400).json({ code: 1, message: '请提供有效的 lng、lat 参数' });
        }
        if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
            return res.status(400).json({ code: 1, message: '经纬度超出有效范围' });
        }
        const data = await amapService.reverseGeocode(lng, lat);
        res.json({ code: 0, data });
    } catch (e) {
        console.error('amap regeo:', e.message);
        res.status(500).json({ code: 1, message: e.message || '逆地理编码失败' });
    }
});

/** 地理编码：address → 经纬度、格式化地址 */
router.get('/geocode', async (req, res) => {
    try {
        const address = (req.query.address || '').trim();
        if (!address) {
            return res.status(400).json({ code: 1, message: '请提供 address 参数' });
        }
        if (address.length > 200) {
            return res.status(400).json({ code: 1, message: '地址过长' });
        }
        const data = await amapService.geocode(address);
        res.json({ code: 0, data });
    } catch (e) {
        console.error('amap geocode:', e.message);
        res.status(500).json({ code: 1, message: e.message || '地理编码失败' });
    }
});

module.exports = router;
