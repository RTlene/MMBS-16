/**
 * 检查数据库中的订单数据
 */

require('dotenv').config();
const { Order, Member, OrderItem } = require('../db');

async function checkOrders() {
    try {
        console.log('开始检查订单数据...\n');

        // 1. 查询订单总数
        const totalCount = await Order.count();
        console.log(`订单总数: ${totalCount}`);

        if (totalCount === 0) {
            console.log('\n数据库中没有订单数据！');
            return;
        }

        // 2. 查询最近的10个订单
        const recentOrders = await Order.findAll({
            limit: 10,
            order: [['createdAt', 'DESC']],
            include: [
                { 
                    model: Member, 
                    as: 'member', 
                    attributes: ['id', 'nickname', 'phone'],
                    required: false
                },
                {
                    model: OrderItem,
                    as: 'items',
                    required: false
                }
            ]
        });

        console.log(`\n最近的 ${recentOrders.length} 个订单:`);
        console.log('='.repeat(80));

        recentOrders.forEach((order, index) => {
            console.log(`\n订单 ${index + 1}:`);
            console.log(`  订单ID: ${order.id}`);
            console.log(`  订单号: ${order.orderNo}`);
            console.log(`  会员: ${order.member ? order.member.nickname : 'N/A'} (ID: ${order.memberId})`);
            console.log(`  状态: ${order.status}`);
            console.log(`  支付方式: ${order.paymentMethod || 'N/A'}`);
            console.log(`  总金额: ¥${order.totalAmount || 0}`);
            console.log(`  商品数量: ${order.items ? order.items.length : 0} 项`);
            if (order.items && order.items.length > 0) {
                order.items.forEach((item, i) => {
                    console.log(`    商品 ${i + 1}: ${item.productName || 'N/A'} x ${item.quantity || 0}`);
                });
            }
            console.log(`  创建时间: ${order.createdAt}`);
        });

        // 3. 按状态统计
        console.log('\n\n按状态统计:');
        console.log('='.repeat(80));
        const statusCounts = await Order.findAll({
            attributes: [
                'status',
                [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
            ],
            group: ['status'],
            raw: true
        });

        statusCounts.forEach(stat => {
            console.log(`  ${stat.status || 'NULL'}: ${stat.count} 个订单`);
        });

        // 4. 检查是否有OrderItem数据
        const itemCount = await OrderItem.count();
        console.log(`\n订单项(OrderItem)总数: ${itemCount}`);

        if (itemCount > 0) {
            const recentItems = await OrderItem.findAll({
                limit: 5,
                order: [['createdAt', 'DESC']]
            });
            console.log(`\n最近的 ${recentItems.length} 个订单项:`);
            recentItems.forEach((item, index) => {
                console.log(`  订单项 ${index + 1}:`);
                console.log(`    订单ID: ${item.orderId}`);
                console.log(`    商品: ${item.productName || 'N/A'}`);
                console.log(`    数量: ${item.quantity || 0}`);
                console.log(`    单价: ¥${item.unitPrice || 0}`);
            });
        }

        console.log('\n检查完成！');

    } catch (error) {
        console.error('检查订单数据失败:', error);
        console.error('错误详情:', error.message);
        console.error('堆栈:', error.stack);
    } finally {
        process.exit(0);
    }
}

checkOrders();

