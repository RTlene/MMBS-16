/**
 * 按导入表表头整合：读取已合并的导入 CSV，根据 remark 中的原等级做匹配表映射，
 * 填好 memberLevelId、distributorLevelId，输出一份可直接用于导入的 CSV（不写数据库）。
 *
 * 匹配表：普通会员→普通会员、RCT-批发商→黑金、RCT-合作人→合伙人、个人分销商→分享达人
 *
 * 若你系统里等级 ID 不同，请修改下方「目标等级 ID」配置后重新运行。
 *
 * 使用：node scripts/remap-merged-csv-levels.js
 */
const fs = require('fs');
const path = require('path');
const { parseCsv, toCsv, rowsToObjects } = require(path.join(__dirname, '..', 'utils', 'csv'));

const DOCS = path.join(__dirname, '..', 'docs');
const TEMPLATE_CSV = path.join(DOCS, 'members_import_template.csv');
const MERGED_CSV = path.join(DOCS, 'members_import_merged.csv');
const OUTPUT_CSV = path.join(DOCS, 'members_import_remapped.csv');

// 原等级名 → 目标等级名（与后台「等级管理」中名称一致）
const MEMBER_LEVEL_MAP = {
  '普通会员': '普通会员',
  'RCT-批发商': '黑金',
  'RCT-合作人': '合伙人',
};
const DISTRIBUTOR_LEVEL_MAP = {
  '个人分销商': '分享达人',
};

// 目标等级名 → 系统等级 ID（请按你后台实际 ID 修改）
const MEMBER_LEVEL_IDS = {
  '普通会员': 1,
  '黑金': 8,
  '合伙人': 12,
};
const DISTRIBUTOR_LEVEL_IDS = {
  '分享达人': 7,
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

function main() {
  const templateText = fs.readFileSync(TEMPLATE_CSV, 'utf8');
  const templateRows = parseCsv(templateText);
  const HEADERS = templateRows[0].map((h) => (h || '').trim());

  const mergedText = fs.readFileSync(MERGED_CSV, 'utf8');
  const mergedRows = parseCsv(mergedText);
  const rows = rowsToObjects(mergedRows);

  let filled = 0;
  const outRows = rows.map((r) => {
    const remark = (r.remark || '').trim();
    const { memberLevelName: rawMember, distributorLevelName: rawDist } = parseRemarkLevels(remark);

    const targetMemberName = rawMember ? MEMBER_LEVEL_MAP[rawMember] : null;
    const targetDistName = rawDist ? DISTRIBUTOR_LEVEL_MAP[rawDist] : null;

    const memberLevelId = targetMemberName && MEMBER_LEVEL_IDS[targetMemberName] != null
      ? String(MEMBER_LEVEL_IDS[targetMemberName])
      : (r.memberLevelId ?? '');
    const distributorLevelId = targetDistName && DISTRIBUTOR_LEVEL_IDS[targetDistName] != null
      ? String(DISTRIBUTOR_LEVEL_IDS[targetDistName])
      : (r.distributorLevelId ?? '');

    if (memberLevelId || distributorLevelId) filled++;

    const out = { ...r };
    out.memberLevelId = memberLevelId;
    out.distributorLevelId = distributorLevelId;
    return HEADERS.map((h) => (out[h] !== undefined && out[h] !== null ? String(out[h]) : ''));
  });

  const csv = toCsv(HEADERS, outRows);
  fs.writeFileSync(OUTPUT_CSV, csv, 'utf8');
  console.log('已输出:', OUTPUT_CSV);
  console.log('总行数:', outRows.length);
  console.log('已填等级行数:', filled);
}

main();
