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

// 显示添加促销活动模态框
function showAddPromotionModal() {
    window.promotionManagementData.currentPromotion = null;
    document.getElementById('promotionModalTitle').textContent = '添加促销活动';
    document.getElementById('promotionForm').reset();
    updateRulesConfig();
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
                <div class="rule-item">
                    <label>参与商品:</label>
                    <input type="text" id="productIds" placeholder="商品ID，用逗号分隔">
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
                <div class="rule-item">
                    <label>参与商品:</label>
                    <input type="text" id="productIds" placeholder="商品ID，用逗号分隔">
                </div>
            `;
            break;
        case 'bundle':
            rulesHTML = `
                <div class="rule-item">
                    <label>捆绑商品:</label>
                    <input type="text" id="bundleProducts" placeholder="商品ID，用逗号分隔">
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
    }
    
    rulesConfig.innerHTML = rulesHTML;
}

// 填充规则配置
function fillRulesConfig(rules) {
    if (!rules) return;
    
    Object.keys(rules).forEach(key => {
        const input = document.getElementById(key);
        if (input) {
            input.value = rules[key];
        }
    });
}

// 保存促销活动
async function savePromotion() {
    const formData = {
        name: document.getElementById('promotionName').value,
        type: document.getElementById('promotionType').value,
        description: document.getElementById('promotionDescription').value,
        startTime: document.getElementById('startTime').value,
        endTime: document.getElementById('endTime').value,
        rules: getRulesConfig()
    };

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
        case 'flash_sale':
            const discountRate = document.getElementById('discountRate');
            const limitQuantity = document.getElementById('limitQuantity');
            const productIds = document.getElementById('productIds');
            if (discountRate && discountRate.value) rules.discountRate = parseFloat(discountRate.value);
            if (limitQuantity && limitQuantity.value) rules.limitQuantity = parseInt(limitQuantity.value);
            if (productIds && productIds.value) rules.productIds = productIds.value.split(',').map(id => parseInt(id.trim()));
            break;
        case 'group_buy':
            const groupSize = document.getElementById('groupSize');
            const groupPrice = document.getElementById('groupPrice');
            const productIds2 = document.getElementById('productIds');
            if (groupSize && groupSize.value) rules.groupSize = parseInt(groupSize.value);
            if (groupPrice && groupPrice.value) rules.groupPrice = parseFloat(groupPrice.value);
            if (productIds2 && productIds2.value) rules.productIds = productIds2.value.split(',').map(id => parseInt(id.trim()));
            break;
        case 'bundle':
            const bundleProducts = document.getElementById('bundleProducts');
            const bundlePrice = document.getElementById('bundlePrice');
            const savings = document.getElementById('savings');
            if (bundleProducts && bundleProducts.value) rules.bundleProducts = bundleProducts.value.split(',').map(id => parseInt(id.trim()));
            if (bundlePrice && bundlePrice.value) rules.bundlePrice = parseFloat(bundlePrice.value);
            if (savings && savings.value) rules.savings = parseFloat(savings.value);
            break;
        case 'free_shipping':
            const minAmount = document.getElementById('minAmount');
            const regions = document.getElementById('regions');
            if (minAmount && minAmount.value) rules.minAmount = parseFloat(minAmount.value);
            if (regions && regions.value) rules.regions = regions.value.split(',').map(region => region.trim());
            break;
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
        'free_shipping': '包邮'
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

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initPromotionManagement();
});