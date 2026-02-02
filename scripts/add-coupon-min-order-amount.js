const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

async function ensureCouponMinOrderAmount() {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = 'coupons';
  const columnName = 'minOrderAmount';

  try {
    const desc = await queryInterface.describeTable(tableName);
    if (desc[columnName]) {
      console.log(`[INFO] Column ${columnName} already exists on ${tableName}.`);
      return;
    }

    console.log(`[INFO] Adding column ${columnName} to ${tableName}...`);
    await queryInterface.addColumn(tableName, columnName, {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: '最低订单金额要求'
    });
    console.log('[SUCCESS] Column added successfully.');
  } catch (error) {
    console.error('[ERROR] Failed to add column:', error);
    throw error;
  }
}

ensureCouponMinOrderAmount()
  .then(() => sequelize.close())
  .catch(() => sequelize.close());

