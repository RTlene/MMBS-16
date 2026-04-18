/**
 * 为 commission_withdrawals 增加 feeAmount、netAmount（提现手续费与应付净额）
 * 运行：node scripts/add_commission_withdrawal_fee_columns.js
 */
const { DataTypes } = require('sequelize');
require('dotenv').config();
const { sequelize } = require('../db');

const TABLE = 'commission_withdrawals';

async function run() {
    const q = sequelize.getQueryInterface();
    const desc = await q.describeTable(TABLE);
    if (!desc.feeAmount) {
        await q.addColumn(TABLE, 'feeAmount', {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0,
            comment: '提现手续费（元）'
        });
        console.log('[OK] 已添加 feeAmount');
    } else {
        console.log('[INFO] feeAmount 已存在');
    }
    if (!desc.netAmount) {
        await q.addColumn(TABLE, 'netAmount', {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
            comment: '扣除手续费后应付金额（元）'
        });
        console.log('[OK] 已添加 netAmount');
        await sequelize.query(`UPDATE \`${TABLE}\` SET netAmount = amount WHERE netAmount IS NULL`);
        console.log('[OK] 已回填 netAmount = amount');
    } else {
        console.log('[INFO] netAmount 已存在');
    }
}

run()
    .then(() => sequelize.close())
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
