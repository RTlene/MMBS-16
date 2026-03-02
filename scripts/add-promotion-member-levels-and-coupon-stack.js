/**
 * 促销表增加可参与会员等级；优惠券表增加是否与促销/会员权益同时生效
 * 运行：node scripts/add-promotion-member-levels-and-coupon-stack.js
 */
const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

async function run() {
  const qi = sequelize.getQueryInterface();

  try {
    const promDesc = await qi.describeTable('promotions');
    if (!promDesc.memberLevelIds) {
      console.log('[INFO] Adding promotions.memberLevelIds...');
      await qi.addColumn('promotions', 'memberLevelIds', {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '可参与会员等级ID数组，空或 null 表示全部会员可参与'
      });
      console.log('[SUCCESS] promotions.memberLevelIds added.');
    } else {
      console.log('[INFO] promotions.memberLevelIds already exists.');
    }
  } catch (e) {
    console.error('[ERROR] promotions.memberLevelIds:', e.message);
  }

  try {
    const coupDesc = await qi.describeTable('coupons');
    if (!coupDesc.stackWithPromotion) {
      console.log('[INFO] Adding coupons.stackWithPromotion...');
      await qi.addColumn('coupons', 'stackWithPromotion', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否可与促销同时生效，默认不可'
      });
      console.log('[SUCCESS] coupons.stackWithPromotion added.');
    } else {
      console.log('[INFO] coupons.stackWithPromotion already exists.');
    }
  } catch (e) {
    console.error('[ERROR] coupons.stackWithPromotion:', e.message);
  }

  try {
    const coupDesc2 = await qi.describeTable('coupons');
    if (!coupDesc2.stackWithMemberBenefit) {
      console.log('[INFO] Adding coupons.stackWithMemberBenefit...');
      await qi.addColumn('coupons', 'stackWithMemberBenefit', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否可与会员权益同时生效，默认不可'
      });
      console.log('[SUCCESS] coupons.stackWithMemberBenefit added.');
    } else {
      console.log('[INFO] coupons.stackWithMemberBenefit already exists.');
    }
  } catch (e) {
    console.error('[ERROR] coupons.stackWithMemberBenefit:', e.message);
  }
}

run()
  .then(() => sequelize.close())
  .catch(() => sequelize.close());
