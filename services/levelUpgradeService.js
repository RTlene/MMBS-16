/**
 * 等级自动升级服务
 * 根据会员等级/分销等级中「启用自动升级」的等级条件，将会员/分销商自动调整到满足条件的最高等级。
 */
const { Op } = require('sequelize');
const { Member, MemberLevel, DistributorLevel, MemberLevelChangeRecord } = require('../db');

class LevelUpgradeService {
    /**
     * 按推荐关系重算某会员的 directFans（直接推荐人数）与 totalFans（直接+间接人数），并写回数据库
     */
    static async updateMemberFans(memberId) {
        const member = await Member.findByPk(memberId, { attributes: ['id'] });
        if (!member) return;
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
     */
    static async updateFansAndUpgradeUpline(memberId) {
        await this.updateMemberFans(memberId);
        await this.tryUpgradeMember(memberId);
        const chain = await this.getUplineChain(memberId);
        for (const id of chain) {
            await this.updateMemberFans(id);
            await this.tryUpgradeMember(id);
        }
    }

    /**
     * 会员信息变更后：对该会员做升级检查；若推荐人变更则对旧/新推荐人整条上级链重算粉丝并做升级检查
     */
    static async onMemberDataChanged(memberId, options = {}) {
        const { oldReferrerId, newReferrerId } = options;
        try {
            await this.tryUpgradeMember(memberId);
        } catch (e) {
            console.error('[等级升级] 该会员检查失败:', e);
        }
        if (oldReferrerId !== undefined && newReferrerId !== undefined && oldReferrerId !== newReferrerId) {
            try {
                if (oldReferrerId) await this.updateFansAndUpgradeUpline(oldReferrerId);
                if (newReferrerId) await this.updateFansAndUpgradeUpline(newReferrerId);
            } catch (e) {
                console.error('[等级升级] 上级链粉丝/升级检查失败:', e);
            }
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
            attributes: ['id', 'name', 'level', 'minSales', 'maxSales', 'minFans', 'maxFans']
        });
        const sales = parseFloat(totalSales) || 0;
        const fans = parseInt(totalFans, 10) || 0;
        for (const lv of levels) {
            const minS = parseFloat(lv.minSales) || 0;
            const maxS = lv.maxSales != null ? parseFloat(lv.maxSales) : null;
            const minF = parseInt(lv.minFans, 10) || 0;
            const maxF = lv.maxFans != null ? parseInt(lv.maxFans, 10) : null;
            if (sales >= minS && (maxS == null || sales <= maxS) &&
                fans >= minF && (maxF == null || fans <= maxF)) return lv;
        }
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
     */
    static async tryUpgradeDistributorLevel(memberId) {
        const member = await Member.findByPk(memberId, {
            attributes: ['id', 'distributorLevelId', 'totalSales', 'totalFans']
        });
        if (!member) return { changed: false };
        const eligible = await this.getEligibleDistributorLevel(member.totalSales, member.totalFans);
        const currentId = member.distributorLevelId ? parseInt(member.distributorLevelId, 10) : null;
        const newId = eligible ? eligible.id : null;
        if (newId === currentId) return { changed: false };
        await member.update({ distributorLevelId: newId });
        if (newId != null) {
            await MemberLevelChangeRecord.create({
                memberId: member.id,
                levelType: 'distributor',
                oldLevelId: currentId,
                newLevelId: newId,
                reason: 'auto_upgrade',
                description: `自动升级：销售额 ${member.totalSales}、粉丝 ${member.totalFans} 满足等级「${eligible.name}」条件`
            });
        }
        return { changed: true, newLevelId: newId, newLevelName: eligible ? eligible.name : null };
    }

    /**
     * 对指定会员执行会员等级 + 分销等级自动升级检查
     */
    static async tryUpgradeMember(memberId) {
        const results = { memberLevel: { changed: false }, distributorLevel: { changed: false } };
        try {
            results.memberLevel = await this.tryUpgradeMemberLevel(memberId);
        } catch (e) {
            console.error('[等级自动升级] 会员等级检查失败 memberId=%s:', memberId, e.message);
        }
        try {
            results.distributorLevel = await this.tryUpgradeDistributorLevel(memberId);
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
