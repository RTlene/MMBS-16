const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

async function ensurePointProductColumns() {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = 'point_products';

  try {
    const desc = await queryInterface.describeTable(tableName);

    if (!desc.productId) {
      console.log('[INFO] Adding productId to point_products...');
      await queryInterface.addColumn(tableName, 'productId', {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '关联商品ID'
      });
      console.log('[SUCCESS] productId added.');
    } else {
      console.log('[INFO] Column productId already exists.');
    }

    if (!desc.skuId) {
      console.log('[INFO] Adding skuId to point_products...');
      await queryInterface.addColumn(tableName, 'skuId', {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '关联SKU ID'
      });
      console.log('[SUCCESS] skuId added.');
    } else {
      console.log('[INFO] Column skuId already exists.');
    }
  } catch (error) {
    console.error('[ERROR] Failed to update point_products table:', error);
    throw error;
  }
}

ensurePointProductColumns()
  .then(() => sequelize.close())
  .catch(() => sequelize.close());

