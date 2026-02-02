const express = require('express');
const { ProductSKU, Product } = require('../db');
const { Op } = require('sequelize');
const router = express.Router();

// 获取SKU列表
router.get('/', async (req, res) => {
  try {
    const { productId, page = 1, limit = 10, search = '', status = '' } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = {};
    
    if (productId) {
      whereClause.productId = productId;
    }
    
    if (search) {
      whereClause[Op.or] = [
        { sku: { [Op.like]: `%${search}%` } },
        { name: { [Op.like]: `%${search}%` } }
      ];
    }
    
    if (status) {
      whereClause.status = status;
    }
    
    const { count, rows } = await ProductSKU.findAndCountAll({
      where: whereClause,
      include: [{
        model: Product,
        as: 'product',
        attributes: ['id', 'name', 'brand']
      }],
      order: [['sortOrder', 'ASC'], ['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    res.json({
      code: 0,
      message: '获取成功',
      data: {
        skus: rows,
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('获取SKU列表失败:', error);
    res.status(500).json({
      code: 1,
      message: '服务器错误: ' + error.message
    });
  }
});

// 获取单个SKU
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const sku = await ProductSKU.findByPk(id, {
      include: [{
        model: Product,
        as: 'product',
        attributes: ['id', 'name', 'brand']
      }]
    });
    
    if (!sku) {
      return res.status(404).json({
        code: 1,
        message: 'SKU不存在'
      });
    }
    
    res.json({
      code: 0,
      message: '获取成功',
      data: sku
    });
  } catch (error) {
    console.error('获取SKU失败:', error);
    res.status(500).json({
      code: 1,
      message: '服务器错误: ' + error.message
    });
  }
});

// 创建SKU
router.post('/', async (req, res) => {
  try {
    const skuData = req.body;
    
    // 验证必填字段
    if (!skuData.productId || !skuData.sku || !skuData.name || !skuData.price) {
      return res.status(400).json({
        code: 1,
        message: '商品ID、SKU编码、名称和价格不能为空'
      });
    }
    
    // 检查商品是否存在
    const product = await Product.findByPk(skuData.productId);
    if (!product) {
      return res.status(400).json({
        code: 1,
        message: '商品不存在'
      });
    }
    
    // 检查SKU编码是否重复
    const existingSku = await ProductSKU.findOne({ where: { sku: skuData.sku } });
    if (existingSku) {
      return res.status(400).json({
        code: 1,
        message: 'SKU编码已存在'
      });
    }
    
    const sku = await ProductSKU.create(skuData);
    
    res.json({
      code: 0,
      message: 'SKU创建成功',
      data: sku
    });
  } catch (error) {
    console.error('创建SKU失败:', error);
    res.status(500).json({
      code: 1,
      message: '服务器错误: ' + error.message
    });
  }
});

// 更新SKU
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const skuData = req.body;
    
    const sku = await ProductSKU.findByPk(id);
    if (!sku) {
      return res.status(404).json({
        code: 1,
        message: 'SKU不存在'
      });
    }
    
    // 如果更新SKU编码，检查是否重复
    if (skuData.sku && skuData.sku !== sku.sku) {
      const existingSku = await ProductSKU.findOne({ 
        where: { sku: skuData.sku, id: { [Op.ne]: id } } 
      });
      if (existingSku) {
        return res.status(400).json({
          code: 1,
          message: 'SKU编码已存在'
        });
      }
    }
    
    await sku.update(skuData);
    
    res.json({
      code: 0,
      message: 'SKU更新成功',
      data: sku
    });
  } catch (error) {
    console.error('更新SKU失败:', error);
    res.status(500).json({
      code: 1,
      message: '服务器错误: ' + error.message
    });
  }
});

// 删除SKU
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const sku = await ProductSKU.findByPk(id);
    if (!sku) {
      return res.status(404).json({
        code: 1,
        message: 'SKU不存在'
      });
    }
    
    await sku.destroy();
    
    res.json({
      code: 0,
      message: 'SKU删除成功'
    });
  } catch (error) {
    console.error('删除SKU失败:', error);
    res.status(500).json({
      code: 1,
      message: '服务器错误: ' + error.message
    });
  }
});

module.exports = router;