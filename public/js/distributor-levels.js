// 全局数据存储（控制台设置 distributorLevelsData.debugLog = true 可打开提交/编辑/删除的请求与响应日志）
window.distributorLevelsData = {
    levels: [],
    currentPage: 1,
    totalPages: 1,
    pageSize: 10,
    searchKeyword: '',
    statusFilter: '',
    editingLevel: null,
    currentMode: 'distributor',
    debugLog: false
};

// 页面初始化
function initDistributorLevels() {
    console.log('初始化分销等级管理页面');
    loadStats();
    loadLevels();
    bindEvents();
}

// 绑定事件
function bindEvents() {
    // 搜索输入框回车事件
    document.getElementById('searchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchLevels();
        }
    });

    // 搜索按钮点击事件
    document.getElementById('searchBtn').addEventListener('click', searchLevels);

    // 筛选器变化事件
    document.getElementById('statusFilter').addEventListener('change', searchLevels);

    // 添加等级按钮
    document.getElementById('addLevelBtn').addEventListener('click', openAddLevelModal);

    // 表单提交事件
    document.getElementById('levelForm').addEventListener('submit', submitLevelForm);

    // 模态框关闭事件
    document.getElementById('levelModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeLevelModal();
        }
    });

    // 模式切换事件
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            switchMode(this.dataset.mode);
        });
    });
}

// 加载统计信息
async function loadStats() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/distributor-levels/stats/overview', {  // 修复：添加 /overview
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            renderStats(result.data);
        }
    } catch (error) {
        console.error('加载统计信息失败:', error);
    }
}

// 渲染统计信息
function renderStats(data) {
    const statsGrid = document.getElementById('statsGrid');
    statsGrid.innerHTML = `
        <div class="stat-card">
            <div class="stat-value">${data.totalLevels || 0}</div>
            <div class="stat-label">总等级数</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${data.activeLevels || 0}</div>
            <div class="stat-label">正常等级</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${data.inactiveLevels || 0}</div>
            <div class="stat-label">停用等级</div>
        </div>
    `;
}

// 加载等级列表
async function loadLevels() {
    try {
        const token = localStorage.getItem('token');
        const params = new URLSearchParams({
            page: window.distributorLevelsData.currentPage,
            limit: window.distributorLevelsData.pageSize,
            search: window.distributorLevelsData.searchKeyword,
            status: window.distributorLevelsData.statusFilter
        });

        const response = await fetch(`/api/distributor-levels?${params}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            window.distributorLevelsData.levels = result.data.levels;
            window.distributorLevelsData.totalPages = result.data.totalPages;  // 修复：使用 totalPages
            renderLevels();
            renderPagination();
        }
    } catch (error) {
        console.error('加载等级列表失败:', error);
    }
}

// 判断等级类型：采购成本 > 0 为分销商，否则为分享赚钱
function getLevelType(level) {
    return safeNum(level.procurementCost) > 0 ? 'distributor' : 'sharer';
}

function safeNum(v) {
    if (v == null || v === '' || Number.isNaN(Number(v))) return 0;
    return Number(v);
}

// 渲染等级列表
function renderLevels() {
    const tbody = document.getElementById('levelTableBody');
    tbody.innerHTML = '';

    window.distributorLevelsData.levels.forEach(level => {
        const type = getLevelType(level);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${level.id}</td>
            <td>${level.name}</td>
            <td>${level.level}</td>
            <td>
                <span class="level-type-badge level-type-${type}">
                    ${type === 'sharer' ? '分享赚钱' : '分销商'}
                </span>
            </td>
            <td>${formatSalesRange(level.minSales, level.maxSales)}</td>
            <td>${formatFansRange(level.minFans, level.maxFans)}</td>
            <td>${formatProcurementCost(level.procurementCost)}</td>
            <td>${formatCommissionRates(level.sharerDirectCommissionRate, level.sharerIndirectCommissionRate)}</td>
            <td>
                <span class="status-badge status-${level.status}">
                    ${getStatusText(level.status)}
                </span>
            </td>
            <td>${level.sortOrder}</td>
            <td>
                <button class="btn btn-sm btn-warning" onclick="editLevel(${level.id})">编辑</button>
                <button class="btn btn-sm btn-danger" onclick="deleteLevel(${level.id})">删除</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 渲染分页
function renderPagination() {
    const pagination = document.getElementById('pagination');
    pagination.innerHTML = '';

    const currentPage = window.distributorLevelsData.currentPage;
    const totalPages = window.distributorLevelsData.totalPages;

    // 上一页按钮
    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn btn-sm btn-outline-primary';
    prevBtn.textContent = '上一页';
    prevBtn.disabled = currentPage <= 1;
    prevBtn.onclick = () => goToPage(currentPage - 1);
    pagination.appendChild(prevBtn);

    // 页码按钮
    for (let i = Math.max(1, currentPage - 2); i <= Math.min(totalPages, currentPage + 2); i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `btn btn-sm ${i === currentPage ? 'btn-primary' : 'btn-outline-primary'}`;
        pageBtn.textContent = i;
        pageBtn.onclick = () => goToPage(i);
        pagination.appendChild(pageBtn);
    }

    // 下一页按钮
    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn btn-sm btn-outline-primary';
    nextBtn.textContent = '下一页';
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.onclick = () => goToPage(currentPage + 1);
    pagination.appendChild(nextBtn);
}

// 跳转页面
function goToPage(page) {
    if (page >= 1 && page <= window.distributorLevelsData.totalPages) {
        window.distributorLevelsData.currentPage = page;
        loadLevels();
    }
}

// 搜索等级
function searchLevels() {
    window.distributorLevelsData.searchKeyword = document.getElementById('searchInput').value;
    window.distributorLevelsData.statusFilter = document.getElementById('statusFilter').value;
    window.distributorLevelsData.currentPage = 1;
    loadLevels();
}

// 切换模式
function switchMode(mode) {
    // 更新标签状态
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`[data-mode="${mode}"]`).classList.add('active');
    
    // 显示/隐藏对应内容
    document.getElementById('distributorMode').classList.toggle('active', mode === 'distributor');
    document.getElementById('sharerMode').classList.toggle('active', mode === 'sharer');
    
    // 动态设置required属性
    const procurementCostField = document.getElementById('procurementCost');
    const sharerDirectField = document.getElementById('sharerDirectCommissionRate');
    const sharerIndirectField = document.getElementById('sharerIndirectCommissionRate');
    
    if (mode === 'distributor') {
        // 分销商模式：采购成本必填，分享佣金字段不必填
        procurementCostField.required = true;
        sharerDirectField.required = false;
        sharerIndirectField.required = false;
        
        // 清空分享佣金字段的值
        sharerDirectField.value = '';
        sharerIndirectField.value = '';
    } else {
        // 分享赚钱模式：分享佣金字段必填，采购成本不必填
        procurementCostField.required = false;
        sharerDirectField.required = true;
        sharerIndirectField.required = true;
        
        // 清空采购成本字段的值
        procurementCostField.value = '';
    }
}

// 打开添加等级模态框
function openAddLevelModal() {
    document.getElementById('levelModalTitle').textContent = '添加分销等级';
    document.getElementById('levelForm').reset();
    document.getElementById('levelModal').style.display = 'flex';
    window.distributorLevelsData.editingLevel = null;
    
    // 设置默认模式为分销商模式
    switchMode('distributor');
    clearPrivileges();
}

// 编辑等级
async function editLevel(id) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/distributor-levels/${id}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            const level = result.data.level || result.data;
            if (window.distributorLevelsData.debugLog) {
                console.log('[分销等级] 编辑加载 id=%s type=%s procurementCost=%s sharerDirect=%s', level.id, getLevelType(level), level.procurementCost, level.sharerDirectCommissionRate);
            }
            window.distributorLevelsData.editingLevel = level;
            fillLevelForm(level);
            document.getElementById('levelModalTitle').textContent = '编辑分销等级';
            document.getElementById('levelModal').style.display = 'flex';
        }
    } catch (error) {
        console.error('获取等级信息失败:', error);
        alert('获取等级信息失败');
    }
}

// 填充等级表单（先填所有字段，再按类型切到对应模式）
function fillLevelForm(level) {
    document.getElementById('name').value = level.name || '';
    document.getElementById('level').value = level.level ?? '';
    document.getElementById('minSales').value = level.minSales != null ? level.minSales : '';
    document.getElementById('maxSales').value = level.maxSales != null ? level.maxSales : '';
    document.getElementById('minFans').value = level.minFans != null ? level.minFans : '';
    document.getElementById('maxFans').value = level.maxFans != null ? level.maxFans : '';
    document.getElementById('procurementCost').value = level.procurementCost != null ? level.procurementCost : '';
    document.getElementById('sharerDirectCommissionRate').value = level.sharerDirectCommissionRate != null ? level.sharerDirectCommissionRate : '';
    document.getElementById('sharerIndirectCommissionRate').value = level.sharerIndirectCommissionRate != null ? level.sharerIndirectCommissionRate : '';
    document.getElementById('color').value = level.color || '#1890ff';
    document.getElementById('icon').value = level.icon || '';
    document.getElementById('description').value = level.description || '';
    document.getElementById('status').value = level.status || 'active';
    document.getElementById('sortOrder').value = level.sortOrder ?? 0;
    // 按类型切换到对应模式（采购成本>0 为分销商，否则为分享赚钱）
    if (getLevelType(level) === 'sharer') {
        switchMode('sharer');
    } else {
        switchMode('distributor');
    }
    renderPrivileges(level.privileges || {});
}

// 提交等级表单（按当前选中的模式提交：分享模式送 procurementCost=0，分销商模式送分享佣金=0）
async function submitLevelForm(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    const isSharerMode = document.getElementById('sharerMode') && document.getElementById('sharerMode').classList.contains('active');
    
    const levelData = {
        name: formData.get('name'),
        level: parseInt(formData.get('level'), 10) || 0,
        minSales: parseFloat(formData.get('minSales')) || 0,
        maxSales: formData.get('maxSales') === '' ? null : parseFloat(formData.get('maxSales')),
        minFans: parseInt(formData.get('minFans'), 10) || 0,
        maxFans: formData.get('maxFans') === '' ? null : parseInt(formData.get('maxFans'), 10),
        color: formData.get('color'),
        icon: formData.get('icon'),
        sortOrder: parseInt(formData.get('sortOrder'), 10) || 0,
        status: formData.get('status'),
        description: formData.get('description'),
        privileges: getPrivileges()
    };
    
    if (isSharerMode) {
        levelData.procurementCost = 0;
        levelData.sharerDirectCommissionRate = parseFloat(formData.get('sharerDirectCommissionRate')) || 0;
        levelData.sharerIndirectCommissionRate = parseFloat(formData.get('sharerIndirectCommissionRate')) || 0;
    } else {
        levelData.procurementCost = parseFloat(formData.get('procurementCost')) || 0;
        levelData.sharerDirectCommissionRate = 0;
        levelData.sharerIndirectCommissionRate = 0;
    }
    
    if (!levelData.name) {
        alert('等级名称不能为空');
        return;
    }
    if (!levelData.level) {
        alert('等级数值不能为空');
        return;
    }
    
    const editing = window.distributorLevelsData.editingLevel;
    const editId = editing && (editing.id != null && editing.id !== '');
    const url = editId ? `/api/distributor-levels/${editing.id}` : '/api/distributor-levels';
    const method = editId ? 'PUT' : 'POST';
    
    if (window.distributorLevelsData.debugLog) {
        console.log('[分销等级] 提交', { method, url, isSharerMode, levelData });
    }
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(levelData)
        });
        
        const result = await response.json();
        
        if (window.distributorLevelsData.debugLog) {
            console.log('[分销等级] 响应', { code: result.code, message: result.message, data: result.data });
        }
        
        if (result.code === 0) {
            alert(editId ? '等级更新成功' : '等级创建成功');
            closeLevelModal();
            loadLevels();
        } else {
            alert((editId ? '更新失败' : '创建失败') + ': ' + (result.message || ''));
        }
    } catch (error) {
        console.error('提交等级表单失败:', error);
        alert('提交失败: ' + error.message);
    }
}

// 删除等级
async function deleteLevel(id) {
    if (!confirm('确定要删除这个等级吗？')) {
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/distributor-levels/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();
        
        if (window.distributorLevelsData.debugLog) {
            console.log('[分销等级] 删除响应 id=%s code=%s message=%s', id, result.code, result.message);
        }
        if (result.code === 0) {
            alert('等级删除成功');
            loadLevels();
        } else {
            alert('删除失败: ' + (result.message || ''));
        }
    } catch (error) {
        console.error('删除等级失败:', error);
        alert('删除失败: ' + error.message);
    }
}

// 关闭等级模态框
function closeLevelModal() {
    document.getElementById('levelModal').style.display = 'none';
    window.distributorLevelsData.editingLevel = null;
}

// 特权管理
function renderPrivileges(privileges) {
    const container = document.getElementById('privilegesContainer');
    container.innerHTML = '';
    
    Object.keys(privileges).forEach(key => {
        addPrivilegeItem(key, privileges[key]);
    });
}

function addPrivilege() {
    addPrivilegeItem('', '');
}

function addPrivilegeItem(key = '', value = '') {
    const container = document.getElementById('privilegesContainer');
    const item = document.createElement('div');
    item.className = 'privilege-item';
    item.innerHTML = `
        <input type="text" class="privilege-key" placeholder="特权名称" value="${key}">
        <input type="text" class="privilege-value" placeholder="特权值" value="${value}">
        <button type="button" class="privilege-remove" onclick="removePrivilege(this)">删除</button>
    `;
    container.appendChild(item);
}

function removePrivilege(button) {
    button.parentElement.remove();
}

function getPrivileges() {
    const privileges = {};
    document.querySelectorAll('.privilege-item').forEach(item => {
        const key = item.querySelector('.privilege-key').value.trim();
        const value = item.querySelector('.privilege-value').value.trim();
        if (key && value) {
            privileges[key] = value;
        }
    });
    return privileges;
}

function clearPrivileges() {
    document.getElementById('privilegesContainer').innerHTML = '';
}

// 工具函数
function getStatusText(status) {
    const statusMap = {
        'active': '正常',
        'inactive': '停用'
    };
    return statusMap[status] || status;
}

function formatSalesRange(minSales, maxSales) {
    const min = safeNum(minSales);
    const max = maxSales != null && maxSales !== '' && !Number.isNaN(Number(maxSales)) ? Number(maxSales) : null;
    if (min === 0 && !max) return '无限制';
    if (!max) return `≥${min}`;
    return `${min} - ${max}`;
}

function formatFansRange(minFans, maxFans) {
    const min = safeNum(minFans);
    const max = maxFans != null && maxFans !== '' && !Number.isNaN(Number(maxFans)) ? Number(maxFans) : null;
    if (min === 0 && !max) return '无限制';
    if (!max) return `≥${min}人`;
    return `${min} - ${max}人`;
}

function formatProcurementCost(procurementCost) {
    const v = safeNum(procurementCost);
    if (v === 0) return '-';
    return (v * 100).toFixed(2) + '%';
}

function formatCommissionRates(directRate, indirectRate) {
    const d = safeNum(directRate);
    const i = safeNum(indirectRate);
    if (d === 0 && i === 0) return '-';
    return `直接${(d * 100).toFixed(2)}% / 间接${(i * 100).toFixed(2)}%`;
}

// 暴露函数到全局
window.initDistributorLevels = initDistributorLevels;
window.openAddLevelModal = openAddLevelModal;
window.editLevel = editLevel;
window.deleteLevel = deleteLevel;
window.closeLevelModal = closeLevelModal;
window.searchLevels = searchLevels;
window.goToPage = goToPage;
window.submitLevelForm = submitLevelForm;
window.switchMode = switchMode;
window.addPrivilege = addPrivilege;
window.removePrivilege = removePrivilege;

// 在文件末尾添加以下代码，按照页面加载器期望的格式
window.DistributorLevels = {
    init: initDistributorLevels,
    loadLevels: loadLevels,
    openAddLevelModal: openAddLevelModal,
    editLevel: editLevel,
    deleteLevel: deleteLevel,
    closeLevelModal: closeLevelModal,
    searchLevels: searchLevels,
    goToPage: goToPage,
    submitLevelForm: submitLevelForm,
    switchMode: switchMode,
    addPrivilege: addPrivilege,
    removePrivilege: removePrivilege
};