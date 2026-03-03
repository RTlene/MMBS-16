/**
 * 会员等级/分销等级再次整合：根据 remark 中的「原会员等级」「原分销等级」按匹配表更新为系统等级 ID
 *
 * 匹配表：
 *   普通会员 → 普通会员（会员等级）
 *   RCT-批发商 → 黑金（会员等级）
 *   RCT-合作人 → 合伙人（会员等级）
 *   个人分销商 → 分享达人（分销等级）
 *
 * 使用：node scripts/remap-member-levels-from-remark.js
 */
require('dotenv').config();
const path = require('path');
const { Member, MemberLevel, DistributorLevel } = require(path.join(__dirname, '..', 'db.js'));

// 原等级名 → 新系统等级名（会员等级）
const MEMBER_LEVEL_MAP = {
  '普通会员': '普通会员',
  'RCT-批发商': '黑金',
  'RCT-合作人': '合伙人',
};

// 原等级名 → 新系统等级名（分销等级）
const DISTRIBUTOR_LEVEL_MAP = {
  '个人分销商': '分享达人',
};

function parseRemarkLevels(remark) {
  if (!remark || typeof remark !== 'string') return { memberLevelName: null, distributorLevelName: null };
  const memberMatch = remark.match(/原会员等级\s*:\s*([^;]+)/);
  const distributorMatch = remark.match(/原分销等级\s*:\s*([^;]+)/);
  const trim = (s) => (s ? String(s).trim() : '');
  return {
    memberLevelName: memberMatch ? trim(memberMatch[1]) : null,
    distributorLevelName: distributorMatch ? trim(distributorMatch[1]) : null,
  };
}

async function main() {
  const memberLevelsByName = {};
  const memberLevels = await MemberLevel.findAll({ attributes: ['id', 'name'], where: { status: 'active' } });
  memberLevels.forEach((l) => { memberLevelsByName[l.name] = l.id; });

  const distributorLevelsByName = {};
  const distributorLevels = await DistributorLevel.findAll({ attributes: ['id', 'name'] });
  distributorLevels.forEach((l) => { distributorLevelsByName[l.name] = l.id; });

  console.log('会员等级名→ID:', memberLevelsByName);
  console.log('分销等级名→ID:', distributorLevelsByName);

  const members = await Member.findAll({
    attributes: ['id', 'nickname', 'memberCode', 'remark', 'memberLevelId', 'distributorLevelId'],
    where: Member.sequelize.where(
      Member.sequelize.literal("(remark LIKE '%原会员等级%' OR remark LIKE '%原分销等级%')"),
      true
    ),
  });

  console.log('待处理会员数（remark 含原等级）:', members.length);

  let updated = 0;
  const errors = [];

  for (const m of members) {
    const { memberLevelName: rawMember, distributorLevelName: rawDist } = parseRemarkLevels(m.remark);
    const newMemberName = rawMember ? MEMBER_LEVEL_MAP[rawMember] : null;
    const newDistName = rawDist ? DISTRIBUTOR_LEVEL_MAP[rawDist] : null;

    const newMemberLevelId = newMemberName ? memberLevelsByName[newMemberName] ?? null : null;
    const newDistLevelId = newDistName ? distributorLevelsByName[newDistName] ?? null : null;

    if (rawMember && !newMemberName) {
      errors.push({ id: m.id, memberCode: m.memberCode, msg: `未配置的会员等级: "${rawMember}"` });
    }
    if (rawDist && !newDistName) {
      errors.push({ id: m.id, memberCode: m.memberCode, msg: `未配置的分销等级: "${rawDist}"` });
    }
    if (newMemberName && newMemberLevelId == null) {
      errors.push({ id: m.id, memberCode: m.memberCode, msg: `系统中未找到会员等级: "${newMemberName}"` });
    }
    if (newDistName && newDistLevelId == null) {
      errors.push({ id: m.id, memberCode: m.memberCode, msg: `系统中未找到分销等级: "${newDistName}"` });
    }

    const needMember = newMemberLevelId != null;
    const needDist = newDistLevelId != null;
    const currentMemberId = m.memberLevelId != null ? Number(m.memberLevelId) : null;
    const currentDistId = m.distributorLevelId != null ? Number(m.distributorLevelId) : null;
    if (!needMember && !needDist) continue;
    if (needMember && currentMemberId === newMemberLevelId && needDist && currentDistId === newDistLevelId) continue;
    if (needMember && currentMemberId === newMemberLevelId && !needDist) continue;
    if (!needMember && needDist && currentDistId === newDistLevelId) continue;

    const payload = {};
    if (needMember) {
      payload.memberLevelId = newMemberLevelId;
      payload.memberLevelManualOverride = true;
    }
    if (needDist) {
      payload.distributorLevelId = newDistLevelId;
      payload.distributorLevelManualOverride = true;
    }
    await Member.update(payload, { where: { id: m.id } });
    updated++;
    if (updated <= 20) {
      console.log('更新:', m.id, m.memberCode || m.nickname, { memberLevelId: payload.memberLevelId, distributorLevelId: payload.distributorLevelId });
    }
  }

  console.log('已更新会员数:', updated);
  if (errors.length) {
    console.log('警告/未匹配:', errors.length);
    errors.slice(0, 30).forEach((e) => console.log(' ', e.id, e.memberCode, e.msg));
    if (errors.length > 30) console.log(' ... 及其余', errors.length - 30, '条');
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
