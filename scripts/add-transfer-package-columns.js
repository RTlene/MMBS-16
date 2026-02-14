/**
 * 为 commission_withdrawals 表增加 transferBillNo、transferPackageInfo 字段
 * 用于保存升级版商家转账的微信单号与调起确认收款的 package，便于用户稍后在小程序内确认收款
 * 运行：node scripts/add-transfer-package-columns.js（需配置好 .env 数据库）
 */
const { DataTypes } = require('sequelize');
require('dotenv').config();
const { sequelize } = require('../db');

const TABLE = 'commission_withdrawals';

async function run() {
  const q = sequelize.getQueryInterface();
  const desc = await q.describeTable(TABLE);
  if (desc.transferBillNo && desc.transferPackageInfo) {
    console.log('[INFO] 字段已存在，跳过');
    return;
  }
  if (!desc.transferBillNo) {
    await q.addColumn(TABLE, 'transferBillNo', {
      type: DataTypes.STRING(64),
      allowNull: true,
      comment: '微信转账单号（升级版商家转账返回）'
    });
    console.log('[OK] 已添加 transferBillNo');
  }
  if (!desc.transferPackageInfo) {
    await q.addColumn(TABLE, 'transferPackageInfo', {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '调起确认收款用 package，WAIT_USER_CONFIRM 时需用户在小程序内确认'
    });
    console.log('[OK] 已添加 transferPackageInfo');
  }
}

run()
  .then(() => sequelize.close())
  .catch((e) => { console.error(e); process.exit(1); });
