const { Op } = require('sequelize');

/**
 * 从请求体解析分类 ID 列表：优先 categoryIds 数组，否则 [categoryId]
 */
function normalizeCategoryIdsFromBody(body) {
    if (!body || typeof body !== 'object') return [];
    if (Array.isArray(body.categoryIds) && body.categoryIds.length > 0) {
        const out = [];
        const seen = new Set();
        for (const x of body.categoryIds) {
            const n = parseInt(x, 10);
            if (Number.isFinite(n) && n > 0 && !seen.has(n)) {
                seen.add(n);
                out.push(n);
            }
        }
        return out;
    }
    if (body.categoryId != null && body.categoryId !== '') {
        const n = parseInt(body.categoryId, 10);
        if (Number.isFinite(n) && n > 0) return [n];
    }
    return [];
}

/**
 * 同步 product_categories 行，并将 Products.categoryId 设为列表第一个（主分类）
 * @param {import('sequelize').Sequelize} sequelize
 * @param {import('sequelize').Model} Product
 * @param {import('sequelize').Model} ProductCategory
 */
async function syncProductCategories(sequelize, Product, ProductCategory, productId, categoryIds, transaction) {
    const ids = [...new Set((categoryIds || []).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0))];
    const opts = transaction ? { transaction } : {};
    await ProductCategory.destroy({ where: { productId }, ...opts });
    for (let i = 0; i < ids.length; i++) {
        await ProductCategory.create({ productId, categoryId: ids[i], sortOrder: i }, opts);
    }
    await Product.update({ categoryId: ids[0] != null ? ids[0] : null }, { where: { id: productId }, ...opts });
}

/**
 * 按分类筛选：主分类命中或关联表命中
 * @param {number|string} categoryIdRaw
 * @param {import('sequelize').Sequelize} sequelize
 */
function buildCategoryFilterWhere(categoryIdRaw, sequelize) {
    const cid = parseInt(categoryIdRaw, 10);
    if (!Number.isFinite(cid) || cid <= 0) return null;
    return {
        [Op.or]: [
            { categoryId: cid },
            // 兼容：商品主分类是「当前分类的子分类」时，也应命中当前分类筛选
            sequelize.literal(
                `EXISTS (SELECT 1 FROM \`Categories\` AS \`c_sub\` WHERE \`c_sub\`.\`id\` = \`Product\`.\`categoryId\` AND \`c_sub\`.\`parentId\` = ${cid})`
            ),
            // 须与 Sequelize 主查询别名一致：FROM `Products` AS `Product`（表名是 Products，别名是 Product）
            sequelize.literal(
                `EXISTS (SELECT 1 FROM \`product_categories\` AS \`pc\` WHERE \`pc\`.\`productId\` = \`Product\`.\`id\` AND \`pc\`.\`categoryId\` = ${cid})`
            ),
            // 兼容：商品在关联表挂的是子分类，筛选父分类时也应命中
            sequelize.literal(
                `EXISTS (
                    SELECT 1
                    FROM \`product_categories\` AS \`pc\`
                    INNER JOIN \`Categories\` AS \`c\` ON \`c\`.\`id\` = \`pc\`.\`categoryId\`
                    WHERE \`pc\`.\`productId\` = \`Product\`.\`id\`
                      AND \`c\`.\`parentId\` = ${cid}
                )`
            )
        ]
    };
}

/**
 * 合并搜索、分类、状态等到单一 where（避免 Op.or 与 Op.and 冲突）
 */
function buildAdminProductWhere({ search, categoryId, status }, sequelize) {
    const parts = [];
    if (search) {
        parts.push({
            [Op.or]: [
                { name: { [Op.like]: `%${search}%` } },
                { description: { [Op.like]: `%${search}%` } }
            ]
        });
    }
    const catW = categoryId ? buildCategoryFilterWhere(categoryId, sequelize) : null;
    if (catW) parts.push(catW);
    if (status) parts.push({ status });
    if (parts.length === 0) return {};
    if (parts.length === 1) return parts[0];
    return { [Op.and]: parts };
}

/**
 * 为商品 JSON 补充 categoryIds、categories（按 sortOrder）
 */
function enrichProductCategoryArrays(productJson, categoriesFromInclude) {
    const j = productJson && typeof productJson === 'object' ? { ...productJson } : {};
    let list = Array.isArray(categoriesFromInclude) ? categoriesFromInclude : j.categories;
    if (Array.isArray(list) && list.length > 0) {
        const sorted = list
            .map((c) => {
                const row = c && c.dataValues ? c : c;
                const through =
                    row.ProductCategory || row.product_categories || row.productCategories || {};
                const sortOrder = through.sortOrder != null ? Number(through.sortOrder) : 0;
                const id = row.id != null ? row.id : row.categoryId;
                const name = row.name;
                return { id, name, sortOrder };
            })
            .filter((x) => x.id != null)
            .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
        j.categoryIds = sorted.map((x) => x.id);
        j.categories = sorted.map((x) => ({ id: x.id, name: x.name }));
    } else if (j.categoryId) {
        j.categoryIds = [j.categoryId];
        j.categories = j.category ? [{ id: j.category.id, name: j.category.name }] : [];
    } else {
        j.categoryIds = [];
        j.categories = [];
    }
    return j;
}

/**
 * 将分类 OR 条件与现有 where 合并（小程序列表/搜索等）
 */
function mergeWhereWithCategoryFilter(baseWhere, categoryIdRaw, sequelize) {
    const catW = buildCategoryFilterWhere(categoryIdRaw, sequelize);
    if (!catW) return baseWhere;
    const keys = Object.keys(baseWhere || {});
    if (keys.length === 0) return catW;
    return { [Op.and]: [baseWhere, catW] };
}

module.exports = {
    normalizeCategoryIdsFromBody,
    syncProductCategories,
    buildCategoryFilterWhere,
    buildAdminProductWhere,
    enrichProductCategoryArrays,
    mergeWhereWithCategoryFilter
};
