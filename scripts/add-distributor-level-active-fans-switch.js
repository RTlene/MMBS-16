const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

async function ensureDistributorLevelActiveFansSwitch() {
  const qi = sequelize.getQueryInterface();
  const tableName = 'distributor_levels';
  const columnName = 'useActiveFansForUpgrade';

  try {
    const desc = await qi.describeTable(tableName);
    if (desc[columnName]) {
      console.log(`[INFO] Column ${columnName} already exists on ${tableName}.`);
      return;
    }
    console.log(`[INFO] Adding column ${columnName} to ${tableName}...`);
    await qi.addColumn(tableName, columnName, {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '粉丝条件是否按活跃粉丝判定（true=活跃粉丝，false=全部粉丝）'
    });
    console.log('[SUCCESS] Column added successfully.');
  } catch (error) {
    console.error('[ERROR] Failed to add column:', error);
    throw error;
  }
}

ensureDistributorLevelActiveFansSwitch()
  .then(() => sequelize.close())
  .catch(() => sequelize.close());

