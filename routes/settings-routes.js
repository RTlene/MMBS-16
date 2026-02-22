/**
 * 系统设置 API：通用设置（如活跃会员自动检测）存储在 configStore section 'system'
 */
const express = require('express');
const router = express.Router();
const configStore = require('../services/configStore');
const { authenticateToken } = require('../middleware/auth');

const SECTION = 'system';

const DEFAULT_SYSTEM = {
    activeMemberCheckEnabled: false,
    activeMemberCheckDays: 30,
    activeMemberCondition: 'lastActiveAt',
    activeMemberCheckIntervalHours: 24
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
            activeMemberCheckDays: body.activeMemberCheckDays !== undefined ? Math.max(1, parseInt(body.activeMemberCheckDays, 10) || 30) : current.activeMemberCheckDays,
            activeMemberCondition: (body.activeMemberCondition === 'lastOrderAt' ? 'lastOrderAt' : 'lastActiveAt'),
            activeMemberCheckIntervalHours: body.activeMemberCheckIntervalHours !== undefined ? Math.max(1, Math.min(720, parseInt(body.activeMemberCheckIntervalHours, 10) || 24)) : (current.activeMemberCheckIntervalHours ?? 24)
        };
        await configStore.setSection(SECTION, next);
        res.json({ code: 0, message: '保存成功', data: next });
    } catch (e) {
        console.error('保存系统设置失败:', e);
        res.status(500).json({ code: 1, message: '保存系统设置失败', error: e.message });
    }
});

module.exports = router;
