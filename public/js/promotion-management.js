// 促销活动管理数据
window.promotionManagementData = {
    promotions: [],
    currentPage: 1,
    totalPages: 1,
    pageSize: 10,
    searchKeyword: '',
    typeFilter: '',
    statusFilter: '',
    currentPromotion: null
};

// 页面初始化
function initPromotionManagement() {
    console.log('初始化促销活动管理页面');
    loadStats();
    loadPromotions();
    bindEvents();
}

// 绑定事件
function bindEvents() {
    // 搜索输入框回车事件
    document.getElementById('searchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchPromotions();
        }
    });

    // 筛选条件变化事件
    document.getElementById('typeFilter').addEventListener('change', searchPromotions);
    document.getElementById('statusFilter').addEventListener('change', searchPromotions);
}

// 加载统计数据
async function loadStats() {
    try {
        const response = await fetch('/api/promotions/stats', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            document.getElementById('totalPromotions').textContent = result.data.total || 0;
            document.getElementById('activePromotions').textContent = result.data.active || 0;
            document.getElementById('draftPromotions').textContent = result.data.draft || 0;
            document.getElementById('endedPromotions').textContent = result.data.ended || 0;
        }
    } catch (error) {
        console.error('加载统计数据失败:', error);
    }
}

// 加载促销活动列表
async function loadPromotions() {
    try {
        const params = new URLSearchParams({
            page: window.promotionManagementData.currentPage,
            limit: window.promotionManagementData.pageSize,
            search: window.promotionManagementData.searchKeyword,
            type: window.promotionManagementData.typeFilter,
            status: window.promotionManagementData.statusFilter
        });

        const response = await fetch(`/api/promotions?${params}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            window.promotionManagementData.promotions = result.data.promotions || [];
            window.promotionManagementData.totalPages = result.data.totalPages || 1;
            renderPromotionTable();
            renderPagination();
        } else {
            alert('加载促销活动列表失败: ' + result.message);
        }
    } catch (error) {
        console.error('加载促销活动列表失败:', error);
        alert('加载促销活动列表失败');
    }
}

// 渲染促销活动表格
function renderPromotionTable() {
    const tbody = document.getElementById('promotionTableBody');
    tbody.innerHTML = '';

    window.promotionManagementData.promotions.forEach(promotion => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${promotion.id}</td>
            <td>${promotion.name}</td>
            <td><span class="type-badge">${getPromotionTypeText(promotion.type)}</span></td>
            <td><span class="status-badge status-${promotion.status}">${getStatusText(promotion.status)}</span></td>
            <td>${formatDate(promotion.startTime)}</td>
            <td>${formatDate(promotion.endTime)}</td>
            <td>${formatDate(promotion.createdAt)}</td>
            <td>
                <button class="btn btn-primary" onclick="editPromotion(${promotion.id})">编辑</button>
                <button class="btn btn-warning" onclick="togglePromotionStatus(${promotion.id})">${getToggleButtonText(promotion.status)}</button>
                <button class="btn btn-danger" onclick="deletePromotion(${promotion.id})">删除</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 渲染分页
function renderPagination() {
    const pagination = document.getElementById('pagination');
    pagination.innerHTML = '';

    const { currentPage, totalPages } = window.promotionManagementData;

    // 上一页按钮
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '上一页';
    prevBtn.disabled = currentPage <= 1;
    prevBtn.onclick = () => {
        if (currentPage > 1) {
            window.promotionManagementData.currentPage = currentPage - 1;
            loadPromotions();
        }
    };
    pagination.appendChild(prevBtn);

    // 页码按钮
    for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.textContent = i;
        pageBtn.className = i === currentPage ? 'active' : '';
        pageBtn.onclick = () => {
            window.promotionManagementData.currentPage = i;
            loadPromotions();
        };
        pagination.appendChild(pageBtn);
    }

    // 下一页按钮
    const nextBtn = document.createElement('button');
    nextBtn.textContent = '下一页';
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.onclick = () => {
        if (currentPage < totalPages) {
            window.promotionManagementData.currentPage = currentPage + 1;
            loadPromotions();
        }
    };
    pagination.appendChild(nextBtn);
}

// 搜索促销活动
function searchPromotions() {
    window.promotionManagementData.searchKeyword = document.getElementById('searchInput').value;
    window.promotionManagementData.typeFilter = document.getElementById('typeFilter').value;
    window.promotionManagementData.statusFilter = document.getElementById('statusFilter').value;
    window.promotionManagementData.currentPage = 1;
    loadPromotions();
}

// 会员等级列表缓存（参与会员等级下拉用）
window._promotionMemberLevelsCache = null;
function loadPromotionMemberLevelsForSelect(cb) {
    if (window._promotionMemberLevelsCache) {
        if (cb) cb(window._promotionMemberLevelsCache);
        return;
    }
    fetch('/api/member-levels?limit=100', {
        headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') }
    }).then(function (res) { return res.json(); }).then(function (data) {
        var levels = (data.code === 0 && data.data && data.data.levels) ? data.data.levels : [];
        window._promotionMemberLevelsCache = levels;
        if (cb) cb(levels);
    }).catch(function () { if (cb) cb([]); });
}

// 添加一条「参与会员等级」行
function addPromotionMemberLevelRow(levelId) {
    var list = document.getElementById('promotionMemberLevelsList');
    if (!list) return;
    var row = document.createElement('div');
    row.className = 'rule-item promo-member-level-row';
    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';
    row.innerHTML =
        '<select class="form-input promo-member-level-select" style="width:200px">' +
        '<option value="">请选择会员等级</option></select>' +
        '<button type="button" class="btn btn-danger btn-remove-promo-row" style="padding:4px 10px">删除</button>';
    list.appendChild(row);
    loadPromotionMemberLevelsForSelect(function (levels) {
        var sel = row.querySelector('.promo-member-level-select');
        levels.forEach(function (l) {
            var opt = document.createElement('option');
            opt.value = l.id;
            opt.textContent = l.name || '等级' + l.id;
            if (levelId != null && l.id === levelId) opt.selected = true;
            sel.appendChild(opt);
        });
    });
    row.querySelector('.btn-remove-promo-row').addEventListener('click', function () { row.remove(); });
}

// 获取参与会员等级ID列表（从逐行选择中收集）
function getPromotionMemberLevelIds() {
    var rows = document.querySelectorAll('#promotionMemberLevelsList .promo-member-level-row');
    var ids = [];
    rows.forEach(function (row) {
        var sel = row.querySelector('.promo-member-level-select');
        if (sel && sel.value) ids.push(parseInt(sel.value, 10));
    });
    return ids;
}

// 添加一条「参与商品」行（限时抢购、团购用）
function addPromotionProductRow(productId) {
    var list = document.getElementById('promotionProductIdsList');
    addGenericPromotionProductRow(list, productId);
}

// 添加一条「参与商品」行（满赠规则用）
function addFullGiftParticipatingProductRow(productId) {
    var list = document.getElementById('fullGiftParticipatingProductIdsList');
    addGenericPromotionProductRow(list, productId);
}

// 通用：向指定容器添加参与商品行
function addGenericPromotionProductRow(list, productId) {
    if (!list) return;
    var row = document.createElement('div');
    row.className = 'rule-item promo-product-row';
    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';
    row.innerHTML =
        '<select class="form-input promo-product-select" style="width:220px">' +
        '<option value="">请选择商品</option></select>' +
        '<button type="button" class="btn btn-danger btn-remove-promo-row" style="padding:4px 10px">删除</button>';
    list.appendChild(row);
    loadPromotionProducts(function (products) {
        var sel = row.querySelector('.promo-product-select');
        products.forEach(function (p) {
            var opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = (p.name || '') + (p.id ? ' (ID:' + p.id + ')' : '');
            if (productId != null && p.id === productId) opt.selected = true;
            sel.appendChild(opt);
        });
    });
    row.querySelector('.btn-remove-promo-row').addEventListener('click', function () { row.remove(); });
}

// 添加一条「捆绑商品」行
function addPromotionBundleProductRow(productId) {
    var list = document.getElementById('promotionBundleProductsList');
    if (!list) return;
    var row = document.createElement('div');
    row.className = 'rule-item promo-bundle-product-row';
    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';
    row.innerHTML =
        '<select class="form-input promo-bundle-product-select" style="width:220px">' +
        '<option value="">请选择商品</option></select>' +
        '<button type="button" class="btn btn-danger btn-remove-promo-row" style="padding:4px 10px">删除</button>';
    list.appendChild(row);
    loadPromotionProducts(function (products) {
        var sel = row.querySelector('.promo-bundle-product-select');
        products.forEach(function (p) {
            var opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = (p.name || '') + (p.id ? ' (ID:' + p.id + ')' : '');
            if (productId != null && p.id === productId) opt.selected = true;
            sel.appendChild(opt);
        });
    });
    row.querySelector('.btn-remove-promo-row').addEventListener('click', function () { row.remove(); });
}

// 显示添加促销活动模态框
function showAddPromotionModal() {
    window.promotionManagementData.currentPromotion = null;
    document.getElementById('promotionModalTitle').textContent = '添加促销活动';
    document.getElementById('promotionForm').reset();
    updateRulesConfig();
    var list = document.getElementById('promotionMemberLevelsList');
    if (list) list.innerHTML = '';
    document.getElementById('promotionModal').classList.add('show');
}

// 编辑促销活动
function editPromotion(promotionId) {
    const promotion = window.promotionManagementData.promotions.find(p => p.id === promotionId);
    if (!promotion) return;

    window.promotionManagementData.currentPromotion = promotion;
    document.getElementById('promotionModalTitle').textContent = '编辑促销活动';
    
    // 填充表单数据
    document.getElementById('promotionName').value = promotion.name;
    document.getElementById('promotionType').value = promotion.type;
    document.getElementById('promotionDescription').value = promotion.description || '';
    document.getElementById('startTime').value = formatDateTimeLocal(promotion.startTime);
    document.getElementById('endTime').value = formatDateTimeLocal(promotion.endTime);
    
    // 更新规则配置
    updateRulesConfig();
    
    // 如果有规则配置，填充到表单中
    if (promotion.rules) {
        fillRulesConfig(promotion.rules);
    }

    var memberList = document.getElementById('promotionMemberLevelsList');
    if (memberList) {
        memberList.innerHTML = '';
        (promotion.memberLevelIds || []).forEach(function (id) { addPromotionMemberLevelRow(id); });
    }

    document.getElementById('promotionModal').classList.add('show');
}

// 更新规则配置界面
function updateRulesConfig() {
    const type = document.getElementById('promotionType').value;
    const rulesConfig = document.getElementById('rulesConfig');
    
    let rulesHTML = '';
    
    switch (type) {
        case 'flash_sale':
            rulesHTML = `
                <div class="rule-item">
                    <label>折扣率:</label>
                    <input type="number" id="discountRate" min="0" max="100" step="0.1" placeholder="例如: 20">
                    <span>%</span>
                </div>
                <div class="rule-item">
                    <label>限购数量:</label>
                    <input type="number" id="limitQuantity" min="1" placeholder="例如: 1">
                </div>
            `;
            break;
        case 'group_buy':
            rulesHTML = `
                <div class="rule-item">
                    <label>团购人数:</label>
                    <input type="number" id="groupSize" min="2" placeholder="例如: 5">
                </div>
                <div class="rule-item">
                    <label>团购价格:</label>
                    <input type="number" id="groupPrice" min="0" step="0.01" placeholder="例如: 99.00">
                </div>
            `;
            break;
        case 'bundle':
            rulesHTML = `
                <div class="rule-item">
                    <label>捆绑商品:</label>
                    <div id="promotionBundleProductsList" class="promo-row-list"></div>
                    <button type="button" class="btn btn-primary" style="margin-top:8px" onclick="addPromotionBundleProductRow()">+ 添加捆绑商品</button>
                </div>
                <div class="rule-item">
                    <label>捆绑价格:</label>
                    <input type="number" id="bundlePrice" min="0" step="0.01" placeholder="例如: 199.00">
                </div>
                <div class="rule-item">
                    <label>节省金额:</label>
                    <input type="number" id="savings" min="0" step="0.01" placeholder="例如: 50.00">
                </div>
            `;
            break;
        case 'free_shipping':
            rulesHTML = `
                <div class="rule-item">
                    <label>最低消费金额:</label>
                    <input type="number" id="minAmount" min="0" step="0.01" placeholder="例如: 99.00">
                </div>
                <div class="rule-item">
                    <label>适用地区:</label>
                    <input type="text" id="regions" placeholder="例如: 全国,北京,上海">
                </div>
            `;
            break;
        case 'full_reduction':
            rulesHTML = `
                <div class="rule-item">
                    <label>满减规则（金额）:</label>
                    <input type="number" id="fullReductionMinAmount" min="0" step="0.01" placeholder="满多少元"> 元
                    <input type="number" id="fullReductionDiscountAmount" min="0" step="0.01" placeholder="减多少元"> 元
                </div>
            `;
            break;
        case 'full_gift':
            rulesHTML = `
                <div class="rule-item">
                    <label>参与商品（可选，不选则全部商品参与）:</label>
                    <div id="fullGiftParticipatingProductIdsList" class="promo-row-list"></div>
                    <button type="button" class="btn btn-primary" style="margin-top:8px" onclick="addFullGiftParticipatingProductRow()">+ 添加参与商品</button>
                </div>
                <div id="fullGiftRulesList"></div>
                <button type="button" class="btn btn-primary" style="margin-top:8px" onclick="addFullGiftRuleRow()">+ 添加满送规则</button>
            `;
            break;
        case 'full_discount':
            rulesHTML = `
                <div id="fullDiscountRulesList"></div>
                <button type="button" class="btn btn-primary" style="margin-top:8px" onclick="addFullDiscountRuleRow()">+ 添加满折规则</button>
            `;
            break;
    }
    
    rulesConfig.innerHTML = rulesHTML;
    var productsWrap = document.getElementById('promotionProductsWrap');
    if (productsWrap) {
        productsWrap.style.display = (type === 'flash_sale' || type === 'group_buy') ? 'block' : 'none';
    }
}

// 填充规则配置
function fillRulesConfig(rules) {
    if (!rules) return;

    if (rules.fullReductionRules && rules.fullReductionRules.length > 0) {
        const r = rules.fullReductionRules[0];
        const minInput = document.getElementById('fullReductionMinAmount');
        const discountInput = document.getElementById('fullReductionDiscountAmount');
        if (minInput) minInput.value = r.minAmount || '';
        if (discountInput) discountInput.value = r.discountAmount || '';
    }

    if (rules.productIds && Array.isArray(rules.productIds)) {
        var type = document.getElementById('promotionType') ? document.getElementById('promotionType').value : '';
        var listId = type === 'full_gift' ? 'fullGiftParticipatingProductIdsList' : 'promotionProductIdsList';
        var list = document.getElementById(listId);
        if (list) {
            list.innerHTML = '';
            rules.productIds.forEach(function (pid) {
                if (type === 'full_gift') {
                    addFullGiftParticipatingProductRow(pid);
                } else {
                    addPromotionProductRow(pid);
                }
            });
        }
    }
    if (rules.bundleProducts && Array.isArray(rules.bundleProducts)) {
        var list = document.getElementById('promotionBundleProductsList');
        if (list) {
            list.innerHTML = '';
            rules.bundleProducts.forEach(function (pid) { addPromotionBundleProductRow(pid); });
        }
    }

    if (rules.fullGiftRules && Array.isArray(rules.fullGiftRules)) {
        const list = document.getElementById('fullGiftRulesList');
        if (list) {
            list.innerHTML = '';
            rules.fullGiftRules.forEach(function (r) { addFullGiftRuleRow(r); });
        }
    }
    if (rules.fullDiscountRules && Array.isArray(rules.fullDiscountRules)) {
        const list = document.getElementById('fullDiscountRulesList');
        if (list) {
            list.innerHTML = '';
            rules.fullDiscountRules.forEach(function (r) { addFullDiscountRuleRow(r); });
        }
    }
    
    Object.keys(rules).forEach(key => {
        if (key === 'fullGiftRules' || key === 'fullDiscountRules' || key === 'fullReductionRules' || key === 'productIds' || key === 'bundleProducts') return;
        const input = document.getElementById(key);
        if (input) {
            input.value = Array.isArray(rules[key]) ? JSON.stringify(rules[key]) : (rules[key] || '');
        }
    });
}

// 商品列表缓存（满送规则选赠品用）
window._promotionProductsCache = null;
window._promotionProductSkusCache = {};
function loadPromotionProducts(cb) {
    if (window._promotionProductsCache) {
        if (cb) cb(window._promotionProductsCache);
        return;
    }
    fetch('/api/products?limit=200&status=active', {
        headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') }
    }).then(function (res) { return res.json(); }).then(function (data) {
        var list = (data.code === 0 && data.data && data.data.products) ? data.data.products : [];
        window._promotionProductsCache = list;
        if (cb) cb(list);
    }).catch(function () { if (cb) cb([]); });
}

function loadPromotionProductSkus(productId, cb) {
    var pid = parseInt(productId, 10);
    if (!pid || pid <= 0) {
        if (cb) cb([]);
        return;
    }
    if (window._promotionProductSkusCache[pid]) {
        if (cb) cb(window._promotionProductSkusCache[pid]);
        return;
    }
    fetch('/api/products/' + pid, {
        headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') }
    }).then(function (res) { return res.json(); }).then(function (data) {
        var product = (data && data.code === 0 && data.data) ? data.data : null;
        var skus = (product && Array.isArray(product.skus)) ? product.skus : [];
        window._promotionProductSkusCache[pid] = skus;
        if (cb) cb(skus);
    }).catch(function () {
        if (cb) cb([]);
    });
}

function addFullGiftRuleRow(rule) {
    rule = rule || {};
    var list = document.getElementById('fullGiftRulesList');
    if (!list) return;
    var row = document.createElement('div');
    row.className = 'rule-item full-gift-rule-row';
    row.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;';
    var condType = rule.conditionType || 'amount';
    row.innerHTML =
        '<select class="form-input cond-type" style="width:100px">' +
        '<option value="amount"' + (condType === 'amount' ? ' selected' : '') + '>满金额</option>' +
        '<option value="quantity"' + (condType === 'quantity' ? ' selected' : '') + '>满件数</option>' +
        '</select>' +
        '<span class="cond-amount-wrap"><input type="number" class="form-input min-amount" placeholder="满多少元" min="0" step="0.01" value="' + (rule.minAmount != null ? rule.minAmount : '') + '" style="width:100px"> 元</span>' +
        '<span class="cond-qty-wrap" style="display:none"><input type="number" class="form-input min-quantity" placeholder="满几件" min="1" value="' + (rule.minQuantity != null ? rule.minQuantity : '') + '" style="width:80px"> 件</span>' +
        '<select class="form-input gift-product-id" style="width:180px"><option value="">请选择赠品</option></select>' +
        '<select class="form-input gift-sku-id" style="width:210px"><option value="">默认规格（不指定SKU）</option></select>' +
        '<input type="number" class="form-input gift-quantity" placeholder="数量" min="1" value="' + (rule.giftQuantity != null ? rule.giftQuantity : 1) + '" style="width:70px"> 件' +
        '<button type="button" class="btn btn-danger btn-remove-promo-rule" style="padding:4px 10px">删除</button>';
    list.appendChild(row);
    var condTypeSel = row.querySelector('.cond-type');
    var amountWrap = row.querySelector('.cond-amount-wrap');
    var qtyWrap = row.querySelector('.cond-qty-wrap');
    function toggleCond() {
        var isAmount = condTypeSel.value === 'amount';
        amountWrap.style.display = isAmount ? 'inline' : 'none';
        qtyWrap.style.display = isAmount ? 'none' : 'inline';
        if (!isAmount) row.querySelector('.min-amount').value = '';
        else row.querySelector('.min-quantity').value = '';
    }
    condTypeSel.addEventListener('change', toggleCond);
    toggleCond();
    row.querySelector('.btn-remove-promo-rule').addEventListener('click', function () { row.remove(); });
    function fillSkuOptions(productId, selectedSkuId) {
        var skuSel = row.querySelector('.gift-sku-id');
        if (!skuSel) return;
        skuSel.innerHTML = '<option value="">默认规格（不指定SKU）</option>';
        if (!productId) return;
        loadPromotionProductSkus(productId, function (skus) {
            skus.forEach(function (sku) {
                var opt = document.createElement('option');
                opt.value = sku.id;
                var specText = sku.specifications ? JSON.stringify(sku.specifications) : '';
                var stockText = (sku.stock != null ? ' 库存:' + sku.stock : '');
                opt.textContent = (sku.skuCode || ('SKU#' + sku.id)) + (specText ? ' ' + specText : '') + stockText;
                if (selectedSkuId && Number(sku.id) === Number(selectedSkuId)) opt.selected = true;
                skuSel.appendChild(opt);
            });
        });
    }
    loadPromotionProducts(function (products) {
        var sel = row.querySelector('.gift-product-id');
        products.forEach(function (p) {
            var opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = (p.name || '') + (p.id ? ' (ID:' + p.id + ')' : '');
            if (rule.giftProductId && p.id === rule.giftProductId) opt.selected = true;
            sel.appendChild(opt);
        });
        sel.addEventListener('change', function () {
            fillSkuOptions(sel.value, null);
        });
        fillSkuOptions(rule.giftProductId, rule.giftSkuId);
    });
}

function addFullDiscountRuleRow(rule) {
    rule = rule || {};
    var list = document.getElementById('fullDiscountRulesList');
    if (!list) return;
    var row = document.createElement('div');
    row.className = 'rule-item full-discount-rule-row';
    row.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;';
    var condType = rule.conditionType || 'amount';
    var rate = rule.discountRate != null ? rule.discountRate : 0.9;
    row.innerHTML =
        '<select class="form-input cond-type" style="width:100px">' +
        '<option value="amount"' + (condType === 'amount' ? ' selected' : '') + '>满金额</option>' +
        '<option value="quantity"' + (condType === 'quantity' ? ' selected' : '') + '>满件数</option>' +
        '</select>' +
        '<span class="cond-amount-wrap"><input type="number" class="form-input min-amount" placeholder="满多少元" min="0" step="0.01" value="' + (rule.minAmount != null ? rule.minAmount : '') + '" style="width:100px"> 元</span>' +
        '<span class="cond-qty-wrap" style="display:none"><input type="number" class="form-input min-quantity" placeholder="满几件" min="1" value="' + (rule.minQuantity != null ? rule.minQuantity : '') + '" style="width:80px"> 件</span>' +
        ' 享 <input type="number" class="form-input discount-rate" placeholder="0.9=9折" min="0.01" max="1" step="0.01" value="' + rate + '" style="width:70px"> 折（0.9即9折）' +
        '<button type="button" class="btn btn-danger btn-remove-promo-rule" style="padding:4px 10px">删除</button>';
    list.appendChild(row);
    var condTypeSel = row.querySelector('.cond-type');
    var amountWrap = row.querySelector('.cond-amount-wrap');
    var qtyWrap = row.querySelector('.cond-qty-wrap');
    function toggleCond() {
        var isAmount = condTypeSel.value === 'amount';
        amountWrap.style.display = isAmount ? 'inline' : 'none';
        qtyWrap.style.display = isAmount ? 'none' : 'inline';
    }
    condTypeSel.addEventListener('change', toggleCond);
    toggleCond();
    row.querySelector('.btn-remove-promo-rule').addEventListener('click', function () { row.remove(); });
}

// 保存促销活动
async function savePromotion() {
    const formData = {
        name: document.getElementById('promotionName').value,
        type: document.getElementById('promotionType').value,
        description: document.getElementById('promotionDescription').value,
        startTime: document.getElementById('startTime').value,
        endTime: document.getElementById('endTime').value,
        rules: getRulesConfig(),
        memberLevelIds: getPromotionMemberLevelIds()
    };
    if (formData.memberLevelIds.length === 0) formData.memberLevelIds = null;

    try {
        const url = window.promotionManagementData.currentPromotion 
            ? `/api/promotions/${window.promotionManagementData.currentPromotion.id}`
            : '/api/promotions';
        
        const method = window.promotionManagementData.currentPromotion ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (result.code === 0) {
            alert('保存成功');
            closePromotionModal();
            loadPromotions();
            loadStats();
        } else {
            alert('保存失败: ' + result.message);
        }
    } catch (error) {
        console.error('保存促销活动失败:', error);
        alert('保存失败');
    }
}

// 获取规则配置
function getRulesConfig() {
    const type = document.getElementById('promotionType').value;
    const rules = {};
    
    switch (type) {
        case 'flash_sale': {
            const discountRate = document.getElementById('discountRate');
            const limitQuantity = document.getElementById('limitQuantity');
            if (discountRate && discountRate.value) rules.discountRate = parseFloat(discountRate.value);
            if (limitQuantity && limitQuantity.value) rules.limitQuantity = parseInt(limitQuantity.value);
            var productRows = document.querySelectorAll('#promotionProductIdsList .promo-product-row');
            var pids = [];
            productRows.forEach(function (row) {
                var sel = row.querySelector('.promo-product-select');
                if (sel && sel.value) pids.push(parseInt(sel.value, 10));
            });
            if (pids.length > 0) rules.productIds = pids;
            break;
        }
        case 'group_buy': {
            const groupSize = document.getElementById('groupSize');
            const groupPrice = document.getElementById('groupPrice');
            if (groupSize && groupSize.value) rules.groupSize = parseInt(groupSize.value);
            if (groupPrice && groupPrice.value) rules.groupPrice = parseFloat(groupPrice.value);
            var productRows2 = document.querySelectorAll('#promotionProductIdsList .promo-product-row');
            var pids2 = [];
            productRows2.forEach(function (row) {
                var sel = row.querySelector('.promo-product-select');
                if (sel && sel.value) pids2.push(parseInt(sel.value, 10));
            });
            if (pids2.length > 0) rules.productIds = pids2;
            break;
        }
        case 'bundle': {
            const bundlePrice = document.getElementById('bundlePrice');
            const savings = document.getElementById('savings');
            if (bundlePrice && bundlePrice.value) rules.bundlePrice = parseFloat(bundlePrice.value);
            if (savings && savings.value) rules.savings = parseFloat(savings.value);
            var bundleRows = document.querySelectorAll('#promotionBundleProductsList .promo-bundle-product-row');
            var bpids = [];
            bundleRows.forEach(function (row) {
                var sel = row.querySelector('.promo-bundle-product-select');
                if (sel && sel.value) bpids.push(parseInt(sel.value, 10));
            });
            if (bpids.length > 0) rules.bundleProducts = bpids;
            break;
        }
        case 'free_shipping':
            const minAmount = document.getElementById('minAmount');
            const regions = document.getElementById('regions');
            if (minAmount && minAmount.value) rules.minAmount = parseFloat(minAmount.value);
            if (regions && regions.value) rules.regions = regions.value.split(',').map(region => region.trim());
            break;
        case 'full_reduction':
            const fullReductionMinAmount = document.getElementById('fullReductionMinAmount');
            const fullReductionDiscountAmount = document.getElementById('fullReductionDiscountAmount');
            if (fullReductionMinAmount && fullReductionMinAmount.value && fullReductionDiscountAmount && fullReductionDiscountAmount.value) {
                rules.fullReductionRules = [{
                    conditionType: 'amount',
                    minAmount: parseFloat(fullReductionMinAmount.value),
                    discountAmount: parseFloat(fullReductionDiscountAmount.value)
                }];
            }
            break;
        case 'full_gift': {
            var giftProductRows = document.querySelectorAll('#fullGiftParticipatingProductIdsList .promo-product-row');
            var giftProductIds = [];
            giftProductRows.forEach(function (row) {
                var psel = row.querySelector('.promo-product-select');
                if (psel && psel.value) giftProductIds.push(parseInt(psel.value, 10));
            });
            if (giftProductIds.length > 0) rules.productIds = giftProductIds;

            const giftRows = document.querySelectorAll('#fullGiftRulesList .full-gift-rule-row');
            rules.fullGiftRules = [];
            giftRows.forEach(function (row) {
                var condType = row.querySelector('.cond-type').value;
                var giftProductId = parseInt(row.querySelector('.gift-product-id').value, 10);
                var giftSkuIdRaw = row.querySelector('.gift-sku-id') ? row.querySelector('.gift-sku-id').value : '';
                var giftQuantity = parseInt(row.querySelector('.gift-quantity').value, 10) || 1;
                if (!giftProductId) return;
                var r = { conditionType: condType, giftProductId: giftProductId, giftQuantity: giftQuantity };
                if (giftSkuIdRaw) {
                    var giftSkuId = parseInt(giftSkuIdRaw, 10);
                    if (!isNaN(giftSkuId) && giftSkuId > 0) r.giftSkuId = giftSkuId;
                }
                if (condType === 'amount') {
                    var ma = parseFloat(row.querySelector('.min-amount').value);
                    if (!isNaN(ma)) r.minAmount = ma;
                } else {
                    var mq = parseInt(row.querySelector('.min-quantity').value, 10);
                    if (!isNaN(mq)) r.minQuantity = mq;
                }
                rules.fullGiftRules.push(r);
            });
            break;
        }
        case 'full_discount': {
            const discountRows = document.querySelectorAll('#fullDiscountRulesList .full-discount-rule-row');
            rules.fullDiscountRules = [];
            discountRows.forEach(function (row) {
                var condType = row.querySelector('.cond-type').value;
                var rate = parseFloat(row.querySelector('.discount-rate').value);
                if (isNaN(rate) || rate <= 0 || rate > 1) return;
                var r = { conditionType: condType, discountRate: rate };
                if (condType === 'amount') {
                    var ma = parseFloat(row.querySelector('.min-amount').value);
                    if (!isNaN(ma)) r.minAmount = ma;
                } else {
                    var mq = parseInt(row.querySelector('.min-quantity').value, 10);
                    if (!isNaN(mq)) r.minQuantity = mq;
                }
                rules.fullDiscountRules.push(r);
            });
            break;
        }
    }
    
    return rules;
}

// 切换促销活动状态
async function togglePromotionStatus(promotionId) {
    const promotion = window.promotionManagementData.promotions.find(p => p.id === promotionId);
    if (!promotion) return;

    let newStatus;
    let action;
    
    switch (promotion.status) {
        case 'draft':
            newStatus = 'active';
            action = '启动';
            break;
        case 'active':
            newStatus = 'paused';
            action = '暂停';
            break;
        case 'paused':
            newStatus = 'active';
            action = '恢复';
            break;
        default:
            alert('当前状态无法切换');
            return;
    }

    if (!confirm(`确定要${action}这个促销活动吗？`)) return;

    try {
        const response = await fetch(`/api/promotions/${promotionId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ status: newStatus })
        });
        
        const result = await response.json();
        
        if (result.code === 0) {
            alert(`${action}成功`);
            loadPromotions();
            loadStats();
        } else {
            alert(`${action}失败: ` + result.message);
        }
    } catch (error) {
        console.error(`${action}促销活动失败:`, error);
        alert(`${action}失败`);
    }
}

// 删除促销活动
async function deletePromotion(promotionId) {
    if (!confirm('确定要删除这个促销活动吗？')) return;

    try {
        const response = await fetch(`/api/promotions/${promotionId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const result = await response.json();
        
        if (result.code === 0) {
            alert('删除成功');
            loadPromotions();
            loadStats();
        } else {
            alert('删除失败: ' + result.message);
        }
    } catch (error) {
        console.error('删除促销活动失败:', error);
        alert('删除失败');
    }
}

// 关闭模态框
function closePromotionModal() {
    document.getElementById('promotionModal').classList.remove('show');
}

// 工具函数
function getPromotionTypeText(type) {
    const typeMap = {
        'flash_sale': '限时抢购',
        'group_buy': '团购',
        'bundle': '捆绑销售',
        'free_shipping': '包邮',
        'full_reduction': '满减',
        'full_gift': '满送',
        'full_discount': '满折'
    };
    return typeMap[type] || type;
}

function getStatusText(status) {
    const statusMap = {
        'draft': '草稿',
        'active': '进行中',
        'paused': '已暂停',
        'ended': '已结束'
    };
    return statusMap[status] || status;
}

function getToggleButtonText(status) {
    const buttonMap = {
        'draft': '启动',
        'active': '暂停',
        'paused': '恢复',
        'ended': '已结束'
    };
    return buttonMap[status] || '操作';
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN', { hour12: false });
}

function formatDateTimeLocal(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// 供 PageLoader 调用；直接打开页面时也执行一次
window.PromotionManagement = { init: initPromotionManagement };
document.addEventListener('DOMContentLoaded', function() {
    initPromotionManagement();
});