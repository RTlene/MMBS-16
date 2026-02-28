/**
 * 小程序端 - 门店列表（用于门店自提选址，支持按距离排序）
 */
const express = require('express');
const { Store } = require('../db');
const router = express.Router();

//  Haversine 近似计算两点距离（公里）
function distanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// GET /api/miniapp/stores?lat=31.2&lng=121.5 可选传入用户经纬度，返回带 distance 的列表（按距离升序）
router.get('/stores', async (req, res) => {
    try {
        const lat = req.query.lat != null && req.query.lat !== '' ? parseFloat(req.query.lat) : null;
        const lng = req.query.lng != null && req.query.lng !== '' ? parseFloat(req.query.lng) : null;

        const stores = await Store.findAll({
            where: { status: 'active' },
            order: [['sortOrder', 'ASC'], ['id', 'ASC']],
            raw: true
        });

        let list = stores.map(s => ({
            id: s.id,
            name: s.name,
            address: s.address,
            region: s.region,
            latitude: s.latitude != null ? parseFloat(s.latitude) : null,
            longitude: s.longitude != null ? parseFloat(s.longitude) : null,
            phone: s.phone,
            businessHours: s.businessHours
        }));

        if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
            list = list.map(s => {
                let distance = null;
                if (s.latitude != null && s.longitude != null) {
                    distance = Math.round(distanceKm(lat, lng, s.latitude, s.longitude) * 1000) / 1000; // 保留3位
                }
                return { ...s, distance };
            }).sort((a, b) => {
                if (a.distance == null && b.distance == null) return 0;
                if (a.distance == null) return 1;
                if (b.distance == null) return -1;
                return a.distance - b.distance;
            });
        }

        res.json({ code: 0, message: '获取成功', data: list });
    } catch (e) {
        console.error('门店列表失败:', e);
        res.status(500).json({ code: 1, message: e.message || '获取失败' });
    }
});

module.exports = router;
