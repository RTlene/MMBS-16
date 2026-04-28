const { Op, literal } = require('sequelize');
const { sequelize, Order, OrderItem, Product, ProductSKU, OrderOperationLog } = require('../db');

function toInt(value, fallback = 0) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

async function _deductInTransaction(orderId, transaction, options = {}) {
  const {
    source = 'system',
    operatorType = 'system',
    operatorId = null
  } = options;

  const order = await Order.findByPk(orderId, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!order) {
    throw new Error('订单不存在');
  }

  const items = await OrderItem.findAll({
    where: { orderId },
    include: [{
      model: Product,
      as: 'product',
      attributes: ['id', 'name', 'productType']
    }],
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  const toDeduct = [];
  for (const item of items) {
    if (!item || !item.product) continue;
    if (item.product.productType === 'service') continue;

    const skuId = toInt(item.skuId, 0);
    const qty = toInt(item.quantity, 0);
    if (!skuId || qty <= 0) continue;
    toDeduct.push({
      skuId,
      quantity: qty,
      productId: item.productId,
      productName: item.product.name || ''
    });
  }

  if (toDeduct.length === 0) {
    return { deducted: false, message: '无实物商品需扣减库存' };
  }

  for (const row of toDeduct) {
    const [affected] = await ProductSKU.update(
      { stock: literal(`stock - ${row.quantity}`) },
      {
        where: {
          id: row.skuId,
          status: 'active',
          stock: { [Op.gte]: row.quantity }
        },
        transaction
      }
    );
    if (!affected) {
      throw new Error(`库存不足，SKU#${row.skuId}`);
    }
  }

  await OrderOperationLog.create({
    orderId: order.id,
    operation: 'modify',
    operatorId,
    operatorType,
    oldStatus: order.status,
    newStatus: order.status,
    description: `扣减库存（${source}）`,
    data: { source, deductedItems: toDeduct }
  }, { transaction });

  return { deducted: true, items: toDeduct };
}

async function _hasInventoryOp(orderId, source, transaction) {
  const logs = await OrderOperationLog.findAll({
    where: {
      orderId,
      operation: 'modify'
    },
    attributes: ['id', 'data'],
    transaction
  });
  return (logs || []).some((log) => {
    const data = log && log.data;
    if (!data || typeof data !== 'object') return false;
    return String(data.source || '') === String(source || '');
  });
}

async function _restockInTransaction(orderId, transaction, options = {}) {
  const {
    source = 'system',
    operatorType = 'system',
    operatorId = null
  } = options;
  const opSource = `restock_${source}`;

  if (await _hasInventoryOp(orderId, opSource, transaction)) {
    return { restocked: false, message: '库存已回补，跳过重复操作' };
  }

  const order = await Order.findByPk(orderId, {
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!order) throw new Error('订单不存在');

  const items = await OrderItem.findAll({
    where: { orderId },
    include: [{
      model: Product,
      as: 'product',
      attributes: ['id', 'name', 'productType']
    }],
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  const toRestock = [];
  for (const item of items) {
    if (!item || !item.product) continue;
    if (item.product.productType === 'service') continue;
    const skuId = toInt(item.skuId, 0);
    const qty = toInt(item.quantity, 0);
    if (!skuId || qty <= 0) continue;
    toRestock.push({
      skuId,
      quantity: qty,
      productId: item.productId,
      productName: item.product.name || ''
    });
  }

  if (toRestock.length === 0) {
    return { restocked: false, message: '无实物商品需回补库存' };
  }

  for (const row of toRestock) {
    await ProductSKU.update(
      { stock: literal(`stock + ${row.quantity}`) },
      {
        where: { id: row.skuId },
        transaction
      }
    );
  }

  await OrderOperationLog.create({
    orderId: order.id,
    operation: 'modify',
    operatorId,
    operatorType,
    oldStatus: order.status,
    newStatus: order.status,
    description: `回补库存（${source}）`,
    data: { source: opSource, restockedItems: toRestock }
  }, { transaction });

  return { restocked: true, items: toRestock };
}

async function deductStockForOrder(orderId, options = {}) {
  if (!orderId) throw new Error('orderId 不能为空');
  if (options.transaction) {
    return _deductInTransaction(orderId, options.transaction, options);
  }
  return sequelize.transaction(async (transaction) => {
    return _deductInTransaction(orderId, transaction, options);
  });
}

async function restockForOrder(orderId, options = {}) {
  if (!orderId) throw new Error('orderId 不能为空');
  if (options.transaction) {
    return _restockInTransaction(orderId, options.transaction, options);
  }
  return sequelize.transaction(async (transaction) => {
    return _restockInTransaction(orderId, transaction, options);
  });
}

module.exports = {
  deductStockForOrder,
  restockForOrder
};

