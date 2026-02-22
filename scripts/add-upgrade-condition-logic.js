/**
 * 为 distributor_levels 表添加 upgradeConditionLogic 列（与/或条件）
 * 运行: node scripts/add-upgrade-condition-logic.js
 */
require('dotenv').config();
const { sequelize } = require('../db');

async function main() {
    try {
        await sequelize.query(`
            ALTER TABLE distributor_levels
            ADD COLUMN upgradeConditionLogic ENUM('and', 'or') NOT NULL DEFAULT 'and'
            COMMENT '自动升级条件关系：and=粉丝与销售额都满足，or=满足其一即可'
            AFTER enableAutoUpgrade
        `);
        console.log('已添加 upgradeConditionLogic 列');
    } catch (e) {
        if (e.message && e.message.includes('Duplicate column')) {
            console.log('列已存在，跳过');
        } else {
            throw e;
        }
    } finally {
        await sequelize.close();
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
