const express = require('express');
const {
    Product,
    ProductSKU,
    ProductAttribute,
    Category,
    ProductMemberPrice,
    MemberLevel,
    ProductCategory,
    sequelize
} = require('../db');
const {
    normalizeCategoryIdsFromBody,
    syncProductCategories,
    buildAdminProductWhere,
    enrichProductCategoryArrays
} = require('../utils/productCategoryHelpers');
const { Op } = require('sequelize');
const { deleteProductFiles } = require('./product-files-routes');
const { authenticateToken } = require('../middleware/auth');
const multer = require('multer');
const { toCsv, parseCsv, rowsToObjects } = require('../utils/csv');
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// 数据库连接被重置时重试（云环境常见 ECONNRESET）
const DB_RETRY_CODES = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST'];
function isDbConnectionError(err) {
  const code = err && (err.code || err.original && err.original.code);
  return DB_RETRY_CODES.includes(code) || (err.original && err.original.errno === -104);
}

async function withDbRetry(fn, maxAttempts = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts && (err.name === 'SequelizeDatabaseError' && isDbConnectionError(err))) {
        await new Promise(r => setTimeout(r, 100 * attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

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

/** CSV：categoryIds 列用分号/逗号分隔多个 ID；可与 categoryId（主分类）二选一 */
function parseCategoryIdsFromCsvRow(r) {
  const raw = String(r.categoryIds || r.category_ids || '').trim();
  if (raw) {
    const ids = raw
      .split(/[;,]+/)
      .map((s) => parseInt(String(s).trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    return [...new Set(ids)];
  }
  const single = safeInt(r.categoryId);
  return single ? [single] : [];
}

function sortSkus(list) {
  if (!Array.isArray(list)) return [];
  return list.slice().sort((a, b) => {
    const sa = (a && a.sortOrder != null) ? Number(a.sortOrder) : 0;
    const sb = (b && b.sortOrder != null) ? Number(b.sortOrder) : 0;
    if (sa !== sb) return sa - sb;
    const ca = a && a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const cb = b && b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (ca !== cb) return ca - cb;
    const ia = (a && a.id != null) ? Number(a.id) : 0;
    const ib = (b && b.id != null) ? Number(b.id) : 0;
    return ia - ib;
  });
}

// 获取商品列表
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', categoryId = '', status = '' } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const offset = (pageNum - 1) * limitNum;

    const whereClause = buildAdminProductWhere({ search, categoryId, status }, sequelize);
    const reqTag = `[AdminProducts] [${Date.now()}-${Math.random().toString(36).slice(2, 8)}]`;
    console.log(`${reqTag} 列表查询开始`, {
      page: pageNum,
      limit: limitNum,
      offset,
      search: String(search || ''),
      categoryId: String(categoryId || ''),
      status: String(status || ''),
      whereClause
    });

    // 稳定分页：先只按 Product 主表分页 ID，避免 include(hasMany/belongsToMany) + limit 导致漏页/跳页
    const [count, pageIdRows] = await Promise.all([
      withDbRetry(() => Product.count({ where: whereClause })),
      withDbRetry(() => Product.findAll({
        where: whereClause,
        attributes: ['id'],
        order: [['createdAt', 'DESC']],
        limit: limitNum,
        offset: offset,
        subQuery: false
      }))
    ]);
    const pageIds = (pageIdRows || []).map((r) => r.id).filter((x) => x != null);

    let rows = [];
    if (pageIds.length > 0) {
      rows = await withDbRetry(() => Product.findAll({
        where: { id: { [Op.in]: pageIds } },
        include: [
          {
            model: Category,
            as: 'category',
            attributes: ['id', 'name']
          },
          {
            model: Category,
            as: 'categories',
            attributes: ['id', 'name'],
            through: { attributes: ['sortOrder'] },
            required: false
          },
          {
            model: ProductSKU,
            as: 'skus',
            attributes: ['id', 'sku', 'name', 'price', 'stock', 'status'],
            required: false
          }
        ],
        subQuery: false
      }));
    }

    // 按分页 ID 顺序重排，确保返回顺序稳定
    const rowMap = new Map((rows || []).map((p) => [p.id, p]));
    rows = pageIds.map((id) => rowMap.get(id)).filter(Boolean);

    const idsInPage = (rows || []).map((p) => p && p.id).filter((x) => x != null);
    const has16InPage = idsInPage.includes(16);
    let has16ByFilter = false;
    try {
      const c16 = await Product.count({ where: { [Op.and]: [whereClause, { id: 16 }] } });
      has16ByFilter = c16 > 0;
    } catch (e) {
      console.warn(`${reqTag} 检查商品16命中筛选失败:`, e && e.message ? e.message : e);
    }
    console.log(`${reqTag} 列表查询结果`, {
      total: count,
      page: pageNum,
      limit: limitNum,
      returned: idsInPage.length,
      idsInPage,
      has16InPage,
      has16ByFilter
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
      
      const pj = enrichProductCategoryArrays(product.toJSON());
      return {
        ...pj,
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
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum)
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

// 导出商品 SKU 明细（CSV：每行一个 SKU；勾选 ids 时仅导出选中商品，否则按筛选导出全部）
router.get('/export', async (req, res) => {
  try {
    const { search = '', categoryId = '', status = '', ids = '' } = req.query;
    const idList = String(ids || '')
      .split(/[,;]+/)
      .map((s) => parseInt(String(s).trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);

    let whereClause = buildAdminProductWhere({ search, categoryId, status }, sequelize);
    if (idList.length > 0) {
      whereClause = { [Op.and]: [whereClause, { id: { [Op.in]: idList } }] };
    }

    const [products, levels] = await Promise.all([
      withDbRetry(() => Product.findAll({
        where: whereClause,
        include: [
          { model: Category, as: 'category', attributes: ['id', 'name'], required: false },
          {
            model: Category,
            as: 'categories',
            attributes: ['id', 'name'],
            through: { attributes: ['sortOrder'] },
            required: false
          },
          {
            model: ProductSKU,
            as: 'skus',
            required: false
          },
          {
            model: ProductMemberPrice,
            as: 'memberPrices',
            required: false,
            attributes: ['id', 'memberLevelId', 'skuId', 'price']
          }
        ],
        order: [['id', 'ASC']]
      })),
      MemberLevel.findAll({
        attributes: ['id', 'level', 'name'],
        order: [['level', 'ASC'], ['id', 'ASC']]
      })
    ]);

    const safeHeaderSeg = (s) => String(s || '').replace(/[",\r\n\u200B]/g, ' ').trim().slice(0, 40);
    const memberHeaders = levels.map(
      (l) => `memberPrice_L${l.id}_${safeHeaderSeg(l.name)}`
    );

    const baseHeaders = [
      'productId',
      'productName',
      'brand',
      'categoryId',
      'categoryIds',
      'categoryName',
      'productType',
      'productStatus',
      'isHot',
      'productSortOrder',
      'skuId',
      'skuCode',
      'skuName',
      'retailPrice',
      'costPrice',
      'stock',
      'barcode',
      'weight',
      'dimensions',
      'skuAttributesJson',
      'skuImagesJson',
      'skuStatus',
      'skuSortOrder',
      'skuCreatedAt',
      'skuUpdatedAt'
    ];
    const headers = [...baseHeaders, ...memberHeaders];

    const memberPriceCell = (productMemberPrices, levelId, sku) => {
      const list = Array.isArray(productMemberPrices) ? productMemberPrices : [];
      if (sku) {
        const exact = list.find((mp) => mp.memberLevelId === levelId && mp.skuId === sku.id);
        if (exact) return exact.price;
      }
      const def = list.find((mp) => mp.memberLevelId === levelId && mp.skuId === 0);
      return def ? def.price : '';
    };

    const fmt = (v) => {
      if (v === null || v === undefined) return '';
      if (v instanceof Date) return v.toISOString();
      return v;
    };

    const dataRows = [];
    for (const p of products) {
      const j = enrichProductCategoryArrays(p.toJSON());
      const catNames = (j.categories || []).map((c) => c.name).filter(Boolean).join(';');
      const mps = p.memberPrices || [];

      const pushRow = (sku) => {
        const row = {
          productId: p.id,
          productName: p.name,
          brand: p.brand ?? '',
          categoryId: p.categoryId ?? '',
          categoryIds: (j.categoryIds || []).join(';'),
          categoryName: catNames || (p.category && p.category.name) || '',
          productType: p.productType,
          productStatus: p.status,
          isHot: p.isHot,
          productSortOrder: p.sortOrder ?? ''
        };
        if (sku) {
          row.skuId = sku.id;
          row.skuCode = sku.sku;
          row.skuName = sku.name;
          row.retailPrice = sku.price;
          row.costPrice = sku.costPrice ?? '';
          row.stock = sku.stock;
          row.barcode = sku.barcode ?? '';
          row.weight = sku.weight ?? '';
          row.dimensions = sku.dimensions ?? '';
          row.skuAttributesJson = sku.attributes ? JSON.stringify(sku.attributes) : '';
          row.skuImagesJson = sku.images ? JSON.stringify(sku.images) : '';
          row.skuStatus = sku.status;
          row.skuSortOrder = sku.sortOrder ?? 0;
          row.skuCreatedAt = fmt(sku.createdAt);
          row.skuUpdatedAt = fmt(sku.updatedAt);
        } else {
          row.skuId = '';
          row.skuCode = '';
          row.skuName = '(无SKU)';
          row.retailPrice = '';
          row.costPrice = '';
          row.stock = '';
          row.barcode = '';
          row.weight = '';
          row.dimensions = '';
          row.skuAttributesJson = '';
          row.skuImagesJson = '';
          row.skuStatus = '';
          row.skuSortOrder = '';
          row.skuCreatedAt = '';
          row.skuUpdatedAt = '';
        }
        levels.forEach((l, i) => {
          row[memberHeaders[i]] = memberPriceCell(mps, l.id, sku);
        });
        dataRows.push(headers.map((h) => row[h] ?? ''));
      };

      const skus = sortSkus(p.skus || []);
      if (skus.length === 0) {
        pushRow(null);
      } else {
        for (const sku of skus) {
          pushRow(sku);
        }
      }
    }

    const csv = toCsv(headers, dataRows);
    sendCsv(res, `products_sku_detail_${new Date().toISOString().slice(0, 10)}.csv`, csv);
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
    'categoryIds',
    'brand',
    'productType',
    'price',
    'originalPrice',
    'stock',
    'isHot',
    'status'
  ];
  const sample = [
    ['', '示例商品', '1', '1;2', '示例品牌', 'physical', '9.99', '19.99', '100', '0', 'active']
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

      const catIds = parseCategoryIdsFromCsvRow(r);
      const payload = {
        name,
        brand: (r.brand || '').trim() || null,
        productType,
        price: r.price !== '' ? Number(r.price) : undefined,
        originalPrice: r.originalPrice !== '' ? Number(r.originalPrice) : undefined,
        stock: safeInt(r.stock) ?? undefined,
        isHot: safeBool(r.isHot) ?? undefined,
        status: (r.status || '').trim() || undefined
      };
      if (catIds.length > 0) {
        payload.categoryId = catIds[0];
      }
      Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

      const id = safeInt(r.id);
      let target = null;
      if (id) target = await Product.findByPk(id);

      if (target) {
        await target.update(payload);
        if (catIds.length > 0) {
          await syncProductCategories(sequelize, Product, ProductCategory, target.id, catIds, null);
        }
        results.updated += 1;
      } else {
        const created = await Product.create({
          ...payload,
          status: payload.status || 'active',
          isHot: payload.isHot ?? false
        });
        if (catIds.length > 0) {
          await syncProductCategories(sequelize, Product, ProductCategory, created.id, catIds, null);
        }
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

// ---------- 商品会员价（需放在 /:id 之前） ----------
// 获取某商品的会员价列表（含按 SKU 的配置，skuId=0 为整品默认）
router.get('/:id/member-prices', async (req, res) => {
  try {
    const productId = safeInt(req.params.id);
    if (!productId) return res.status(400).json({ code: 1, message: '商品ID无效' });
    const product = await Product.findByPk(productId);
    if (!product) return res.status(404).json({ code: 1, message: '商品不存在' });
    const list = await ProductMemberPrice.findAll({
      where: { productId },
      include: [
        { model: MemberLevel, as: 'memberLevel', attributes: ['id', 'name', 'level'] },
        { model: ProductSKU, as: 'sku', attributes: ['id', 'name', 'sku'], required: false }
      ],
      order: [['memberLevelId', 'ASC'], ['skuId', 'ASC']]
    });
    res.json({ code: 0, message: '获取成功', data: list });
  } catch (err) {
    console.error('获取商品会员价失败:', err);
    res.status(500).json({ code: 1, message: err.message || '服务器错误' });
  }
});

// 为某商品添加/更新一条会员价（支持按 SKU：skuId=0 为整品默认，否则为指定 SKU）
router.post('/:id/member-prices', async (req, res) => {
  try {
    const productId = safeInt(req.params.id);
    const { memberLevelId, skuId: bodySkuId, price } = req.body || {};
    if (!productId) return res.status(400).json({ code: 1, message: '商品ID无效' });
    const levelId = safeInt(memberLevelId);
    if (!levelId) return res.status(400).json({ code: 1, message: '请选择会员等级' });
    const skuId = bodySkuId != null && bodySkuId !== '' ? safeInt(bodySkuId) : 0;
    const priceNum = parseFloat(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) return res.status(400).json({ code: 1, message: '会员价必须为有效非负数' });
    const product = await Product.findByPk(productId);
    if (!product) return res.status(404).json({ code: 1, message: '商品不存在' });
    const level = await MemberLevel.findByPk(levelId);
    if (!level) return res.status(400).json({ code: 1, message: '会员等级不存在' });
    if (skuId > 0) {
      const sku = await ProductSKU.findOne({ where: { id: skuId, productId } });
      if (!sku) return res.status(400).json({ code: 1, message: '该 SKU 不属于本商品' });
    }
    await ProductMemberPrice.upsert(
      { productId, memberLevelId: levelId, skuId, price: priceNum },
      { conflictFields: ['productId', 'memberLevelId', 'skuId'] }
    );
    const created = await ProductMemberPrice.findOne({
      where: { productId, memberLevelId: levelId, skuId },
      include: [
        { model: MemberLevel, as: 'memberLevel', attributes: ['id', 'name', 'level'] },
        { model: ProductSKU, as: 'sku', attributes: ['id', 'name', 'sku'], required: false }
      ]
    });
    res.json({ code: 0, message: '保存成功', data: created });
  } catch (err) {
    console.error('保存商品会员价失败:', err);
    res.status(500).json({ code: 1, message: err.message || '服务器错误' });
  }
});

// 批量保存某商品的会员价（新建商品后一次性提交用）
router.post('/:id/member-prices/batch', async (req, res) => {
  try {
    const productId = safeInt(req.params.id);
    const { memberPrices } = req.body || {};
    if (!productId) return res.status(400).json({ code: 1, message: '商品ID无效' });
    const product = await Product.findByPk(productId, { include: [{ model: ProductSKU, as: 'skus', attributes: ['id'] }] });
    if (!product) return res.status(404).json({ code: 1, message: '商品不存在' });
    const skuIds = (product.skus || []).map(s => s.id);
    // 用于序号映射：按 sortOrder/createdAt/id 稳定排序
    const orderedSkus = await ProductSKU.findAll({
      where: { productId },
      attributes: ['id', 'sortOrder', 'createdAt'],
      order: [['sortOrder', 'ASC'], ['createdAt', 'ASC'], ['id', 'ASC']]
    });
    const orderedSkuIds = orderedSkus.map(s => s.id);
    const list = Array.isArray(memberPrices) ? memberPrices : [];

    const debugEnabled = String(req.query.debug || '').trim() === '1';
    // 规范化并过滤非法数据（并去重，避免同一 levelId+skuId 被后续值覆盖导致“看起来偏移”）
    const rowsByKey = new Map();
    const debug = {
      productId,
      incomingCount: list.length,
      skuIdsCount: skuIds.length,
      orderedSkuIdsCount: orderedSkuIds.length,
      invalidSkuIdCount: 0,
      mappedByIndexCount: 0,
      duplicateKeyCount: 0
    };
    for (const item of list) {
      const levelId = safeInt(item && item.memberLevelId);
      const skuId = item && item.skuId != null && item.skuId !== '' ? safeInt(item.skuId) : 0;
      const priceNum = parseFloat(item && item.price);
      if (!levelId || !Number.isFinite(priceNum) || priceNum < 0) continue;
      let finalSkuId = skuId || 0;
      if (finalSkuId > 0 && !skuIds.includes(finalSkuId)) {
        // 兼容：前端偶发传入 1..n 序号而不是 skuId，按当前 SKU 顺序映射
        if (finalSkuId <= orderedSkuIds.length) {
          finalSkuId = orderedSkuIds[finalSkuId - 1] || 0;
          debug.mappedByIndexCount += 1;
        } else {
          debug.invalidSkuIdCount += 1;
          continue;
        }
      }
      const key = `${levelId}:${finalSkuId}`;
      if (rowsByKey.has(key)) debug.duplicateKeyCount += 1;
      rowsByKey.set(key, { productId, memberLevelId: levelId, skuId: finalSkuId, price: priceNum });
    }
    const rows = Array.from(rowsByKey.values());

    // 打印关键诊断信息，便于定位“偏移”是否由 skuId/序号混用导致
    try {
      const incomingSkuIds = (list || []).map(x => x && x.skuId).filter(x => x != null);
      console.log('[MemberPricesBatch] productId=', productId, 'debug=', debug);
      console.log('[MemberPricesBatch] skuIds=', skuIds.slice(0, 50), 'orderedSkuIds=', orderedSkuIds.slice(0, 50));
      console.log('[MemberPricesBatch] incomingSkuIds(sample)=', incomingSkuIds.slice(0, 50));
      if (debugEnabled) {
        console.log('[MemberPricesBatch] normalizedRows(sample)=', rows.slice(0, 50).map(r => ({ memberLevelId: r.memberLevelId, skuId: r.skuId, price: r.price })));
      }
    } catch (_) {}

    // 批量写入：使用事务 + bulkCreate(updateOnDuplicate) 避免部分保存/只落最后一条的异常情况
    // MySQL / MariaDB：updateOnDuplicate 生效；其他方言会忽略但仍可插入
    if (rows.length > 0) {
      await sequelize.transaction(async (t) => {
        await ProductMemberPrice.bulkCreate(rows, {
          transaction: t,
          updateOnDuplicate: ['price', 'updatedAt']
        });
      });
    }
    const updated = await ProductMemberPrice.findAll({
      where: { productId },
      include: [
        { model: MemberLevel, as: 'memberLevel', attributes: ['id', 'name', 'level'] },
        { model: ProductSKU, as: 'sku', attributes: ['id', 'name', 'sku'], required: false }
      ],
      order: [['memberLevelId', 'ASC'], ['skuId', 'ASC']]
    });
    res.json({
      code: 0,
      message: '保存成功',
      data: updated,
      ...(debugEnabled ? { debug } : {})
    });
  } catch (err) {
    console.error('批量保存会员价失败:', err);
    res.status(500).json({ code: 1, message: err.message || '服务器错误' });
  }
});

// 删除某商品的一条会员价
router.delete('/:id/member-prices/:priceId', async (req, res) => {
  try {
    const productId = safeInt(req.params.id);
    const priceId = safeInt(req.params.priceId);
    if (!productId || !priceId) return res.status(400).json({ code: 1, message: '参数无效' });
    const deleted = await ProductMemberPrice.destroy({
      where: { id: priceId, productId }
    });
    if (!deleted) return res.status(404).json({ code: 1, message: '该会员价不存在或不属于本商品' });
    res.json({ code: 0, message: '删除成功' });
  } catch (err) {
    console.error('删除商品会员价失败:', err);
    res.status(500).json({ code: 1, message: err.message || '服务器错误' });
  }
});

// 批量删除商品
router.post('/batch-delete', authenticateToken, async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ code: 1, message: '请选择要删除的商品' });
    }
    const idList = ids.map(id => parseInt(id, 10)).filter(Number.isFinite);
    const deleted = await withDbRetry(() => Product.destroy({ where: { id: idList } }));
    res.json({ code: 0, message: '删除成功', data: { deleted } });
  } catch (err) {
    console.error('批量删除商品失败:', err);
    res.status(500).json({ code: 1, message: '批量删除失败' });
  }
});
// 批量更新商品状态
router.post('/batch-status', authenticateToken, async (req, res) => {
  try {
    const { ids, status } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ code: 1, message: '请选择商品' });
    }
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ code: 1, message: '状态无效' });
    }
    const idList = ids.map(id => parseInt(id, 10)).filter(Number.isFinite);
    const [affected] = await withDbRetry(() => Product.update({ status }, { where: { id: idList } }));
    res.json({ code: 0, message: '更新成功', data: { affected } });
  } catch (err) {
    console.error('批量更新商品状态失败:', err);
    res.status(500).json({ code: 1, message: '批量更新失败' });
  }
});

// 获取单个商品（含 DB 连接重置时自动重试）
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const product = await withDbRetry(() => Product.findByPk(id, {
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['id', 'name']
        },
        {
          model: Category,
          as: 'categories',
          attributes: ['id', 'name'],
          through: { attributes: ['sortOrder'] },
          required: false
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
    }));

    if (!product) {
      return res.status(404).json({
        code: 1,
        message: '商品不存在'
      });
    }

    const out = enrichProductCategoryArrays(product.toJSON());
    // include 内的 order 在部分 Sequelize 版本不会生效，响应前再手动排序兜底
    if (out && out.skus) out.skus = sortSkus(out.skus);

    res.json({
      code: 0,
      message: '获取成功',
      data: out
    });
  } catch (err) {
    console.error('获取商品失败:', err);
    const isDbConn = err.name === 'SequelizeDatabaseError' && isDbConnectionError(err);
    res.status(isDbConn ? 503 : 500).json({
      code: 1,
      message: isDbConn ? '数据库连接异常，请稍后重试' : ('服务器错误: ' + (err.message || ''))
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

    const categoryIds = normalizeCategoryIdsFromBody(req.body);
    if (categoryIds.length === 0) {
      return res.status(400).json({
        code: 1,
        message: '请至少选择一个商品分类'
      });
    }
    for (const cid of categoryIds) {
      const category = await Category.findByPk(cid);
      if (!category) {
        return res.status(400).json({
          code: 1,
          message: `分类不存在: ${cid}`
        });
      }
    }

    const { categoryIds: _c1, categoryId: _c2, ...restData } = productData;

    // 创建商品，确保status为active；主分类为 categoryIds[0]
    const product = await Product.create({
      ...restData,
      categoryId: categoryIds[0],
      status: productData.status || 'active',
      isHot: productData.isHot ?? false
    });

    await syncProductCategories(sequelize, Product, ProductCategory, product.id, categoryIds, null);
    
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
        {
          model: Category,
          as: 'categories',
          attributes: ['id', 'name'],
          through: { attributes: ['sortOrder'] },
          required: false
        },
        { model: ProductSKU, as: 'skus' },
        { model: ProductAttribute, as: 'attributes' }
      ]
    });
    let out = fullProduct ? enrichProductCategoryArrays(fullProduct.toJSON()) : null;
    if (out && out.skus) out.skus = sortSkus(out.skus);

    res.json({
      code: 0,
      message: '商品创建成功',
      data: out
    });
  } catch (error) {
    console.error('创建商品失败:', error);
    res.status(500).json({
      code: 1,
      message: '服务器错误: ' + error.message
    });
  }
});

// 同步商品主图/详情图/视频顺序（仅更新 media 字段，不触及其他）
router.put('/:id/media', async (req, res) => {
  try {
    const { id } = req.params;
    const { images, detailImages, videos } = req.body || {};
    const product = await Product.findByPk(id);
    if (!product) {
      return res.status(404).json({ code: 1, message: '商品不存在' });
    }
    const updatePayload = {};
    if (Array.isArray(images)) updatePayload.images = images;
    if (Array.isArray(detailImages)) updatePayload.detailImages = detailImages;
    if (Array.isArray(videos)) updatePayload.videos = videos;
    if (Object.keys(updatePayload).length === 0) {
      return res.json({ code: 0, message: '无需更新' });
    }
    await product.update(updatePayload);
    return res.json({ code: 0, message: '媒体顺序已更新' });
  } catch (error) {
    console.error('更新商品媒体顺序失败:', error);
    return res.status(500).json({ code: 1, message: '服务器错误: ' + error.message });
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

    const hasCategoryUpdate =
      Array.isArray(req.body.categoryIds) || (req.body.categoryId !== undefined && req.body.categoryId !== null);
    let nextCategoryIds = null;
    if (hasCategoryUpdate) {
      nextCategoryIds = normalizeCategoryIdsFromBody(req.body);
      if (nextCategoryIds.length === 0) {
        return res.status(400).json({
          code: 1,
          message: '请至少选择一个商品分类'
        });
      }
      for (const cid of nextCategoryIds) {
        const category = await Category.findByPk(cid);
        if (!category) {
          return res.status(400).json({
            code: 1,
            message: `分类不存在: ${cid}`
          });
        }
      }
    }

    const { categoryIds: _d1, categoryId: _d2, ...restData } = productData;

    await sequelize.transaction(async (t) => {
      const updatePayload = {
        ...restData,
        isHot: productData.isHot ?? product.isHot
      };
      if (nextCategoryIds) {
        updatePayload.categoryId = nextCategoryIds[0];
      }
      await product.update(updatePayload, { transaction: t });

      if (nextCategoryIds) {
        await syncProductCategories(sequelize, Product, ProductCategory, Number(id), nextCategoryIds, t);
      }
      
      // 更新属性（仍采用全量替换）
      if (attributes !== undefined) {
        await ProductAttribute.destroy({ where: { productId: id }, transaction: t });
        if (Array.isArray(attributes) && attributes.length > 0) {
          for (const attr of attributes) {
            await ProductAttribute.create({ productId: id, ...attr }, { transaction: t });
          }
        }
      }
      
      // 更新SKU：保留原 id，避免会员价按 skuId 绑定后“偏移”
      if (skus !== undefined) {
        const incoming = Array.isArray(skus) ? skus : [];
        const existing = await ProductSKU.findAll({ where: { productId: id }, attributes: ['id'], transaction: t });
        const existingIds = new Set(existing.map(s => s.id));

        const keepIds = new Set();
        for (const raw of incoming) {
          const skuId = safeInt(raw && raw.id);
          const payload = { ...raw };
          delete payload.id;
          payload.productId = id;
          // 默认补齐 status，避免空值
          if (!payload.status) payload.status = 'active';

          if (skuId && existingIds.has(skuId)) {
            keepIds.add(skuId);
            await ProductSKU.update(payload, { where: { id: skuId, productId: id }, transaction: t });
          } else {
            const created = await ProductSKU.create(payload, { transaction: t });
            keepIds.add(created.id);
          }
        }

        // 删除不再存在的 SKU，并同步清理该 SKU 的会员价，避免脏数据
        const toDelete = Array.from(existingIds).filter(x => !keepIds.has(x));
        if (toDelete.length > 0) {
          await ProductMemberPrice.destroy({ where: { productId: id, skuId: { [Op.in]: toDelete } }, transaction: t });
          await ProductSKU.destroy({ where: { productId: id, id: { [Op.in]: toDelete } }, transaction: t });
        }
      }
    });

    // 返回完整的商品信息
    const fullProduct = await Product.findByPk(id, {
      include: [
        { model: Category, as: 'category' },
        {
          model: Category,
          as: 'categories',
          attributes: ['id', 'name'],
          through: { attributes: ['sortOrder'] },
          required: false
        },
        { model: ProductSKU, as: 'skus' },
        { model: ProductAttribute, as: 'attributes' }
      ]
    });
    let out = fullProduct ? enrichProductCategoryArrays(fullProduct.toJSON()) : null;
    if (out && out.skus) out.skus = sortSkus(out.skus);

    res.json({
      code: 0,
      message: '商品更新成功',
      data: out
    });
  } catch (error) {
    console.error('更新商品失败:', error);
    res.status(500).json({
      code: 1,
      message: '服务器错误: ' + error.message
    });
  }
});

// 上架/下架商品（仅允许 active / inactive）
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({
        code: 1,
        message: '状态只能为 active（上架）或 inactive（下架）'
      });
    }
    const product = await Product.findByPk(id);
    if (!product) {
      return res.status(404).json({
        code: 1,
        message: '商品不存在'
      });
    }
    await product.update({ status });
    res.json({
      code: 0,
      message: status === 'active' ? '已上架' : '已下架',
      data: { id: product.id, status }
    });
  } catch (error) {
    console.error('更新商品状态失败:', error);
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

    await ProductCategory.destroy({ where: { productId: id } });

    // 删除商品文件（直接调用，避免在 Cloud Run 等环境请求 localhost 导致 ECONNREFUSED）
    try {
      const result = await deleteProductFiles(id);
      if (!result.ok) {
        console.warn('删除商品文件:', result.message || '跳过');
      }
    } catch (err) {
      console.warn('删除商品文件失败:', err);
    }

    // 删除商品（会级联删除 SKU 和属性；若有订单引用则外键约束会报错）
    try {
      await product.destroy();
    } catch (err) {
      const isFk = err.errno === 1451 || (err.original && err.original.errno === 1451) ||
        err.code === 'ER_ROW_IS_REFERENCED_2' || (err.original && err.original.code === 'ER_ROW_IS_REFERENCED_2');
      if (isFk) {
        return res.status(400).json({
          code: 1,
          message: '该商品已有订单记录，无法删除。请先处理相关订单或联系管理员。'
        });
      }
      throw err;
    }

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