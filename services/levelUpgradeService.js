/**
 * 等级自动升级服务
 * 根据会员等级/分销等级中「启用自动升级」的等级条件，将会员/分销商自动调整到满足条件的最高等级。
 */
const { Op } = require('sequelize');
const { Member, MemberLevel, DistributorLevel, MemberLevelChangeRecord } = require('../db');

class LevelUpgradeService {
    /**
     * 按推荐关系重算某会员的 directFans（直接推荐人数）与 totalFans（直接+间接人数），并写回数据库
     * @returns {{ directFans: number, totalFans: number } | null}
     */
    static async updateMemberFans(memberId) {
        const member = await Member.findByPk(memberId, { attributes: ['id'] });
        if (!member) return null;
        const directFans = await Member.count({ where: { referrerId: memberId } });
        const directIds = await Member.findAll({
            where: { referrerId: memberId },
            attributes: ['id'],
            raw: true
        }).then(rows => rows.map(r => r.id));
        const indirectCount = directIds.length > 0
            ? await Member.count({ where: { referrerId: { [Op.in]: directIds } } })
            : 0;
        const totalFans = directFans + indirectCount;
        await Member.update(
            { directFans, totalFans },
            { where: { id: memberId } }
        );
        return { directFans, totalFans };
    }

    /**
     * 获取从某会员起向上整条推荐链的 ID 列表（不含本人）
     */
    static async getUplineChain(memberId) {
        const chain = [];
        let currentId = memberId ? parseInt(memberId, 10) : null;
        while (currentId) {
            const m = await Member.findByPk(currentId, { attributes: ['id', 'referrerId'] });
            if (!m) break;
            const nextId = m.referrerId ? parseInt(m.referrerId, 10) : null;
            if (nextId) chain.push(nextId);
            currentId = nextId;
        }
        return chain;
    }

    /**
     * 对某会员及其整条上级链：先重算粉丝数，再执行等级升级检查（用于推荐关系变更后，从该会员起向上整链）
     * 使用刚写入的粉丝数做升级判断，避免同一请求内读库拿到旧快照导致不升级
     */
    static async updateFansAndUpgradeUpline(memberId) {
        const fans = await this.updateMemberFans(memberId);
        await this.tryUpgradeMember(memberId, fans ? { totalFans: fans.totalFans } : undefined);
        const chain = await this.getUplineChain(memberId);
        for (const id of chain) {
            const nextFans = await this.updateMemberFans(id);
            await this.tryUpgradeMember(id, nextFans ? { totalFans: nextFans.totalFans } : undefined);
        }
    }

    /**
     * 会员信息变更后：对该会员做升级检查；若推荐人变更则对旧/新推荐人整条上级链重算粉丝并做升级检查
     */
    static async onMemberDataChanged(memberId, options = {}) {
        const { oldReferrerId, newReferrerId } = options;
        const oldId = oldReferrerId != null && oldReferrerId >= 1 ? oldReferrerId : null;
        const newId = newReferrerId != null && newReferrerId >= 1 ? newReferrerId : null;
        try {
            await this.tryUpgradeMember(memberId);
        } catch (e) {
            console.error('[等级升级] 该会员检查失败:', e);
        }
        if (oldId !== newId) {
            try {
                if (oldId) {
                    console.log('[等级升级] 旧推荐人链 fans+升级 memberId=%s', oldId);
                    await this.updateFansAndUpgradeUpline(oldId);
                }
                if (newId) {
                    console.log('[等级升级] 新推荐人链 fans+升级 memberId=%s', newId);
                    await this.updateFansAndUpgradeUpline(newId);
                }
            } catch (e) {
                console.error('[等级升级] 上级链粉丝/升级检查失败:', e);
            }
        } else {
            console.log('[等级升级] 推荐人未变化 oldReferrerId=%s newReferrerId=%s 跳过上级链', oldId, newId);
        }
    }

    /**
     * 获取会员当前积分应匹配的会员等级（仅考虑启用自动升级的等级，按 level 降序取最高满足的）
     */
    static async getEligibleMemberLevel(totalPoints) {
        const levels = await MemberLevel.findAll({
            where: { status: 'active', enableAutoUpgrade: true },
            order: [['level', 'DESC']],
            attributes: ['id', 'name', 'level', 'minPoints', 'maxPoints']
        });
        const points = parseInt(totalPoints, 10) || 0;
        for (const lv of levels) {
            const min = parseInt(lv.minPoints, 10) || 0;
            const max = lv.maxPoints != null ? parseInt(lv.maxPoints, 10) : null;
            if (points >= min && (max == null || points <= max)) return lv;
        }
        return null;
    }

    /**
     * 获取会员当前销售额、粉丝数应匹配的分销等级（仅考虑启用自动升级的等级，按 level 降序取最高满足的）
     */
    static async getEligibleDistributorLevel(totalSales, totalFans) {
        const levels = await DistributorLevel.findAll({
            where: { status: 'active', enableAutoUpgrade: true },
            order: [['level', 'DESC']],
            attributes: ['id', 'name', 'level', 'minSales', 'maxSales', 'minFans', 'maxFans', 'upgradeConditionLogic']
        });
        const sales = parseFloat(totalSales) || 0;
        const fans = parseInt(totalFans, 10) || 0;
        if (levels.length === 0) {
            console.log('[等级升级] 无启用自动升级的分销等级，totalSales=%s totalFans=%s', sales, fans);
            return null;
        }
        for (const lv of levels) {
            const minS = parseFloat(lv.minSales) || 0;
            let maxS = lv.maxSales != null && lv.maxSales !== '' ? parseFloat(lv.maxSales) : null;
            if (maxS !== null && maxS <= 0) maxS = null; // 0 或未填表示无上限
            const minF = parseInt(lv.minFans, 10) || 0;
            let maxF = lv.maxFans != null && lv.maxFans !== '' ? parseInt(lv.maxFans, 10) : null;
            if (maxF !== null && maxF <= 0) maxF = null; // 0 或未填表示无上限
            const okSales = sales >= minS && (maxS == null || sales <= maxS);
            const okFans = fans >= minF && (maxF == null || fans <= maxF);
            const logic = (lv.upgradeConditionLogic === 'or') ? 'or' : 'and';
            const ok = logic === 'or' ? (okSales || okFans) : (okSales && okFans);
            console.log('[等级升级] 等级「%s」条件关系=%s minSales=%s maxSales=%s minFans=%s maxFans=%s -> salesOk=%s fansOk=%s', lv.name, logic, minS, maxS, minF, maxF, okSales, okFans);
            if (ok) {
                console.log('[等级升级] 匹配分销等级 totalSales=%s totalFans=%s -> 等级「%s」', sales, fans, lv.name);
                return lv;
            }
        }
        console.log('[等级升级] 未匹配任何分销等级 totalSales=%s totalFans=%s（已查 %s 个启用自动升级等级）', sales, fans, levels.length);
        return null;
    }

    /**
     * 尝试将会员等级更新为「满足条件的最高等级」（仅当启用自动升级的等级存在且与当前不同时更新）
     */
    static async tryUpgradeMemberLevel(memberId) {
        const member = await Member.findByPk(memberId, { attributes: ['id', 'memberLevelId', 'totalPoints'] });
        if (!member) return { changed: false };
        const eligible = await this.getEligibleMemberLevel(member.totalPoints);
        const currentId = member.memberLevelId ? parseInt(member.memberLevelId, 10) : null;
        const newId = eligible ? eligible.id : null;
        if (newId === currentId) return { changed: false };
        await member.update({ memberLevelId: newId });
        if (newId != null) {
            await MemberLevelChangeRecord.create({
                memberId: member.id,
                levelType: 'member',
                oldLevelId: currentId,
                newLevelId: newId,
                reason: 'auto_upgrade',
                description: `自动升级：积分 ${member.totalPoints} 满足等级「${eligible.name}」条件`
            });
        }
        return { changed: true, newLevelId: newId, newLevelName: eligible ? eligible.name : null };
    }

    /**
     * 尝试将分销等级更新为「满足条件的最高等级」
     * 销售额条件使用「总销售额」totalSales。
     * @param {number} memberId
     * @param {{ totalSales?: number, totalFans?: number }} [override] 若在刚重算粉丝后调用，可传入避免读库拿到旧值
     */
    static async tryUpgradeDistributorLevel(memberId, override) {
        const member = await Member.findByPk(memberId, {
            attributes: ['id', 'distributorLevelId', 'totalSales', 'totalFans']
        });
        if (!member) return { changed: false };
        const totalSales = override && override.totalSales !== undefined ? override.totalSales : member.totalSales;
        const totalFans = override && override.totalFans !== undefined ? override.totalFans : member.totalFans;
        console.log('[等级升级] 分销等级检查 memberId=%s totalSales=%s totalFans=%s (override=%s)', memberId, totalSales, totalFans, override ? '是' : '否');
        const eligible = await this.getEligibleDistributorLevel(totalSales, totalFans);
        const currentId = member.distributorLevelId ? parseInt(member.distributorLevelId, 10) : null;
        const newId = eligible ? eligible.id : null;
        if (newId === currentId) {
            console.log('[等级升级] 分销等级未变更 memberId=%s 当前已是 levelId=%s', memberId, currentId);
            return { changed: false };
        }
        console.log('[等级升级] 执行分销等级变更 memberId=%s %s -> %s', memberId, currentId, newId);
        await member.update({ distributorLevelId: newId });
        if (newId != null) {
            await MemberLevelChangeRecord.create({
                memberId: member.id,
                levelType: 'distributor',
                oldLevelId: currentId,
                newLevelId: newId,
                reason: 'auto_upgrade',
                description: `自动升级：总销售额 ${totalSales}、粉丝 ${totalFans} 满足等级「${eligible.name}」条件`
            });
        }
        return { changed: true, newLevelId: newId, newLevelName: eligible ? eligible.name : null };
    }

    /**
     * 对指定会员执行会员等级 + 分销等级自动升级检查
     * @param {number} memberId
     * @param {{ totalFans?: number, totalSales?: number }} [override] 刚重算粉丝后传入，避免读库拿到旧值
     */
    static async tryUpgradeMember(memberId, override) {
        const results = { memberLevel: { changed: false }, distributorLevel: { changed: false } };
        try {
            results.memberLevel = await this.tryUpgradeMemberLevel(memberId);
        } catch (e) {
            console.error('[等级自动升级] 会员等级检查失败 memberId=%s:', memberId, e.message);
        }
        try {
            results.distributorLevel = await this.tryUpgradeDistributorLevel(memberId, override);
        } catch (e) {
            console.error('[等级自动升级] 分销等级检查失败 memberId=%s:', memberId, e.message);
        }
        return results;
    }

    /**
     * 对所有会员执行自动升级检查（用于后台手动「全量重算」）
     */
    static async runForAllMembers() {
        const members = await Member.findAll({
            attributes: ['id'],
            where: { status: { [Op.in]: ['active', 'inactive'] } }
        });
        let memberUpgraded = 0;
        let distributorUpgraded = 0;
        for (const m of members) {
            const r = await this.tryUpgradeMember(m.id);
            if (r.memberLevel.changed) memberUpgraded++;
            if (r.distributorLevel.changed) distributorUpgraded++;
        }
        return { total: members.length, memberUpgraded, distributorUpgraded };
    }
}

module.exports = LevelUpgradeService;
