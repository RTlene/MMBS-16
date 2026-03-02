/**
 * 为 members 表增加「等级手动覆盖」字段，用于：
 * - 手动设置的会员等级/分销等级优先于自动升级，且不会被自动升级覆盖或降级
 * 执行：node scripts/add-member-level-override-columns.js
 */
const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const columns = [
  {
    name: 'memberLevelManualOverride',
    def: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '会员等级是否手动设置（true 时自动升级不覆盖、不降级）'
    }
  },
  {
    name: 'distributorLevelManualOverride',
    def: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '分销等级是否手动设置（true 时自动升级不覆盖、不降级）'
    }
  }
];

async function run() {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = 'members';
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
