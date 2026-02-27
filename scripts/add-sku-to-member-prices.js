/**
 * 为 product_member_prices 表增加 skuId 列（0=整品默认），并更新唯一索引为 (productId, memberLevelId, skuId)
 * 运行: node scripts/add-sku-to-member-prices.js
 */
const { sequelize } = require('../db');
const { DataTypes } = require('sequelize');

async function up() {
  const qi = sequelize.getQueryInterface();
  const table = 'product_member_prices';
  const dialect = sequelize.getDialect();

  const desc = await qi.describeTable(table).catch(() => ({}));
  if (!desc.skuId) {
    await qi.addColumn(table, 'skuId', {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
    await sequelize.query(`UPDATE ${table} SET skuId = 0`);
    console.log('[OK] Added skuId column');
  }

  if (dialect === 'mysql') {
    const [rows] = await sequelize.query(`SHOW INDEX FROM \`${table}\` WHERE Non_unique = 0 AND Key_name != 'PRIMARY'`);
    for (const row of rows || []) {
      const name = row.Key_name;
      if (name && (name.includes('product_id') && name.includes('member_level_id') && !name.includes('sku_id'))) {
        await sequelize.query(`ALTER TABLE \`${table}\` DROP INDEX \`${name}\``);
        console.log('[OK] Dropped old unique index:', name);
        break;
      }
    }
  } else {
    try { await qi.removeIndex(table, 'product_member_prices_product_id_member_level_id'); } catch (_) {}
  }

  try {
    await qi.addIndex(table, ['productId', 'memberLevelId', 'skuId'], { unique: true });
    console.log('[OK] New unique index added');
  } catch (e) {
    if (!e.message || !e.message.includes('already exists')) console.error('addIndex:', e.message);
  }
}

up()
  .then(() => sequelize.close())
  .catch((e) => { console.error(e); process.exit(1); });
