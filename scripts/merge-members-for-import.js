/**
 * 将现役系统会员表按导入模板整合为一份导入用 CSV
 * 输入：docs/会员信息20260227114848.xlsx（现役系统）
 * 模板：docs/members_import_template.csv（系统导入模板）
 * 输出：docs/members_import_merged.csv
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { parseCsv, toCsv } = require('../utils/csv');

const DOCS = path.join(__dirname, '../docs');
const SOURCE_XLSX = path.join(DOCS, '会员信息20260227114848.xlsx');
const TEMPLATE_CSV = path.join(DOCS, 'members_import_template.csv');
const OUTPUT_CSV = path.join(DOCS, 'members_import_merged.csv');

// 模板表头顺序（从模板第一行取）
const templateText = fs.readFileSync(TEMPLATE_CSV, 'utf8');
const templateRows = parseCsv(templateText);
const HEADERS = templateRows[0].map((h) => (h || '').trim());

function normalizeDate(v) {
  if (v == null || String(v).trim() === '') return '';
  const s = String(v).trim();
  const m = s.match(/^(\d{4})[-\/]?(\d{1,2})[-\/]?(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const m2 = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return s;
}

function normalizeDateTime(v) {
  if (v == null || String(v).trim() === '') return '';
  const s = String(v).trim();
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 19).replace('T', ' ');
  return s;
}

function get(r, key) {
  const v = r[key];
  return v == null ? '' : String(v).trim();
}

function getNum(r, key) {
  const v = r[key];
  if (v == null || v === '') return 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function main() {
  const wb = XLSX.readFile(SOURCE_XLSX);
  const sh = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });
  const sourceHeaders = raw[0].map((h) => (h || '').trim());
  const sourceRows = raw.slice(1);

  const rows = sourceRows.map((arr) => {
    const r = {};
    sourceHeaders.forEach((h, i) => {
      r[h] = arr[i];
    });
    return r;
  });

  const outRows = rows.map((r) => {
    const openid = get(r, 'openid');
    const nickname = get(r, '用户昵称') || get(r, '用户名称') || '';
    const realName = get(r, '用户名称') || '';
    const phone = get(r, '手机号码') || '';
    const birthday = normalizeDate(get(r, '生日'));
    const address = get(r, '地址') || '';
    const points = getNum(r, '积分');
    const memberLevel = get(r, '会员等级') || '';
    const distributorLevel = get(r, '分销等级') || '';
    const balance = get(r, '余额');
    const regTime = get(r, '注册时间') || '';
    const userId = get(r, '用户ID') || '';
    const referrerId = get(r, '推荐人ID') || '';

    const remarkParts = [];
    if (memberLevel) remarkParts.push('原会员等级:' + memberLevel);
    if (distributorLevel) remarkParts.push('原分销等级:' + distributorLevel);
    if (regTime) remarkParts.push('注册时间:' + regTime);
    if (balance !== '' && balance != null) remarkParts.push('原余额:' + balance);
    const remark = remarkParts.join('; ');

    const row = {};
    HEADERS.forEach((h) => {
      row[h] = '';
    });
    row.id = '';
    row.nickname = nickname || (openid ? '微信用户' : '');
    row.openid = openid;
    row.unionid = '';
    row.memberLevelId = '';
    row.distributorLevelId = '';
    row.teamExpansionLevelId = '';
    row.memberCode = userId || '';
    row.realName = realName;
    row.phone = phone;
    row.avatar = '';
    row.gender = '';
    row.birthday = birthday;
    row.province = '';
    row.city = '';
    row.district = '';
    row.address = address;
    row.status = 'active';
    row.totalPoints = points;
    row.availablePoints = points;
    row.frozenPoints = 0;
    row.totalSales = 0;
    row.directSales = 0;
    row.indirectSales = 0;
    row.totalCommission = 0;
    row.availableCommission = 0;
    row.frozenCommission = 0;
    row.totalTeamIncentive = 0;
    row.availableTeamIncentive = 0;
    row.frozenTeamIncentive = 0;
    row.directFans = 0;
    row.totalFans = 0;
    row.directDistributors = 0;
    row.totalDistributors = 0;
    row.referrerId = referrerId;
    row.referrerPath = '';
    row.fanIds = '';
    row.distributorIds = '';
    row.teamLevel = '';
    row.teamPath = '';
    row.monthlySales = 0;
    row.lastCommissionCalculation = '';
    row.personalDirectCommissionRate = '';
    row.personalIndirectCommissionRate = '';
    row.personalCostRate = '';
    row.totalReferrals = 0;
    row.directReferrals = 0;
    row.indirectReferrals = 0;
    row.levelHistory = '';
    row.remark = remark;
    row.lastActiveAt = regTime || '';

    return HEADERS.map((h) => (row[h] !== undefined && row[h] !== null ? row[h] : ''));
  });

  const csv = toCsv(HEADERS, outRows);
  fs.writeFileSync(OUTPUT_CSV, csv, 'utf8');
  console.log('已生成:', OUTPUT_CSV);
  console.log('模板列数:', HEADERS.length);
  console.log('导入行数:', outRows.length);
}

main();
