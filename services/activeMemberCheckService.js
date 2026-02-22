/**
 * 活跃会员自动检测：根据系统设置定时将会员 status 按「最后活跃时间」或「最后下单时间」判定为 active/inactive
 */
const { Op } = require('sequelize');
const { Member, Order, sequelize } = require('../db');
const configStore = require('./configStore');

const SECTION = 'system';

function getConfig() {
    const data = configStore.getSection(SECTION) || {};
    return {
        enabled: !!data.activeMemberCheckEnabled,
        days: Math.max(1, parseInt(data.activeMemberCheckDays, 10) || 30),
        condition: data.activeMemberCondition === 'lastOrderAt' ? 'lastOrderAt' : 'lastActiveAt'
    };
}

/**
 * 执行一次活跃检测
 */
async function runActiveMemberCheck() {
    const config = getConfig();
    if (!config.enabled) return { skipped: true, reason: '未启用' };

    const now = new Date();
    const cutoff = new Date(now.getTime() - config.days * 24 * 60 * 60 * 1000);

    if (config.condition === 'lastOrderAt') {
        const rows = await sequelize.query(
            `SELECT DISTINCT memberId FROM orders WHERE status = 'paid' AND createdAt >= :cutoff AND memberId IS NOT NULL`,
            { replacements: { cutoff }, type: sequelize.QueryTypes.SELECT }
        );
        const idsRecent = (rows || []).map(r => r.memberId).filter(Boolean);

        const toInactive = await Member.update(
            { status: 'inactive' },
            { where: { status: 'active', id: idsRecent.length ? { [Op.notIn]: idsRecent } : { [Op.ne]: -1 } } }
        );
        const toActive = await Member.update(
            { status: 'active' },
            { where: { status: 'inactive', id: idsRecent.length ? { [Op.in]: idsRecent } : { [Op.eq]: -1 } } }
        );
        const setInactive = Array.isArray(toInactive) ? toInactive[0] : toInactive;
        const setActive = Array.isArray(toActive) ? toActive[0] : toActive;
        console.log('[活跃检测] lastOrderAt 天数=%s 设为不活跃=%s 恢复活跃=%s', config.days, setInactive, setActive);
        return { setInactive, setActive };
    }

    // lastActiveAt
    const toInactive = await Member.update(
        { status: 'inactive' },
        {
            where: {
                status: 'active',
                [Op.or]: [
                    { lastActiveAt: null },
                    { lastActiveAt: { [Op.lt]: cutoff } }
                ]
            }
        }
    );
    const toActive = await Member.update(
        { status: 'active' },
        { where: { status: 'inactive', lastActiveAt: { [Op.gte]: cutoff } } }
    );
    const setInactive = Array.isArray(toInactive) ? toInactive[0] : toInactive;
    const setActive = Array.isArray(toActive) ? toActive[0] : toActive;
    console.log('[活跃检测] lastActiveAt 天数=%s 设为不活跃=%s 恢复活跃=%s', config.days, setInactive, setActive);
    return { setInactive, setActive };
}

module.exports = { getConfig, runActiveMemberCheck };
