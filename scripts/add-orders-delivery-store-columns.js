/**
 * 为 orders 表增加 deliveryType、storeId 列（门店自提功能）
 * 用法：node scripts/add-orders-delivery-store-columns.js
 * 需配置好环境变量（如 .env）中的数据库连接。
 */
const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

async function run() {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = 'orders';

  try {
    const tableDescription = await queryInterface.describeTable(tableName);

    if (!tableDescription.deliveryType) {
      console.log('[INFO] Adding column deliveryType to orders...');
      await queryInterface.addColumn(tableName, 'deliveryType', {
        type: DataTypes.ENUM('delivery', 'pickup'),
        allowNull: true,
        defaultValue: 'delivery',
        comment: '配送方式：delivery-配送上门，pickup-门店自提'
      });
      console.log('[SUCCESS] deliveryType added.');
    } else {
      console.log('[INFO] Column deliveryType already exists.');
    }

    if (!tableDescription.storeId) {
      console.log('[INFO] Adding column storeId to orders...');
      await queryInterface.addColumn(tableName, 'storeId', {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '门店自提时的门店ID'
      });
      console.log('[SUCCESS] storeId added.');
    } else {
      console.log('[INFO] Column storeId already exists.');
    }
  } catch (error) {
    console.error('[ERROR] Migration failed:', error.message);
    throw error;
  } finally {
    await sequelize.close();
  }
}

run().catch(() => process.exit(1));
