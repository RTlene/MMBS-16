const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

async function ensureIsHotColumn() {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = 'Products';
  const columnName = 'isHot';

  try {
    const tableDescription = await queryInterface.describeTable(tableName);
    if (tableDescription[columnName]) {
      console.log(`[INFO] Column ${columnName} already exists on ${tableName}.`);
      return;
    }

    console.log(`[INFO] Adding column ${columnName} to ${tableName}...`);
    await queryInterface.addColumn(tableName, columnName, {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '是否热门商品'
    });
    console.log('[SUCCESS] Column added successfully.');
  } catch (error) {
    console.error('[ERROR] Failed to add column:', error);
    throw error;
  }
}

ensureIsHotColumn()
  .then(() => sequelize.close())
  .catch(() => sequelize.close());

