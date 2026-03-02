/**
 * 为 member_levels 表增加 discountRate、pointsRate 列（若不存在）
 * 执行：node scripts/add-member-level-discount-points-columns.js
 */
const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const columns = [
  {
    name: 'discountRate',
    def: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      defaultValue: 1,
      comment: '会员折扣率（0-1，如 0.9 表示 9 折）'
    }
  },
  {
    name: 'pointsRate',
    def: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      defaultValue: 1,
      comment: '积分获得倍率（如 1.5 表示 1.5 倍）'
    }
  }
];

async function run() {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = 'member_levels';
  for (const { name, def } of columns) {
    try {
      const tableDescription = await queryInterface.describeTable(tableName);
      if (tableDescription[name]) {
        console.log(`[INFO] Column ${name} already exists on ${tableName}.`);
        continue;
      }
      console.log(`[INFO] Adding column ${name} to ${tableName}...`);
      await queryInterface.addColumn(tableName, name, def);
      console.log(`[SUCCESS] ${name} added.`);
    } catch (error) {
      console.error(`[ERROR] Failed to add ${name}:`, error);
      throw error;
    }
  }
}

run()
  .then(() => sequelize.close())
  .catch((e) => { sequelize.close(); process.exit(1); });
