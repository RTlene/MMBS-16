const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const TABLE = 'product_member_prices';

async function ensureProductMemberPricesTable() {
  const qi = sequelize.getQueryInterface();

  try {
    await qi.describeTable(TABLE);
    console.log(`[INFO] Table ${TABLE} already exists.`);
    return;
  } catch (_) {
    // 表不存在则创建
  }

  console.log(`[INFO] Creating table ${TABLE}...`);
  await qi.createTable(TABLE, {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '商品ID'
    },
    memberLevelId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '会员等级ID'
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: '会员价（不参与优惠计算）'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  });

  await qi.addIndex(TABLE, ['productId', 'memberLevelId'], { unique: true });
  console.log('[SUCCESS] Table and unique index created.');
}

ensureProductMemberPricesTable()
  .then(() => sequelize.close())
  .catch((err) => {
    console.error('[ERROR]', err);
    process.exitCode = 1;
    sequelize.close();
  });
