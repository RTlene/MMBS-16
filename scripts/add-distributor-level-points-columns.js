const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

async function ensureDistributorLevelPointsColumns() {
  const qi = sequelize.getQueryInterface();
  const tableName = 'distributor_levels';

  try {
    const desc = await qi.describeTable(tableName);
    if (!desc.minPoints) {
      console.log(`[INFO] Adding column minPoints to ${tableName}...`);
      await qi.addColumn(tableName, 'minPoints', {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '最低积分要求（分销自动升级）'
      });
    } else {
      console.log(`[INFO] Column minPoints already exists on ${tableName}.`);
    }
    const desc2 = await qi.describeTable(tableName);
    if (!desc2.maxPoints) {
      console.log(`[INFO] Adding column maxPoints to ${tableName}...`);
      await qi.addColumn(tableName, 'maxPoints', {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '最高积分限制（分销自动升级，空表示无上限）'
      });
    } else {
      console.log(`[INFO] Column maxPoints already exists on ${tableName}.`);
    }
    console.log('[SUCCESS] distributor_levels 积分列就绪。');
  } catch (error) {
    console.error('[ERROR] Failed:', error);
    throw error;
  }
}

ensureDistributorLevelPointsColumns()
  .then(() => sequelize.close())
  .catch(() => sequelize.close());
