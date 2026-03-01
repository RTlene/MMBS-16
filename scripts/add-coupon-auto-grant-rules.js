/**
 * 为 coupons 表增加 autoGrantRules 列（自动发放条件）
 * 运行：node scripts/add-coupon-auto-grant-rules.js
 */
const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

async function ensureCouponAutoGrantRules() {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = 'coupons';
  const columnName = 'autoGrantRules';

  try {
    const desc = await queryInterface.describeTable(tableName);
    if (desc[columnName]) {
      console.log(`[INFO] Column ${columnName} already exists on ${tableName}.`);
      return;
    }

    console.log(`[INFO] Adding column ${columnName} to ${tableName}...`);
    await queryInterface.addColumn(tableName, columnName, {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '自动发放条件，仅 distributionMode=auto 时有效'
    });
    console.log('[SUCCESS] Column added successfully.');
  } catch (error) {
    console.error('[ERROR] Failed to add column:', error);
    throw error;
  }
}

ensureCouponAutoGrantRules()
  .then(() => sequelize.close())
  .catch(() => sequelize.close());
