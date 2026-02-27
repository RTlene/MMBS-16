/**
 * 系统设置 API：通用设置（如活跃会员自动检测）存储在 configStore section 'system'
 * 含售后凭证图保留天数及清理接口
 */
const express = require('express');
const { Op } = require('sequelize');
const router = express.Router();
const configStore = require('../services/configStore');
const { authenticateToken } = require('../middleware/auth');
const { ReturnRequest } = require('../db');
const cosStorage = require('../services/cosStorage');

const SECTION = 'system';

const DEFAULT_SYSTEM = {
    activeMemberCheckEnabled: false,
    activeMemberCheckMode: 'scheduled',
    activeMemberCheckDays: 30,
    activeMemberCondition: 'lastActiveAt',
    activeMemberCheckIntervalHours: 24,
    returnAddress: '',
    afterSalesImageRetentionDays: 90  // 售后凭证图保留天数，超期后清除转为轻量化存储
};

// GET /api/settings/system
router.get('/system', authenticateToken, async (req, res) => {
    try {
        const data = configStore.getSection(SECTION) || {};
        const merged = { ...DEFAULT_SYSTEM, ...data };
        res.json({ code: 0, message: '获取成功', data: merged });
    } catch (e) {
        console.error('获取系统设置失败:', e);
        res.status(500).json({ code: 1, message: '获取系统设置失败', error: e.message });
    }
});

// PUT /api/settings/system
router.put('/system', authenticateToken, async (req, res) => {
    try {
        const body = req.body || {};
        const current = configStore.getSection(SECTION) || {};
        const next = {
            ...DEFAULT_SYSTEM,
            ...current,
            activeMemberCheckEnabled: body.activeMemberCheckEnabled !== undefined ? !!body.activeMemberCheckEnabled : current.activeMemberCheckEnabled,
            activeMemberCheckMode: body.activeMemberCheckMode !== undefined ? (body.activeMemberCheckMode === 'simple' ? 'simple' : 'scheduled') : (current.activeMemberCheckMode === 'simple' ? 'simple' : 'scheduled'),
            activeMemberCheckDays: body.activeMemberCheckDays !== undefined ? Math.max(1, parseInt(body.activeMemberCheckDays, 10) || 30) : current.activeMemberCheckDays,
            activeMemberCondition: (body.activeMemberCondition === 'lastOrderAt' ? 'lastOrderAt' : 'lastActiveAt'),
            activeMemberCheckIntervalHours: body.activeMemberCheckIntervalHours !== undefined ? Math.max(1, Math.min(720, parseInt(body.activeMemberCheckIntervalHours, 10) || 24)) : (current.activeMemberCheckIntervalHours ?? 24),
            returnAddress: body.returnAddress !== undefined ? String(body.returnAddress || '').trim() : (current.returnAddress ?? ''),
            afterSalesImageRetentionDays: body.afterSalesImageRetentionDays !== undefined ? Math.max(1, Math.min(3650, parseInt(body.afterSalesImageRetentionDays, 10) || 90)) : (current.afterSalesImageRetentionDays ?? 90)
        };
        await configStore.setSection(SECTION, next);
        res.json({ code: 0, message: '保存成功', data: next });
    } catch (e) {
        console.error('保存系统设置失败:', e);
        res.status(500).json({ code: 1, message: '保存系统设置失败', error: e.message });
    }
});

// POST /api/settings/after-sales/cleanup-images  清理超期售后凭证图，转为轻量化（清除图片）
router.post('/after-sales/cleanup-images', authenticateToken, async (req, res) => {
    try {
        const system = configStore.getSection(SECTION) || {};
        const days = Math.max(1, parseInt(system.afterSalesImageRetentionDays, 10) || 90);
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        const list = await ReturnRequest.findAll({
            where: {
                images: { [Op.ne]: null },
                createdAt: { [Op.lt]: cutoff }
            },
            attributes: ['id', 'images']
        });

        let deletedCount = 0;
        for (const row of list) {
            const urls = Array.isArray(row.images) ? row.images : (row.images ? [row.images] : []);
            for (const url of urls) {
                if (!url || typeof url !== 'string') continue;
                try {
                    const key = cosStorage.parseObjectKeyFromUrl(url);
                    if (key && cosStorage.isConfigured()) {
                        await cosStorage.deleteObject(key);
                        deletedCount++;
                    }
                } catch (_) { /* 忽略单条删除失败 */ }
            }
            await row.update({ images: null });
        }

        res.json({
            code: 0,
            message: '清理完成',
            data: { clearedCount: list.length, deletedFromStorage: deletedCount }
        });
    } catch (e) {
        console.error('售后图片清理失败:', e);
        res.status(500).json({ code: 1, message: '清理失败', error: e.message });
    }
});

module.exports = router;
