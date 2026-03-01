/**
 * 为 coupons 表增加 userClaimLimit 列（每用户领取限量）
 * 运行：node scripts/add-coupon-user-claim-limit.js
 */
const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

async function ensureCouponUserClaimLimit() {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = 'coupons';
  const columnName = 'userClaimLimit';

  try {
    const desc = await queryInterface.describeTable(tableName);
    if (desc[columnName]) {
      console.log(`[INFO] Column ${columnName} already exists on ${tableName}.`);
      return;
    }

    console.log(`[INFO] Adding column ${columnName} to ${tableName}...`);
    await queryInterface.addColumn(tableName, columnName, {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: '每用户领取限量，null表示不限制'
    });
    console.log('[SUCCESS] Column added successfully.');
  } catch (error) {
    console.error('[ERROR] Failed to add column:', error);
    throw error;
  }
}

ensureCouponUserClaimLimit()
  .then(() => sequelize.close())
  .catch(() => sequelize.close());
