const express = require('express');
const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const bcrypt = require('bcrypt');
const {
    Member,
    MemberLevel,
    DistributorLevel,
    TeamExpansionLevel,
    MemberPointsRecord,
    MemberCommissionRecord,
    MemberLevelChangeRecord,
    CommissionWithdrawal,
    CommissionCalculation,
    Order
} = require('../db');
const { authenticateToken } = require('../middleware/auth');
const multer = require('multer');
const { toCsv, parseCsv, rowsToObjects } = require('../utils/csv');
const LevelUpgradeService = require('../services/levelUpgradeService');
const cosStorage = require('../services/cosStorage');
const wxCloudStorage = require('../services/wxCloudStorage');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function sendCsv(res, filename, csvText) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(csvText);
}

function safeInt(v) {
    if (v === '' || v === null || v === undefined) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
}

function safeDecimal(v) {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function parseJsonOrNull(v) {
    if (v === '' || v === null || v === undefined) return null;
    if (typeof v !== 'string') return v;
    const s = v.trim();
    if (!s) return null;
    try {
        return JSON.parse(s);
    } catch (_) {
        return null;
    }
}

/** 导入用：birthday 可能是 Excel 序列号(如45852)或 YYYY-MM-DD，返回合法 DATEONLY 或 null，绝不返回非法值 */
function safeBirthday(v) {
    if (v === '' || v === null || v === undefined) return null;
    const s = String(v).trim();
    if (!s) return null;
    if (/^\d{5,}-\d{2}-\d{2}/.test(s)) return null;
    const n = Number(s);
    if (Number.isFinite(n) && n >= 1 && n <= 99999) {
        const date = new Date((n - 25569) * 86400 * 1000);
        if (!Number.isNaN(date.getTime())) {
            const y = date.getUTCFullYear(), m = date.getUTCMonth() + 1, d = date.getUTCDate();
            if (y >= 1000 && y <= 9999) return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
        return null;
    }
    const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
        const yn = parseInt(match[1], 10), mn = parseInt(match[2], 10), dn = parseInt(match[3], 10);
        if (yn >= 1000 && yn <= 9999 && mn >= 1 && mn <= 12 && dn >= 1 && dn <= 31) return `${match[1]}-${match[2]}-${match[3]}`;
    }
    return null;
}

function parseRemarkLevels(remark) {
    if (!remark || typeof remark !== 'string') return { memberLevelName: null, distributorLevelName: null };
    const memberMatch = remark.match(/原会员等级\s*:\s*([^;]+)/);
    const distributorMatch = remark.match(/原分销等级\s*:\s*([^;]+)/);
    const trim = (s) => (s ? String(s).trim() : '');
    return {
        memberLevelName: memberMatch ? trim(memberMatch[1]) : null,
        distributorLevelName: distributorMatch ? trim(distributorMatch[1]) : null
    };
}

function parseRemarkBalance(remark) {
    if (!remark || typeof remark !== 'string') return null;
    const m = remark.match(/原余额\s*:\s*([0-9]+(?:\.[0-9]+)?)/);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
}

// 获取会员列表
router.get('/', authenticateToken, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            status = '',
            memberLevelId = '',
            distributorLevelId = '',
            sortBy = 'createdAt',
            sortOrder = 'DESC'
        } = req.query;

        const offset = (page - 1) * limit;
        const where = {};

        // 搜索条件
        if (search) {
            where[Op.or] = [
                { nickname: { [Op.like]: `%${search}%` } },
                { realName: { [Op.like]: `%${search}%` } },
                { phone: { [Op.like]: `%${search}%` } },
                { memberCode: { [Op.like]: `%${search}%` } }
            ];
        }

        // 状态筛选
        if (status) {
            where.status = status;
        }

        // 等级筛选
        if (memberLevelId) {
            where.memberLevelId = memberLevelId;
        }

        if (distributorLevelId) {
            where.distributorLevelId = distributorLevelId;
        }

        // 排序
        const order = [[sortBy, sortOrder.toUpperCase()]];

        const { count, rows } = await Member.findAndCountAll({
            where,
            include: [
                { model: MemberLevel, as: 'memberLevel' },
                { model: DistributorLevel, as: 'distributorLevel' },
                { model: TeamExpansionLevel, as: 'teamExpansionLevel' },
                { model: Member, as: 'referrer' } // 添加推荐人信息
            ],
            order,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        // 处理返回数据，确保等级名称正确显示
        const members = rows.map(member => ({
            ...member.toJSON(),
            memberLevelName: member.memberLevel?.name || '普通会员',
            distributorLevelName: member.distributorLevel?.name || '无',
            teamExpansionLevelName: member.teamExpansionLevel?.name || '无',
            referrerName: member.referrer?.nickname || null
        }));

        res.json({
            code: 0,
            message: '获取会员列表成功',
            data: {
                members: members,
                pagination: {
                    current: parseInt(page),
                    pageSize: parseInt(limit),
                    total: count,
                    pages: Math.ceil(count / limit)
                }
            }
        });
    } catch (error) {
        console.error('获取会员列表失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取会员列表失败: ' + error.message
        });
    }
});

// 导出会员（按筛选条件导出全量CSV）
router.get('/export', authenticateToken, async (req, res) => {
    try {
        const {
            search = '',
            status = '',
            memberLevelId = '',
            distributorLevelId = '',
            sortBy = 'createdAt',
            sortOrder = 'DESC'
        } = req.query;

        const where = {};
        if (search) {
            where[Op.or] = [
                { nickname: { [Op.like]: `%${search}%` } },
                { realName: { [Op.like]: `%${search}%` } },
                { phone: { [Op.like]: `%${search}%` } },
                { memberCode: { [Op.like]: `%${search}%` } }
            ];
        }
        if (status) where.status = status;
        if (memberLevelId) where.memberLevelId = memberLevelId;
        if (distributorLevelId) where.distributorLevelId = distributorLevelId;

        const order = [[sortBy, String(sortOrder || 'DESC').toUpperCase()]];

        const rows = await Member.findAll({
            where,
            include: [
                { model: MemberLevel, as: 'memberLevel' },
                { model: DistributorLevel, as: 'distributorLevel' },
                { model: TeamExpansionLevel, as: 'teamExpansionLevel' }
            ],
            order
        });

        // 导出尽量全面的会员字段（覆盖 Member 模型主字段；不导出 sessionKey）
        const headers = [
            'id',
            'nickname',
            'openid',
            'unionid',
            'memberLevelId',
            'distributorLevelId',
            'teamExpansionLevelId',
            'memberCode',
            'realName',
            'phone',
            'avatar',
            'gender',
            'birthday',
            'province',
            'city',
            'district',
            'address',
            'status',
            'totalPoints',
            'availablePoints',
            'frozenPoints',
            'totalSales',
            'directSales',
            'indirectSales',
            'distributorSales',
            'totalCommission',
            'availableCommission',
            'frozenCommission',
            'totalTeamIncentive',
            'availableTeamIncentive',
            'frozenTeamIncentive',
            'directFans',
            'totalFans',
            'directDistributors',
            'totalDistributors',
            'referrerId',
            'referrerPath',
            'fanIds',
            'distributorIds',
            'teamLevel',
            'teamPath',
            'monthlySales',
            'lastCommissionCalculation',
            'personalDirectCommissionRate',
            'personalIndirectCommissionRate',
            'personalCostRate',
            'totalReferrals',
            'directReferrals',
            'indirectReferrals',
            'levelHistory',
            'remark',
            'lastActiveAt',
            'createdAt',
            'updatedAt',
            // 便于阅读的冗余字段（不会用于导入）
            'memberLevelName',
            'distributorLevelName',
            'teamExpansionLevelName',
            'referrerNickname'
        ];

        const dataRows = rows.map(m => {
            const j = m.toJSON();
            const ext = {
                memberLevelName: m.memberLevel?.name || '',
                distributorLevelName: m.distributorLevel?.name || '',
                teamExpansionLevelName: m.teamExpansionLevel?.name || '',
                referrerNickname: ''
            };

            return headers.map(h => {
                const val = (h in ext) ? ext[h] : (j[h] ?? '');
                // JSON 字段导出为字符串
                if (['fanIds', 'distributorIds', 'levelHistory'].includes(h)) {
                    return val ? JSON.stringify(val) : '';
                }
                return val ?? '';
            });
        });

        const csv = toCsv(headers, dataRows);
        sendCsv(res, `members_${new Date().toISOString().slice(0, 10)}.csv`, csv);
    } catch (error) {
        console.error('导出会员失败:', error);
        res.status(500).json({ code: 1, message: '导出会员失败: ' + error.message });
    }
});

// 下载会员导入模板
router.get('/import-template', authenticateToken, async (req, res) => {
    // 模板覆盖主要可导入字段（不含 createdAt/updatedAt 等系统字段；不含 sessionKey）
    const headers = [
        'id',
        'nickname',
        'openid',
        'unionid',
        'memberLevelId',
        'distributorLevelId',
        'teamExpansionLevelId',
        'memberCode',
        'realName',
        'phone',
        'avatar',
        'gender',
        'birthday',
        'province',
        'city',
        'district',
        'address',
        'status',
        'totalPoints',
        'availablePoints',
        'frozenPoints',
        'totalSales',
        'directSales',
        'indirectSales',
        'totalCommission',
        'availableCommission',
        'frozenCommission',
        'totalTeamIncentive',
        'availableTeamIncentive',
        'frozenTeamIncentive',
        'directFans',
        'totalFans',
        'directDistributors',
        'totalDistributors',
        'referrerId',
        'referrerPath',
        'fanIds',
        'distributorIds',
        'teamLevel',
        'teamPath',
        'monthlySales',
        'lastCommissionCalculation',
        'personalDirectCommissionRate',
        'personalIndirectCommissionRate',
        'personalCostRate',
        'totalReferrals',
        'directReferrals',
        'indirectReferrals',
        'levelHistory',
        'remark',
        'lastActiveAt'
    ];
    const sample = [
        [
            '',
            '示例昵称',
            '',
            '',
            '',
            '',
            '',
            'M0000000001',
            '示例姓名',
            '13800000000',
            '',
            'other',
            '1990-01-01',
            '广东省',
            '深圳市',
            '南山区',
            'xx路xx号',
            'active',
            '0',
            '0',
            '0',
            '0',
            '0',
            '0',
            '0',
            '0',
            '0',
            '0',
            '0',
            '0',
            '0',
            '0',
            '0',
            '0',
            '',
            '',
            '',
            '0',
            '',
            '0',
            '',
            '',
            '',
            '0',
            '0',
            '0',
            '',
            '',
            ''
        ]
    ];
    const csv = toCsv(headers, sample);
    sendCsv(res, 'members_import_template.csv', csv);
});

// 导入会员（CSV：按 id 或 memberCode 更新；否则创建）
router.post('/import', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ code: 1, message: '未上传文件' });
        }
        const text = req.file.buffer.toString('utf8');
        const rows = parseCsv(text);
        const objs = rowsToObjects(rows);

        const results = {
            total: objs.length,
            created: 0,
            updated: 0,
            skipped: 0,
            errors: []
        };

        /** 首次未解析到的推荐人（CSV 中为旧系统用户ID），在全部插入后再按 memberCode 补全 */
        const deferredReferrers = [];

        // 原等级名 → 目标等级名（与后台「等级管理」中名称一致）
        const MEMBER_LEVEL_NAME_MAP = {
            '普通会员': '普通会员',
            'RCT-批发商': '黑金',
            'RCT-合作人': '合伙人'
        };
        const DISTRIBUTOR_LEVEL_NAME_MAP = {
            '个人分销商': '分享达人'
        };

        async function resolveLevelIdByName(Model, name) {
            if (!name) return null;
            const rec = await Model.findOne({ where: { name: String(name).trim() } });
            return rec ? rec.id : null;
        }

        for (let idx = 0; idx < objs.length; idx++) {
            const r = objs[idx] || {};
            const line = idx + 2; // header is line 1

            const nickname = (r.nickname || '').trim();
            if (!nickname) {
                results.skipped += 1;
                results.errors.push({ line, reason: 'nickname 不能为空' });
                continue;
            }

            const payload = {
                nickname,
                openid: (r.openid || '').trim() || null,
                unionid: (r.unionid || '').trim() || null,
                memberLevelId: safeInt(r.memberLevelId),
                distributorLevelId: safeInt(r.distributorLevelId),
                teamExpansionLevelId: safeInt(r.teamExpansionLevelId),
                memberCode: (r.memberCode || '').trim() || null,
                realName: (r.realName || '').trim() || null,
                phone: (r.phone || '').trim() || null,
                avatar: (r.avatar || '').trim() || null,
                gender: (r.gender || '').trim() || null,
                birthday: safeBirthday(r.birthday),
                province: (r.province || '').trim() || null,
                city: (r.city || '').trim() || null,
                district: (r.district || '').trim() || null,
                address: (r.address || '').trim() || null,
                status: (r.status || '').trim() || 'active',

                totalPoints: safeInt(r.totalPoints) ?? undefined,
                availablePoints: safeInt(r.availablePoints) ?? undefined,
                frozenPoints: safeInt(r.frozenPoints) ?? undefined,

                totalSales: safeDecimal(r.totalSales) ?? undefined,
                directSales: safeDecimal(r.directSales) ?? undefined,
                indirectSales: safeDecimal(r.indirectSales) ?? undefined,
                distributorSales: safeDecimal(r.distributorSales) ?? undefined,
                totalCommission: safeDecimal(r.totalCommission) ?? undefined,
                availableCommission: safeDecimal(r.availableCommission) ?? undefined,
                frozenCommission: safeDecimal(r.frozenCommission) ?? undefined,
                totalTeamIncentive: safeDecimal(r.totalTeamIncentive) ?? undefined,
                availableTeamIncentive: safeDecimal(r.availableTeamIncentive) ?? undefined,
                frozenTeamIncentive: safeDecimal(r.frozenTeamIncentive) ?? undefined,

                directFans: safeInt(r.directFans) ?? undefined,
                totalFans: safeInt(r.totalFans) ?? undefined,
                directDistributors: safeInt(r.directDistributors) ?? undefined,
                totalDistributors: safeInt(r.totalDistributors) ?? undefined,

                referrerId: safeInt(r.referrerId),
                referrerPath: (r.referrerPath || '').trim() || null,
                fanIds: parseJsonOrNull(r.fanIds),
                distributorIds: parseJsonOrNull(r.distributorIds),
                teamLevel: safeInt(r.teamLevel) ?? undefined,
                teamPath: (r.teamPath || '').trim() || null,

                monthlySales: safeDecimal(r.monthlySales) ?? undefined,
                lastCommissionCalculation: (r.lastCommissionCalculation || '').trim() || null,
                personalDirectCommissionRate: safeDecimal(r.personalDirectCommissionRate) ?? undefined,
                personalIndirectCommissionRate: safeDecimal(r.personalIndirectCommissionRate) ?? undefined,
                personalCostRate: safeDecimal(r.personalCostRate) ?? undefined,

                totalReferrals: safeInt(r.totalReferrals) ?? undefined,
                directReferrals: safeInt(r.directReferrals) ?? undefined,
                indirectReferrals: safeInt(r.indirectReferrals) ?? undefined,
                levelHistory: parseJsonOrNull(r.levelHistory),

                remark: (r.remark || '').trim() || null,
                lastActiveAt: (r.lastActiveAt || '').trim() || null
            };

            // 清理 undefined（避免覆盖）
            Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

            // 从 remark 兜底：等级名、原余额（防 CSV 列错位/未映射）
            const remark = payload.remark || '';
            const { memberLevelName: rawMemberName, distributorLevelName: rawDistributorName } = parseRemarkLevels(remark);
            const remarkBalance = parseRemarkBalance(remark);
            if ((payload.totalCommission == null || payload.availableCommission == null) && remarkBalance != null) {
                if (payload.totalCommission == null) payload.totalCommission = remarkBalance;
                if (payload.availableCommission == null) payload.availableCommission = remarkBalance;
                if (payload.frozenCommission == null) payload.frozenCommission = 0;
            }

            // 校验会员等级、分销等级、团队拓展等级是否存在；不存在则置空并记录警告，避免写入无效 ID
            if (payload.memberLevelId != null) {
                const memberLevel = await MemberLevel.findByPk(payload.memberLevelId);
                if (!memberLevel) {
                    results.errors.push({ line, reason: '会员等级 ID ' + payload.memberLevelId + ' 不存在，已置空' });
                    payload.memberLevelId = null;
                }
            }
            if (payload.distributorLevelId != null) {
                const distributorLevel = await DistributorLevel.findByPk(payload.distributorLevelId);
                if (!distributorLevel) {
                    results.errors.push({ line, reason: '分销等级 ID ' + payload.distributorLevelId + ' 不存在，已置空' });
                    payload.distributorLevelId = null;
                }
            }
            if (payload.teamExpansionLevelId != null) {
                const teamExpansionLevel = await TeamExpansionLevel.findByPk(payload.teamExpansionLevelId);
                if (!teamExpansionLevel) {
                    results.errors.push({ line, reason: '团队拓展等级 ID ' + payload.teamExpansionLevelId + ' 不存在，已置空' });
                    payload.teamExpansionLevelId = null;
                }
            }

            // 若等级 ID 无效/为空：按 remark 中等级名称（或别名映射后的目标名称）自动解析为系统真实 ID
            if (payload.memberLevelId == null && rawMemberName) {
                const targetName = MEMBER_LEVEL_NAME_MAP[rawMemberName] || rawMemberName;
                const resolvedId = await resolveLevelIdByName(MemberLevel, targetName);
                if (resolvedId != null) payload.memberLevelId = resolvedId;
            }
            if (payload.distributorLevelId == null && rawDistributorName) {
                const targetName = DISTRIBUTOR_LEVEL_NAME_MAP[rawDistributorName] || rawDistributorName;
                const resolvedId = await resolveLevelIdByName(DistributorLevel, targetName);
                if (resolvedId != null) payload.distributorLevelId = resolvedId;
            }
            // referrerId：CSV 中可能是旧系统「推荐人ID」(用户ID)，需按 memberCode 解析为库内 member.id，否则会 Out of range
            const rawReferrerId = payload.referrerId;
            if (payload.referrerId != null) {
                const referrerByPk = await Member.findByPk(payload.referrerId);
                if (referrerByPk) {
                    payload.referrerId = referrerByPk.id;
                } else {
                    const referrerByCode = await Member.findOne({ where: { memberCode: String(payload.referrerId) } });
                    if (referrerByCode) {
                        payload.referrerId = referrerByCode.id;
                    } else {
                        results.errors.push({ line, reason: '推荐人 ID ' + payload.referrerId + ' 在库中无对应会员(id 或 memberCode)，已置空，将在此批导入结束后再尝试按 memberCode 补全' });
                        payload.referrerId = null;
                        deferredReferrers.push({ memberCode: payload.memberCode, openid: payload.openid, referrerIdFromCsv: rawReferrerId });
                    }
                }
            }

            const id = safeInt(r.id);
            const openid = payload.openid;
            let target = null;

            // 更新匹配优先级：openid > id > memberCode
            if (openid) {
                target = await Member.findOne({ where: { openid } });
            }
            if (!target && id) {
                target = await Member.findByPk(id);
            }
            if (!target && payload.memberCode) {
                target = await Member.findOne({ where: { memberCode: payload.memberCode } });
            }

            if (target) {
                await target.update(payload);
                results.updated += 1;
            } else {
                // 创建：memberCode 为空则自动生成
                const data = { ...payload };
                if (!data.memberCode) {
                    const timestamp = Date.now().toString();
                    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
                    data.memberCode = `M${timestamp.slice(-8)}${random}`;
                }
                await Member.create(data);
                results.created += 1;
            }
        }

        // 第二遍：对首次未解析的推荐人按 memberCode 补全（推荐人可能在本批后续行才插入）
        for (const d of deferredReferrers) {
            const memberWhere = [d.memberCode && { memberCode: d.memberCode }, d.openid && { openid: d.openid }].filter(Boolean);
            if (memberWhere.length === 0) continue;
            const member = await Member.findOne({ where: { [Op.or]: memberWhere } });
            const referrer = await Member.findOne({ where: { memberCode: String(d.referrerIdFromCsv) } });
            if (member && referrer) {
                await member.update({ referrerId: referrer.id });
            }
        }

        res.json({ code: 0, message: '导入完成', data: results });
    } catch (error) {
        console.error('导入会员失败:', error);
        res.status(500).json({ code: 1, message: '导入会员失败: ' + error.message });
    }
});

// 批量删除会员（推荐人及其全部粉丝均选中时可删除；供前端 POST /api/members/batch-delete 调用）
router.post('/batch-delete', authenticateToken, async (req, res) => {
    try {
        let ids = req.body.ids != null ? req.body.ids : req.body;
        if (!Array.isArray(ids)) ids = ids != null ? [ids] : [];
        ids = ids.map((id) => parseInt(id, 10)).filter((id) => Number.isFinite(id) && id > 0);

        if (ids.length === 0) {
            return res.status(400).json({
                code: 1,
                message: '请选择要删除的会员'
            });
        }

        const idSet = new Set(ids);
        const referredBySelected = await Member.findAll({
            where: { referrerId: { [Op.in]: ids } },
            attributes: ['id']
        });
        const allFansSelected = referredBySelected.every((m) => idSet.has(m.id));
        if (referredBySelected.length > 0 && !allFansSelected) {
            return res.status(400).json({
                code: 1,
                message: '选中的会员中包含推荐人时，须同时选中其全部粉丝后再删除'
            });
        }

        const membersWithOrdersCount = await Order.count({ where: { memberId: { [Op.in]: ids } } });
        if (membersWithOrdersCount > 0) {
            return res.status(400).json({
                code: 1,
                codeKey: 'MEMBER_HAS_ORDERS',
                message: '部分会员存在订单，无法直接删除。请先在「订单管理」中删除这些会员的订单（删除订单需输入当前登录密码授权）后，再删除会员。'
            });
        }

        const membersToDelete = await Member.findAll({
            where: { id: { [Op.in]: ids } },
            attributes: ['id', 'avatar']
        });
        const t = await Member.sequelize.transaction();
        try {
            await deleteMemberRelatedRecords(ids, t);
            await Member.destroy({ where: { id: { [Op.in]: ids } }, transaction: t });
            await t.commit();
        } catch (err) {
            await t.rollback();
            throw err;
        }

        console.log('[MemberRoutes] router.delete (multi) will delete avatars in object storage:', { ids, membersToDelete });
        await deleteMemberAvatarFromObjectStorage(membersToDelete);
        res.json({ code: 0, message: `成功删除 ${ids.length} 个会员` });
    } catch (error) {
        console.error('批量删除会员失败:', error);
        res.status(500).json({ code: 1, message: '批量删除会员失败: ' + error.message });
    }
});

// 获取会员详情
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const member = await Member.findByPk(id, {
            include: [
                { model: MemberLevel, as: 'memberLevel' },
                { model: DistributorLevel, as: 'distributorLevel' },
                { model: TeamExpansionLevel, as: 'teamExpansionLevel' },
                { model: Member, as: 'referrer' },
                { model: Member, as: 'referrals' },
                { model: MemberPointsRecord, as: 'pointsRecords', limit: 10, order: [['createdAt', 'DESC']] },
                { model: MemberCommissionRecord, as: 'commissionRecords', limit: 10, order: [['createdAt', 'DESC']] },
                { model: MemberLevelChangeRecord, as: 'levelChangeRecords', limit: 10, order: [['createdAt', 'DESC']] }
            ]
        });

        if (!member) {
            return res.status(404).json({
                code: 1,
                message: '会员不存在'
            });
        }

        // 处理返回数据，确保等级名称正确显示
        const memberData = {
            ...member.toJSON(),
            memberLevelName: member.memberLevel?.name || '普通会员',
            distributorLevelName: member.distributorLevel?.name || '无',
            teamExpansionLevelName: member.teamExpansionLevel?.name || '无',
            referrerName: member.referrer?.nickname || null
        };

        res.json({
            code: 0,
            message: '获取会员详情成功',
            data: memberData
        });
    } catch (error) {
        console.error('获取会员详情失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取会员详情失败: ' + error.message
        });
    }
});

// 创建会员
router.post('/', authenticateToken, async (req, res) => {
    try {
        const memberData = req.body;
        
        // 数据清理和验证
        const cleanedData = {
            nickname: memberData.nickname,
            openid: memberData.openid || null,
            unionid: memberData.unionid || null,
            memberLevelId: memberData.memberLevelId || null,
            distributorLevelId: memberData.distributorLevelId || null,
            teamExpansionLevelId: memberData.teamExpansionLevelId || null,
            memberCode: memberData.memberCode || null,
            realName: memberData.realName || null,
            phone: memberData.phone || null,
            avatar: memberData.avatar || null,
            // 清理 gender 字段
            gender: memberData.gender && memberData.gender !== '' ? memberData.gender : null,
            // 清理 birthday 字段
            birthday: memberData.birthday && memberData.birthday !== '' && memberData.birthday !== 'Invalid date' ? memberData.birthday : null,
            province: memberData.province || null,
            city: memberData.city || null,
            district: memberData.district || null,
            address: memberData.address || null,
            status: memberData.status || 'active',
            totalPoints: memberData.totalPoints || 0,
            availablePoints: memberData.availablePoints || 0,
            frozenPoints: memberData.frozenPoints || 0,
            totalSales: memberData.totalSales || 0,
            directSales: memberData.directSales || 0,
            indirectSales: memberData.indirectSales || 0,
            distributorSales: memberData.distributorSales || 0,
            totalCommission: memberData.totalCommission || 0,
            availableCommission: memberData.availableCommission || 0,
            frozenCommission: memberData.frozenCommission || 0,
            totalTeamIncentive: memberData.totalTeamIncentive || 0,
            availableTeamIncentive: memberData.availableTeamIncentive || 0,
            frozenTeamIncentive: memberData.frozenTeamIncentive || 0,
            directFans: memberData.directFans || 0,
            totalFans: memberData.totalFans || 0,
            directDistributors: memberData.directDistributors || 0,
            totalDistributors: memberData.totalDistributors || 0,
            referrerId: memberData.referrerId || null,
            referrerPath: memberData.referrerPath || null,
            levelHistory: memberData.levelHistory || null,
            remark: memberData.remark || null,
            lastActiveAt: memberData.lastActiveAt || null
        };

        // 验证必填字段
        if (!cleanedData.nickname) {
            return res.status(400).json({
                code: 1,
                message: '昵称不能为空'
            });
        }

        // 自动生成会员编号
        if (!cleanedData.memberCode) {
            const timestamp = Date.now().toString();
            const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
            cleanedData.memberCode = `M${timestamp.slice(-8)}${random}`;
        }

        // 验证 gender 字段
        if (cleanedData.gender && !['male', 'female', 'other'].includes(cleanedData.gender)) {
            return res.status(400).json({
                code: 1,
                message: '性别字段值无效'
            });
        }

        // 验证生日格式
        if (cleanedData.birthday) {
            const date = new Date(cleanedData.birthday);
            if (isNaN(date.getTime())) {
                cleanedData.birthday = null;
            }
        }

        // 验证等级ID是否存在
        if (cleanedData.memberLevelId) {
            const memberLevel = await MemberLevel.findByPk(cleanedData.memberLevelId);
            if (!memberLevel) {
                return res.status(400).json({
                    code: 1,
                    message: '会员等级不存在'
                });
            }
        }

        if (cleanedData.distributorLevelId) {
            const distributorLevel = await DistributorLevel.findByPk(cleanedData.distributorLevelId);
            if (!distributorLevel) {
                return res.status(400).json({
                    code: 1,
                    message: '分销等级不存在'
                });
            }
        }

        if (cleanedData.teamExpansionLevelId) {
            const teamExpansionLevel = await TeamExpansionLevel.findByPk(cleanedData.teamExpansionLevelId);
            if (!teamExpansionLevel) {
                return res.status(400).json({
                    code: 1,
                    message: '团队拓展激励等级不存在'
                });
            }
        }

        // 验证推荐人是否存在
        if (cleanedData.referrerId) {
            const referrer = await Member.findByPk(cleanedData.referrerId);
            if (!referrer) {
                return res.status(400).json({
                    code: 1,
                    message: '推荐人不存在'
                });
            }
        }

        // 验证会员编号唯一性
        if (cleanedData.memberCode) {
            const existingMember = await Member.findOne({ where: { memberCode: cleanedData.memberCode } });
            if (existingMember) {
                return res.status(400).json({
                    code: 1,
                    message: '会员编号已存在'
                });
            }
        }

        // 验证openid唯一性
        if (cleanedData.openid) {
            const existingMember = await Member.findOne({ where: { openid: cleanedData.openid } });
            if (existingMember) {
                return res.status(400).json({
                    code: 1,
                    message: '该openid已绑定其他会员'
                });
            }
        }

        const member = await Member.create(cleanedData);
        if (cleanedData.referrerId) {
            try {
                await LevelUpgradeService.updateFansAndUpgradeUpline(cleanedData.referrerId);
            } catch (e) {
                console.error('创建会员后更新推荐人链粉丝/等级失败:', e);
            }
        }
        res.json({
            code: 0,
            message: '会员创建成功',
            data: member
        });
    } catch (error) {
        console.error('创建会员失败:', error);
        res.status(500).json({
            code: 1,
            message: '创建会员失败: ' + error.message
        });
    }
});

// 更新会员
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const memberData = req.body;

        const member = await Member.findByPk(id);
        if (!member) {
            return res.status(404).json({
                code: 1,
                message: '会员不存在'
            });
        }

        // 数据清理和验证
        const cleanedData = {
            nickname: memberData.nickname,
            openid: memberData.openid || null,
            unionid: memberData.unionid || null,
            memberLevelId: memberData.memberLevelId || null,
            distributorLevelId: memberData.distributorLevelId || null,
            teamExpansionLevelId: memberData.teamExpansionLevelId || null,
            // 修复：保持原有会员编号，只有在明确传递新编号时才更新
            memberCode: memberData.memberCode || member.memberCode,
            realName: memberData.realName || null,
            phone: memberData.phone || null,
            avatar: memberData.avatar || null,
            gender: memberData.gender && memberData.gender !== '' ? memberData.gender : null,
            birthday: memberData.birthday && memberData.birthday !== '' && memberData.birthday !== 'Invalid date' ? memberData.birthday : null,
            province: memberData.province || null,
            city: memberData.city || null,
            district: memberData.district || null,
            address: memberData.address || null,
            status: memberData.status || 'active',
            // 不更新积分/销售额/佣金/团队激励/粉丝与分销人数/等级历史，由系统或专用接口维护，避免编辑时被误清空
            referrerId: memberData.referrerId || null,
            referrerPath: memberData.referrerPath || null,
            remark: memberData.remark || null,
            lastActiveAt: memberData.lastActiveAt || null
        };
        // 手动设置等级时标记为“手动覆盖”，自动升级将不再覆盖；清空等级时取消覆盖
        if (memberData.memberLevelId !== undefined) {
            cleanedData.memberLevelManualOverride = (memberData.memberLevelId != null && memberData.memberLevelId !== '');
        }
        if (memberData.distributorLevelId !== undefined) {
            cleanedData.distributorLevelManualOverride = (memberData.distributorLevelId != null && memberData.distributorLevelId !== '');
        }

        // 验证必填字段
        if (!cleanedData.nickname) {
            return res.status(400).json({
                code: 1,
                message: '昵称不能为空'
            });
        }

        // 验证 gender 字段
        if (cleanedData.gender && !['male', 'female', 'other'].includes(cleanedData.gender)) {
            return res.status(400).json({
                code: 1,
                message: '性别字段值无效'
            });
        }

        // 验证生日格式
        if (cleanedData.birthday) {
            const date = new Date(cleanedData.birthday);
            if (isNaN(date.getTime())) {
                cleanedData.birthday = null;
            }
        }

        // 验证等级ID是否存在
        if (cleanedData.memberLevelId) {
            const memberLevel = await MemberLevel.findByPk(cleanedData.memberLevelId);
            if (!memberLevel) {
                return res.status(400).json({
                    code: 1,
                    message: '会员等级不存在'
                });
            }
        }

        if (cleanedData.distributorLevelId) {
            const distributorLevel = await DistributorLevel.findByPk(cleanedData.distributorLevelId);
            if (!distributorLevel) {
                return res.status(400).json({
                    code: 1,
                    message: '分销等级不存在'
                });
            }
        }

        if (cleanedData.teamExpansionLevelId) {
            const teamExpansionLevel = await TeamExpansionLevel.findByPk(cleanedData.teamExpansionLevelId);
            if (!teamExpansionLevel) {
                return res.status(400).json({
                    code: 1,
                    message: '团队拓展激励等级不存在'
                });
            }
        }

        // 验证推荐人是否存在
        if (cleanedData.referrerId) {
            const referrer = await Member.findByPk(cleanedData.referrerId);
            if (!referrer) {
                return res.status(400).json({
                    code: 1,
                    message: '推荐人不存在'
                });
            }
        }

        // 验证会员编号唯一性（排除当前会员）
        if (cleanedData.memberCode) {
            const existingMember = await Member.findOne({ 
                where: { 
                    memberCode: cleanedData.memberCode,
                    id: { [Op.ne]: id }
                } 
            });
            if (existingMember) {
                return res.status(400).json({
                    code: 1,
                    message: '会员编号已存在'
                });
            }
        }

        // 验证openid唯一性（排除当前会员）
        if (cleanedData.openid) {
            const existingMember = await Member.findOne({ 
                where: { 
                    openid: cleanedData.openid,
                    id: { [Op.ne]: id }
                } 
            });
            if (existingMember) {
                return res.status(400).json({
                    code: 1,
                    message: '该openid已绑定其他会员'
                });
            }
        }

        const toRefId = (v) => {
            if (v == null || v === '') return null;
            const n = parseInt(v, 10);
            return (!Number.isNaN(n) && n >= 1) ? n : null;
        };
        const oldReferrerId = toRefId(member.referrerId);
        const newReferrerId = toRefId(cleanedData.referrerId);
        await member.update(cleanedData);
        try {
            const activeMemberCheckService = require('../services/activeMemberCheckService');
            activeMemberCheckService.setMemberActive(member.id).catch(() => {});
        } catch (_) {}
        // 本请求若在 body 中传了等级字段，视为手动设置，本次不执行自动升级覆盖（不依赖 DB 的 manualOverride 列即可生效）
        const skipLevelOverwrite = {};
        if (memberData.hasOwnProperty('memberLevelId')) skipLevelOverwrite.member = true;
        if (memberData.hasOwnProperty('distributorLevelId')) skipLevelOverwrite.distributor = true;
        try {
            console.log('[会员更新] 触发等级/粉丝检查 memberId=%s oldReferrerId=%s newReferrerId=%s skipLevelOverwrite=%s', member.id, oldReferrerId, newReferrerId, Object.keys(skipLevelOverwrite).length ? JSON.stringify(skipLevelOverwrite) : '无');
            await LevelUpgradeService.onMemberDataChanged(member.id, { oldReferrerId, newReferrerId, skipLevelOverwrite: Object.keys(skipLevelOverwrite).length ? skipLevelOverwrite : undefined });
        } catch (e) {
            console.error('会员信息变更后等级/粉丝检查失败:', e);
        }
        res.json({
            code: 0,
            message: '会员更新成功',
            data: member
        });
    } catch (error) {
        console.error('更新会员失败:', error);
        res.status(500).json({
            code: 1,
            message: '更新会员失败: ' + error.message
        });
    }
});

/**
 * 删除会员前按依赖顺序清理所有关联表（避免外键约束）
 * 顺序：子表先于父表；refund_records 引用 return_requests，故先删 refund_records。
 * 不删 orders（有订单时接口直接报错，不执行此处）。
 * @param {number|number[]} memberIds - 会员 ID 或 ID 数组
 * @param {import('sequelize').Transaction} [transaction] - 可选，若传入则在本事务内执行（与删除会员同事务）
 */
async function deleteMemberRelatedRecords(memberIds, transaction) {
    const ids = Array.isArray(memberIds) ? memberIds : [memberIds];
    if (ids.length === 0) return;
    const sequelize = Member.sequelize;
    const placeholders = ids.map(() => '?').join(',');
    const idTriple = [...ids, ...ids, ...ids];
    const opts = transaction ? { transaction } : {};

    const steps = [
        ['commission_calculations', `DELETE FROM commission_calculations WHERE memberId IN (${placeholders}) OR referrerId IN (${placeholders}) OR recipientId IN (${placeholders})`, idTriple],
        ['member_commission_records', `DELETE FROM member_commission_records WHERE memberId IN (${placeholders})`, ids],
        ['commission_withdrawals', `DELETE FROM commission_withdrawals WHERE memberId IN (${placeholders})`, ids],
        ['team_incentive_calculations', `DELETE FROM team_incentive_calculations WHERE distributorId IN (${placeholders}) OR referrerId IN (${placeholders})`, [...ids, ...ids]],
        ['member_level_change_records', `DELETE FROM member_level_change_records WHERE memberId IN (${placeholders})`, ids],
        ['member_points_records', `DELETE FROM member_points_records WHERE memberId IN (${placeholders})`, ids],
        ['refund_records', `DELETE FROM refund_records WHERE memberId IN (${placeholders})`, ids],
        ['return_requests', `DELETE FROM return_requests WHERE memberId IN (${placeholders})`, ids],
        ['VerificationCodes', `DELETE FROM VerificationCodes WHERE memberId IN (${placeholders})`, ids],
        ['point_records', `DELETE FROM point_records WHERE memberId IN (${placeholders})`, ids],
        ['point_exchanges', `DELETE FROM point_exchanges WHERE memberId IN (${placeholders})`, ids],
        ['member_coupons', `DELETE FROM member_coupons WHERE memberId IN (${placeholders})`, ids],
        ['member_addresses', `DELETE FROM member_addresses WHERE memberId IN (${placeholders})`, ids],
    ];

    for (const [, sql, replacements] of steps) {
        await sequelize.query(sql, { replacements, ...opts });
    }
}

async function deleteMemberAvatarFromObjectStorage(members) {
    const list = Array.isArray(members) ? members : [];
    for (const m of list) {
        const memberId = m && (m.id || m.memberId);
        const avatar = m && m.avatar;
        if (!avatar || typeof avatar !== 'string') continue;

        try {
            console.log('[MemberRoutes] deleteMemberAvatarFromObjectStorage memberId=%s avatar=%s', memberId, avatar);
            // 1) 云托管（cloud://...）
            if (wxCloudStorage.isConfigured && wxCloudStorage.isConfigured() && avatar.startsWith('cloud://')) {
                const r = await wxCloudStorage.deleteFiles([avatar]);
                console.log('[MemberRoutes] wxCloudStorage deleteFiles result:', r);
                if (r && typeof r.deleted === 'number' && r.deleted === 0) {
                    throw new Error('[MemberRoutes] 云托管删除返回 deleted=0: ' + JSON.stringify(r));
                }
                if (r && Array.isArray(r.failed) && r.failed.length) {
                    throw new Error('[MemberRoutes] 云托管删除返回 failed: ' + JSON.stringify(r.failed));
                }
                continue;
            }

            // 2) COS（公网 url => parseObjectKeyFromUrl）
            if (cosStorage.isConfigured && cosStorage.isConfigured()) {
                const key = cosStorage.parseObjectKeyFromUrl(avatar);
                if (key) {
                    console.log('[MemberRoutes] cos delete objectKey=', key);
                    await cosStorage.deleteObject(key);
                    continue;
                }

                // fallback: 从 URL pathname 中直接取对象键（仅当命中 /avatars/{memberId}/ 时）
                try {
                    const u = new URL(avatar);
                    const pathname = (u.pathname || '').replace(/^\/+/, '');
                    const marker = `avatars/${memberId}/`;
                    if (pathname && pathname.includes(marker)) {
                        console.log('[MemberRoutes] cos fallback delete pathnameAsKey=', pathname);
                        await cosStorage.deleteObject(pathname);
                        continue;
                    }
                } catch (_) {}
            }

            // 3) 本地回退（/uploads/avatars/...）
            if (avatar.startsWith('/uploads/avatars/')) {
                const rel = avatar.replace(/^\/+/, '');
                const abs = path.join(__dirname, '../public', rel);
                if (fs.existsSync(abs)) fs.unlinkSync(abs);
            }
        } catch (e) {
            // 删除失败不影响“删除会员”主流程
            console.error(
                `[MemberRoutes] 删除会员头像存储失败: memberId=${memberId}`,
                avatar,
                e && e.message ? e.message : e
            );
        }
    }
}

// 删除会员
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!Number.isFinite(id)) {
            return res.status(400).json({ code: 1, message: '无效的会员ID' });
        }

        const member = await Member.findByPk(id);
        if (!member) {
            return res.status(404).json({ code: 1, message: '会员不存在' });
        }

        const hasFans = await Member.count({ where: { referrerId: id } });
        if (hasFans > 0) {
            return res.status(400).json({
                code: 1,
                message: '该会员有下级粉丝，请先删除其粉丝或同时选中推荐人及全部粉丝后批量删除'
            });
        }

        const orderCount = await Order.count({ where: { memberId: id } });
        if (orderCount > 0) {
            return res.status(400).json({
                code: 1,
                codeKey: 'MEMBER_HAS_ORDERS',
                message: '该会员存在订单，无法直接删除。请先在「订单管理」中删除该会员的订单（删除订单需输入当前登录密码授权）后，再删除会员。'
            });
        }

        const membersToDelete = [{ id: member.id, avatar: member.avatar }];
        const t = await Member.sequelize.transaction();
        try {
            await deleteMemberRelatedRecords(id, t);
            await member.destroy({ transaction: t });
            await t.commit();
        } catch (err) {
            await t.rollback();
            throw err;
        }

        // 事务提交后再删对象存储，避免回滚时出现“误删”
        console.log('[MemberRoutes] router.delete /:id will delete avatars in object storage:', membersToDelete);
        await deleteMemberAvatarFromObjectStorage(membersToDelete);
        res.json({ code: 0, message: '会员删除成功' });
    } catch (error) {
        console.error('删除会员失败:', error);
        res.status(500).json({ code: 1, message: '删除会员失败: ' + error.message });
    }
});

// 批量删除会员（DELETE 方式，逻辑与 POST /batch-delete 一致）
router.delete('/', authenticateToken, async (req, res) => {
    try {
        let ids = req.body && req.body.ids != null ? req.body.ids : (req.body && Array.isArray(req.body) ? req.body : []);
        if (!Array.isArray(ids)) ids = ids != null ? [ids] : [];
        ids = ids.map((id) => parseInt(id, 10)).filter((id) => Number.isFinite(id) && id > 0);

        if (ids.length === 0) {
            return res.status(400).json({ code: 1, message: '请选择要删除的会员' });
        }

        const idSet = new Set(ids);
        const referredBySelected = await Member.findAll({
            where: { referrerId: { [Op.in]: ids } },
            attributes: ['id']
        });
        const allFansSelected = referredBySelected.every((m) => idSet.has(m.id));
        if (referredBySelected.length > 0 && !allFansSelected) {
            return res.status(400).json({
                code: 1,
                message: '选中的会员中包含推荐人时，须同时选中其全部粉丝后再删除'
            });
        }

        const membersWithOrdersCount = await Order.count({ where: { memberId: { [Op.in]: ids } } });
        if (membersWithOrdersCount > 0) {
            return res.status(400).json({
                code: 1,
                codeKey: 'MEMBER_HAS_ORDERS',
                message: '部分会员存在订单，无法直接删除。请先在「订单管理」中删除这些会员的订单（删除订单需输入当前登录密码授权）后，再删除会员。'
            });
        }

        const membersToDelete = await Member.findAll({
            where: { id: { [Op.in]: ids } },
            attributes: ['id', 'avatar']
        });
        const t = await Member.sequelize.transaction();
        try {
            await deleteMemberRelatedRecords(ids, t);
            await Member.destroy({ where: { id: { [Op.in]: ids } }, transaction: t });
            await t.commit();
        } catch (err) {
            await t.rollback();
            throw err;
        }

        console.log('[MemberRoutes] router.post /batch-delete will delete avatars in object storage:', { ids, membersToDelete });
        await deleteMemberAvatarFromObjectStorage(membersToDelete);
        res.json({ code: 0, message: `成功删除 ${ids.length} 个会员` });
    } catch (error) {
        console.error('批量删除会员失败:', error);
        res.status(500).json({ code: 1, message: '批量删除会员失败: ' + error.message });
    }
});

// 获取会员统计信息
router.get('/stats/overview', authenticateToken, async (req, res) => {
    try {
        const totalMembers = await Member.count();
        const activeMembers = await Member.count({ where: { status: 'active' } });
        const inactiveMembers = await Member.count({ where: { status: 'inactive' } });
        const suspendedMembers = await Member.count({ where: { status: 'suspended' } });

        // 按等级统计
        const memberLevelStats = await Member.findAll({
            attributes: [
                'memberLevelId',
                [Member.sequelize.fn('COUNT', Member.sequelize.col('Member.id')), 'count']
            ],
            include: [{ 
                model: MemberLevel, 
                as: 'memberLevel',
                attributes: ['id', 'level', 'name', 'description', 'minPoints', 'maxPoints', 'benefits', 'isSharingEarner', 'isDefault', 'sortOrder', 'directCommissionRate', 'indirectCommissionRate', 'status', 'createdAt', 'updatedAt']
            }],
            group: ['Member.memberLevelId', 'memberLevel.id'],
            where: { memberLevelId: { [Op.ne]: null } },
            raw: false
        });

        const distributorLevelStats = await Member.findAll({
            attributes: [
                'distributorLevelId',
                [Member.sequelize.fn('COUNT', Member.sequelize.col('Member.id')), 'count']
            ],
            include: [{ 
                model: DistributorLevel, 
                as: 'distributorLevel',
                attributes: ['id', 'level', 'name', 'description', 'minSales', 'maxSales', 'benefits', 'costRate', 'directCommissionRate', 'indirectCommissionRate', 'sortOrder', 'status', 'createdAt', 'updatedAt']
            }],
            group: ['Member.distributorLevelId', 'distributorLevel.id'],
            where: { distributorLevelId: { [Op.ne]: null } },
            raw: false
        });

        // 积分统计
        const pointsStats = await Member.findOne({
            attributes: [
                [Member.sequelize.fn('SUM', Member.sequelize.col('totalPoints')), 'totalPoints'],
                [Member.sequelize.fn('SUM', Member.sequelize.col('availablePoints')), 'availablePoints'],
                [Member.sequelize.fn('SUM', Member.sequelize.col('frozenPoints')), 'frozenPoints']
            ]
        });

        // 佣金统计
        const commissionStats = await Member.findOne({
            attributes: [
                [Member.sequelize.fn('SUM', Member.sequelize.col('totalCommission')), 'totalCommission'],
                [Member.sequelize.fn('SUM', Member.sequelize.col('availableCommission')), 'availableCommission'],
                [Member.sequelize.fn('SUM', Member.sequelize.col('frozenCommission')), 'frozenCommission']
            ]
        });

        // 销售额统计
        const salesStats = await Member.findOne({
            attributes: [
                [Member.sequelize.fn('SUM', Member.sequelize.col('totalSales')), 'totalSales'],
                [Member.sequelize.fn('SUM', Member.sequelize.col('directSales')), 'directSales'],
                [Member.sequelize.fn('SUM', Member.sequelize.col('indirectSales')), 'indirectSales'],
                [Member.sequelize.fn('SUM', Member.sequelize.col('distributorSales')), 'distributorSales']
            ]
        });

        res.json({
            code: 0,
            message: '获取统计信息成功',
            data: {
                totalMembers,
                activeMembers,
                inactiveMembers,
                suspendedMembers,
                memberLevelStats,
                distributorLevelStats,
                pointsStats,
                commissionStats,
                salesStats
            }
        });
    } catch (error) {
        console.error('获取统计信息失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取统计信息失败: ' + error.message
        });
    }
});

// 更新会员等级
router.put('/:id/level', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { levelType, levelId, reason, description } = req.body;

        const member = await Member.findByPk(id);
        if (!member) {
            return res.status(404).json({
                code: 1,
                message: '会员不存在'
            });
        }

        // 验证等级类型和等级ID
        let levelModel, levelField;
        switch (levelType) {
            case 'member':
                levelModel = MemberLevel;
                levelField = 'memberLevelId';
                break;
            case 'distributor':
                levelModel = DistributorLevel;
                levelField = 'distributorLevelId';
                break;
            case 'team_expansion':
                levelModel = TeamExpansionLevel;
                levelField = 'teamExpansionLevelId';
                break;
            default:
                return res.status(400).json({
                    code: 1,
                    message: '无效的等级类型'
                });
        }

        if (levelId) {
            const level = await levelModel.findByPk(levelId);
            if (!level) {
                return res.status(400).json({
                    code: 1,
                    message: '等级不存在'
                });
            }
        }

        // 记录等级变更
        const oldLevelId = member[levelField];
        await MemberLevelChangeRecord.create({
            memberId: id,
            levelType,
            oldLevelId,
            newLevelId: levelId,
            reason,
            description,
            operatorId: req.user.id
        });

        // 更新会员等级，并标记为手动设置（避免自动升级覆盖）
        const updatePayload = { [levelField]: levelId };
        if (levelType === 'member') {
            updatePayload.memberLevelManualOverride = (levelId != null && levelId !== '');
        } else if (levelType === 'distributor') {
            updatePayload.distributorLevelManualOverride = (levelId != null && levelId !== '');
        }
        await member.update(updatePayload);

        res.json({
            code: 0,
            message: '会员等级更新成功',
            data: member
        });
    } catch (error) {
        console.error('更新会员等级失败:', error);
        res.status(500).json({
            code: 1,
            message: '更新会员等级失败: ' + error.message
        });
    }
});

// 调整会员积分
router.put('/:id/points', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { type, points, source, description } = req.body;

        const member = await Member.findByPk(id);
        if (!member) {
            return res.status(404).json({
                code: 1,
                message: '会员不存在'
            });
        }

        // 验证积分类型
        if (!['earn', 'consume', 'expire', 'adjust', 'refund', 'admin_adjust'].includes(type)) {
            return res.status(400).json({
                code: 1,
                message: '无效的积分类型'
            });
        }

        // 验证积分数量
        if (typeof points !== 'number' || isNaN(points)) {
            return res.status(400).json({
                code: 1,
                message: '积分数量必须是数字'
            });
        }

        // 计算新的积分余额
        let newTotalPoints = member.totalPoints;
        let newAvailablePoints = member.availablePoints;
        let newFrozenPoints = member.frozenPoints;

        switch (type) {
            case 'earn':
                newTotalPoints += points;
                newAvailablePoints += points;
                break;
            case 'consume':
                if (newAvailablePoints < points) {
                    return res.status(400).json({
                        code: 1,
                        message: '可用积分不足'
                    });
                }
                newAvailablePoints -= points;
                break;
            case 'expire':
                if (newAvailablePoints < points) {
                    return res.status(400).json({
                        code: 1,
                        message: '可用积分不足'
                    });
                }
                newTotalPoints -= points;
                newAvailablePoints -= points;
                break;
            case 'adjust':
                newTotalPoints += points;
                newAvailablePoints += points;
                break;
            case 'refund':
                newAvailablePoints += points;
                break;
            case 'admin_adjust':
                // 管理员直接调整：points 可以是正数（增加）或负数（减少）
                const pointsChange = Math.round(points);
                newTotalPoints += pointsChange;
                newAvailablePoints += pointsChange;
                // 确保积分不为负数
                if (newTotalPoints < 0) {
                    newTotalPoints = 0;
                }
                if (newAvailablePoints < 0) {
                    newAvailablePoints = 0;
                }
                break;
        }

        // 创建积分记录
        await MemberPointsRecord.create({
            memberId: id,
            type,
            points: Math.round(points), // 确保是整数
            balance: newAvailablePoints,
            source: source || 'admin_adjust',
            description: description || (type === 'admin_adjust' ? `管理员调整：${points > 0 ? '增加' : '减少'} ${Math.abs(points)} 积分` : description),
            status: 'completed'
        });

        // 更新会员积分
        await member.update({
            totalPoints: newTotalPoints,
            availablePoints: newAvailablePoints,
            frozenPoints: newFrozenPoints
        });
        try {
            const LevelUpgradeService = require('../services/levelUpgradeService');
            await LevelUpgradeService.tryUpgradeMember(member.id);
        } catch (e) {
            console.error('积分调整后等级自动升级检查失败:', e);
        }
        // 重新加载会员数据以确保返回最新数据
        await member.reload();
        
        res.json({
            code: 0,
            message: '积分调整成功',
            data: member
        });
    } catch (error) {
        console.error('调整会员积分失败:', error);
        res.status(500).json({
            code: 1,
            message: '调整会员积分失败: ' + error.message
        });
    }
});

// 调整会员佣金
router.put('/:id/commission', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { type, amount, source, description } = req.body;

        const member = await Member.findByPk(id);
        if (!member) {
            return res.status(404).json({
                code: 1,
                message: '会员不存在'
            });
        }

        // 验证佣金类型
        if (!['direct', 'indirect', 'differential', 'team_expansion', 'admin_adjust'].includes(type)) {
            return res.status(400).json({
                code: 1,
                message: '无效的佣金类型'
            });
        }

        // 验证佣金金额
        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum === 0) {
            return res.status(400).json({
                code: 1,
                message: '佣金金额必须是有效的数字且不能为0'
            });
        }

        // 计算新的佣金余额
        let newTotalCommission = parseFloat(member.totalCommission || 0);
        let newAvailableCommission = parseFloat(member.availableCommission || 0);
        let newFrozenCommission = parseFloat(member.frozenCommission || 0);

        if (type === 'admin_adjust') {
            // 管理员直接调整：amount 可以是正数（增加）或负数（减少）
            const amountChange = amountNum;
            newTotalCommission += amountChange;
            newAvailableCommission += amountChange;
            // 确保佣金不为负数
            if (newTotalCommission < 0) {
                newTotalCommission = 0;
            }
            if (newAvailableCommission < 0) {
                newAvailableCommission = 0;
            }
        } else {
            // 其他类型只支持增加
            newTotalCommission += amountNum;
            newAvailableCommission += amountNum;
        }

        // 创建佣金记录
        await MemberCommissionRecord.create({
            memberId: id,
            type,
            amount: amountNum,
            balance: newAvailableCommission,
            source: source || 'admin_adjust',
            description: description || (type === 'admin_adjust' ? `管理员调整：${amountNum > 0 ? '增加' : '减少'} ¥${Math.abs(amountNum).toFixed(2)}` : description),
            status: 'completed',
            settledAt: new Date()
        });

        // 更新会员佣金
        await member.update({
            totalCommission: newTotalCommission,
            availableCommission: newAvailableCommission,
            frozenCommission: newFrozenCommission
        });
        
        // 重新加载会员数据以确保返回最新数据
        await member.reload();
        
        res.json({
            code: 0,
            message: '佣金调整成功',
            data: member
        });
    } catch (error) {
        console.error('调整会员佣金失败:', error);
        res.status(500).json({
            code: 1,
            message: '调整会员佣金失败: ' + error.message
        });
    }
});

// 获取会员积分记录
router.get('/:id/points', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 10, type = '' } = req.query;

        const offset = (page - 1) * limit;
        const where = { memberId: id };

        if (type) {
            where.type = type;
        }

        const { count, rows } = await MemberPointsRecord.findAndCountAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            code: 0,
            message: '获取积分记录成功',
            data: {
                records: rows,
                pagination: {
                    current: parseInt(page),
                    pageSize: parseInt(limit),
                    total: count,
                    pages: Math.ceil(count / limit)
                }
            }
        });
    } catch (error) {
        console.error('获取积分记录失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取积分记录失败: ' + error.message
        });
    }
});

// 获取会员佣金记录
router.get('/:id/commission', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 10, type = '' } = req.query;

        const offset = (page - 1) * limit;
        const where = { memberId: id };

        if (type) {
            where.type = type;
        }

        const { count, rows } = await MemberCommissionRecord.findAndCountAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            code: 0,
            message: '获取佣金记录成功',
            data: {
                records: rows,
                pagination: {
                    current: parseInt(page),
                    pageSize: parseInt(limit),
                    total: count,
                    pages: Math.ceil(count / limit)
                }
            }
        });
    } catch (error) {
        console.error('获取佣金记录失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取佣金记录失败: ' + error.message
        });
    }
});

// 获取会员等级变更记录
router.get('/:id/level-changes', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 10, levelType = '' } = req.query;

        const offset = (page - 1) * limit;
        const where = { memberId: id };

        if (levelType) {
            where.levelType = levelType;
        }

        const { count, rows } = await MemberLevelChangeRecord.findAndCountAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            code: 0,
            message: '获取等级变更记录成功',
            data: {
                records: rows,
                pagination: {
                    current: parseInt(page),
                    pageSize: parseInt(limit),
                    total: count,
                    pages: Math.ceil(count / limit)
                }
            }
        });
    } catch (error) {
        console.error('获取等级变更记录失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取等级变更记录失败: ' + error.message
        });
    }
});

// 获取会员关系网
router.get('/:id/network', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const member = await Member.findByPk(id, {
            include: [
                { model: Member, as: 'referrer' },
                { model: MemberLevel, as: 'memberLevel' },
                { model: DistributorLevel, as: 'distributorLevel' },
                { 
                    model: Member, 
                    as: 'referrals',
                    include: [
                        { model: MemberLevel, as: 'memberLevel' },
                        { model: DistributorLevel, as: 'distributorLevel' }
                    ]
                }
            ]
        });

        if (!member) {
            return res.status(404).json({
                code: 1,
                message: '会员不存在'
            });
        }

        const toNode = (m) => ({
            id: m.id,
            nickname: m.nickname,
            memberCode: m.memberCode,
            memberLevelName: (m.memberLevel && m.memberLevel.name) ? m.memberLevel.name : '普通会员',
            distributorLevelName: (m.distributorLevel && m.distributorLevel.name) ? m.distributorLevel.name : '无',
            children: (m.referrals || []).map(toNode)
        });

        const network = toNode(member);

        res.json({
            code: 0,
            message: '获取会员关系网成功',
            data: {
                member: {
                    id: member.id,
                    nickname: member.nickname,
                    realName: member.realName,
                    memberCode: member.memberCode,
                    referrer: member.referrer
                },
                referrals: member.referrals,
                network
            }
        });
    } catch (error) {
        console.error('获取会员关系网失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取会员关系网失败: ' + error.message
        });
    }
});

module.exports = router;