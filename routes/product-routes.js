const express = require('express');
const { Product, ProductSKU, ProductAttribute, Category } = require('../db');
const { Op } = require('sequelize');
const multer = require('multer');
const { toCsv, parseCsv, rowsToObjects } = require('../utils/csv');
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function sendCsv(res, filename, csvText) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.send(csvText);
}

function safeInt(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function safeBool(v) {
  if (v === true || v === false) return v;
  const s = String(v || '').trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes' || s === 'y') return true;
  if (s === '0' || s === 'false' || s === 'no' || s === 'n') return false;
  return null;
}

// 获取商品列表
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', categoryId = '', status = '' } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = {};
    
    // 搜索条件
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } }
      ];
    }
    
    if (categoryId) {
      whereClause.categoryId = categoryId;
    }
    
    if (status) {
      whereClause.status = status;
    }
    
    const { count, rows } = await Product.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['id', 'name']
        },
        {
          model: ProductSKU,
          as: 'skus',
          attributes: ['id', 'sku', 'name', 'price', 'stock', 'status'],
          required: false
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    // 处理商品数据，添加SKU统计信息
    const products = rows.map(product => {
      const skuCount = product.skus ? product.skus.length : 0;
      const totalStock = product.skus ? product.skus.reduce((sum, sku) => sum + sku.stock, 0) : 0;
      const activeSkus = product.skus ? product.skus.filter(sku => sku.status === 'active') : [];
      const priceRange = activeSkus.length > 0 ? {
        min: Math.min(...activeSkus.map(sku => parseFloat(sku.price))),
        max: Math.max(...activeSkus.map(sku => parseFloat(sku.price)))
      } : { min: 0, max: 0 };
      
      return {
        ...product.toJSON(),
        skuCount,
        totalStock,
        priceRange: priceRange.min === priceRange.max ? 
          `¥${priceRange.min}` : 
          `¥${priceRange.min} - ¥${priceRange.max}`
      };
    });
    
    res.json({
      code: 0,
      message: '获取成功',
      data: {
        products,
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('获取商品列表失败:', error);
    res.status(500).json({
      code: 1,
      message: '服务器错误: ' + error.message
    });
  }
});

// 导出商品（按筛选条件导出全量CSV）
router.get('/export', async (req, res) => {
  try {
    const { search = '', categoryId = '', status = '' } = req.query;

    const whereClause = {};
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } }
      ];
    }
    if (categoryId) whereClause.categoryId = categoryId;
    if (status) whereClause.status = status;

    const rows = await Product.findAll({
      where: whereClause,
      include: [{ model: Category, as: 'category', attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']]
    });

    const headers = [
      'id',
      'name',
      'categoryId',
      'brand',
      'productType',
      'price',
      'originalPrice',
      'stock',
      'isHot',
      'status',
      'createdAt'
    ];

    const dataRows = rows.map(p => {
      const j = p.toJSON();
      return headers.map(h => j[h] ?? '');
    });

    const csv = toCsv(headers, dataRows);
    sendCsv(res, `products_${new Date().toISOString().slice(0, 10)}.csv`, csv);
  } catch (error) {
    console.error('导出商品失败:', error);
    res.status(500).json({ code: 1, message: '导出商品失败: ' + error.message });
  }
});

// 下载商品导入模板
router.get('/import-template', async (req, res) => {
  const headers = [
    'id',
    'name',
    'categoryId',
    'brand',
    'productType',
    'price',
    'originalPrice',
    'stock',
    'isHot',
    'status'
  ];
  const sample = [
    ['', '示例商品', '', '示例品牌', 'physical', '9.99', '19.99', '100', '0', 'active']
  ];
  const csv = toCsv(headers, sample);
  sendCsv(res, 'products_import_template.csv', csv);
});

// 导入商品（CSV：按 id 更新；否则创建；不处理SKU/属性，仅基础字段）
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ code: 1, message: '未上传文件' });

    const text = req.file.buffer.toString('utf8');
    const rows = parseCsv(text);
    const objs = rowsToObjects(rows);

    const results = { total: objs.length, created: 0, updated: 0, skipped: 0, errors: [] };

    for (let idx = 0; idx < objs.length; idx++) {
      const r = objs[idx] || {};
      const line = idx + 2;
      const name = (r.name || '').trim();
      if (!name) {
        results.skipped += 1;
        results.errors.push({ line, reason: 'name 不能为空' });
        continue;
      }

      const productType = (r.productType || '').trim() || 'physical';
      if (!['physical', 'service'].includes(productType)) {
        results.skipped += 1;
        results.errors.push({ line, reason: `productType 不合法: ${productType}` });
        continue;
      }

      const payload = {
        name,
        categoryId: safeInt(r.categoryId),
        brand: (r.brand || '').trim() || null,
        productType,
        price: r.price !== '' ? Number(r.price) : undefined,
        originalPrice: r.originalPrice !== '' ? Number(r.originalPrice) : undefined,
        stock: safeInt(r.stock) ?? undefined,
        isHot: safeBool(r.isHot) ?? undefined,
        status: (r.status || '').trim() || undefined
      };
      Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

      const id = safeInt(r.id);
      let target = null;
      if (id) target = await Product.findByPk(id);

      if (target) {
        await target.update(payload);
        results.updated += 1;
      } else {
        const created = await Product.create({
          ...payload,
          status: payload.status || 'active',
          isHot: payload.isHot ?? false
        });
        // 若无SKU，创建默认SKU（沿用创建商品逻辑的兜底）
        await ProductSKU.create({
          productId: created.id,
          sku: `SKU-${created.id}`,
          name: created.name,
          price: created.price || 0,
          stock: created.stock || 0,
          status: 'active'
        });
        results.created += 1;
      }
    }

    res.json({ code: 0, message: '导入完成', data: results });
  } catch (error) {
    console.error('导入商品失败:', error);
    res.status(500).json({ code: 1, message: '导入商品失败: ' + error.message });
  }
});

// 获取单个商品
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findByPk(id, {
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['id', 'name']
        },
        {
          model: ProductSKU,
          as: 'skus',
          order: [['sortOrder', 'ASC'], ['createdAt', 'ASC']]
        },
        {
          model: ProductAttribute,
          as: 'attributes',
          order: [['sortOrder', 'ASC'], ['createdAt', 'ASC']]
        }
      ]
    });
    
    if (!product) {
      return res.status(404).json({
        code: 1,
        message: '商品不存在'
      });
    }
    
    res.json({
      code: 0,
      message: '获取成功',
      data: product
    });
  } catch (error) {
    console.error('获取商品失败:', error);
    res.status(500).json({
      code: 1,
      message: '服务器错误: ' + error.message
    });
  }
});

// 创建商品
router.post('/', async (req, res) => {
  try {
    const { attributes, skus, ...productData } = req.body;
    
    // 验证必填字段
    if (!productData.name) {
      return res.status(400).json({
        code: 1,
        message: '商品名称不能为空'
      });
    }
    
    // 检查分类是否存在
    if (productData.categoryId) {
      const category = await Category.findByPk(productData.categoryId);
      if (!category) {
        return res.status(400).json({
          code: 1,
          message: '分类不存在'
        });
      }
    }
    
    // 创建商品，确保status为active
    const product = await Product.create({
      ...productData,
      status: productData.status || 'active',
      isHot: productData.isHot ?? false
    });
    
    // 创建属性
    if (attributes && attributes.length > 0) {
      for (const attr of attributes) {
        await ProductAttribute.create({
          productId: product.id,
          ...attr
        });
      }
    }
    
    // 创建SKU，确保status为active
    if (skus && skus.length > 0) {
      for (const sku of skus) {
        await ProductSKU.create({
          productId: product.id,
          ...sku,
          status: sku.status || 'active'
        });
      }
    } else {
      // 如果没有提供SKU，创建一个默认SKU
      await ProductSKU.create({
        productId: product.id,
        sku: productData.sku || `SKU-${product.id}`,
        name: productData.name,
        price: productData.price || 0,
        stock: productData.stock || 0,
        status: 'active'
      });
    }
    
    // 返回完整的商品信息
    const fullProduct = await Product.findByPk(product.id, {
      include: [
        { model: Category, as: 'category' },
        { model: ProductSKU, as: 'skus' },
        { model: ProductAttribute, as: 'attributes' }
      ]
    });
    
    res.json({
      code: 0,
      message: '商品创建成功',
      data: fullProduct
    });
  } catch (error) {
    console.error('创建商品失败:', error);
    res.status(500).json({
      code: 1,
      message: '服务器错误: ' + error.message
    });
  }
});

// 更新商品
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { attributes, skus, ...productData } = req.body;
    
    const product = await Product.findByPk(id);
    if (!product) {
      return res.status(404).json({
        code: 1,
        message: '商品不存在'
      });
    }
    
    // 如果更新分类，检查分类是否存在
    if (productData.categoryId && productData.categoryId !== product.categoryId) {
      const category = await Category.findByPk(productData.categoryId);
      if (!category) {
        return res.status(400).json({
          code: 1,
          message: '分类不存在'
        });
      }
    }
    
    // 更新商品基本信息
    await product.update({
      ...productData,
      isHot: productData.isHot ?? product.isHot
    });
    
    // 更新属性
    if (attributes !== undefined) {
      // 删除现有属性
      await ProductAttribute.destroy({ where: { productId: id } });
      
      // 创建新属性
      if (attributes.length > 0) {
        for (const attr of attributes) {
          await ProductAttribute.create({
            productId: id,
            ...attr
          });
        }
      }
    }
    
    // 更新SKU
    if (skus !== undefined) {
      // 删除现有SKU
      await ProductSKU.destroy({ where: { productId: id } });
      
      // 创建新SKU
      if (skus.length > 0) {
        for (const sku of skus) {
          await ProductSKU.create({
            productId: id,
            ...sku
          });
        }
      }
    }
    
    // 返回完整的商品信息
    const fullProduct = await Product.findByPk(id, {
      include: [
        { model: Category, as: 'category' },
        { model: ProductSKU, as: 'skus' },
        { model: ProductAttribute, as: 'attributes' }
      ]
    });
    
    res.json({
      code: 0,
      message: '商品更新成功',
      data: fullProduct
    });
  } catch (error) {
    console.error('更新商品失败:', error);
    res.status(500).json({
      code: 1,
      message: '服务器错误: ' + error.message
    });
  }
});

// 删除商品
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const product = await Product.findByPk(id);
    if (!product) {
      return res.status(404).json({
        code: 1,
        message: '商品不存在'
      });
    }
    
    // 删除商品文件（如果存在）
    try {
      const response = await fetch(`http://localhost:${process.env.PORT || 3000}/api/product-files/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        console.warn('删除商品文件失败');
      }
    } catch (error) {
      console.warn('删除商品文件失败:', error);
    }
    
    // 删除商品（会级联删除SKU和属性）
    await product.destroy();
    
    res.json({
      code: 0,
      message: '商品删除成功'
    });
  } catch (error) {
    console.error('删除商品失败:', error);
    res.status(500).json({
      code: 1,
      message: '服务器错误: ' + error.message
    });
  }
});

module.exports = router;