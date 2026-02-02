// 全局数据存储
window.teamExpansionLevelsData = {
    levels: [],
    currentPage: 1,
    totalPages: 1,
    pageSize: 10,
    searchKeyword: '',
    statusFilter: '',
    editingLevel: null
};

// 页面初始化
function initTeamExpansionLevels() {
    console.log('初始化团队拓展激励管理页面');
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

    // 状态筛选变化事件
    document.getElementById('statusFilter').addEventListener('change', function() {
        searchLevels();
    });
}

// 获取认证头
function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
}

// 加载统计信息
async function loadStats() {
    try {
        const response = await fetch('/api/team-expansion-levels/stats/overview', {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.code === 0) {
            renderStats(result.data);
        } else {
            console.error('加载统计信息失败:', result.message);
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
            <div class="stat-number">${data.totalLevels}</div>
            <div class="stat-label">总等级数</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${data.activeLevels}</div>
            <div class="stat-label">启用等级</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${data.levelStats.length}</div>
            <div class="stat-label">等级分布</div>
        </div>
    `;
}

// 加载等级列表
async function loadLevels() {
    try {
        const params = new URLSearchParams({
            page: window.teamExpansionLevelsData.currentPage,
            limit: window.teamExpansionLevelsData.pageSize,
            search: window.teamExpansionLevelsData.searchKeyword,
            status: window.teamExpansionLevelsData.statusFilter
        });

        const response = await fetch(`/api/team-expansion-levels?${params}`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.code === 0) {
            window.teamExpansionLevelsData.levels = result.data.levels || [];
            window.teamExpansionLevelsData.totalPages = result.data.totalPages || 1;
            renderLevels();
            renderPagination();
        } else {
            console.error('加载等级列表失败:', result.message);
            alert('加载等级列表失败: ' + result.message);
        }
    } catch (error) {
        console.error('加载等级列表失败:', error);
        alert('加载等级列表失败: ' + error.message);
    }
}

// 渲染等级列表
function renderLevels() {
    const tbody = document.getElementById('levelsTableBody');
    
    if (window.teamExpansionLevelsData.levels.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px; color: #999;">
                    暂无数据
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = window.teamExpansionLevelsData.levels.map(level => {
        const privileges = level.privileges || {};
        const privilegeCount = Object.keys(privileges).length;
        
        return `
            <tr>
                <td>
                    <div class="level-badge" style="background-color: ${level.color}20; color: ${level.color};">
                        ${level.icon ? `<span class="level-icon" style="background-color: ${level.color};">${level.icon}</span>` : ''}
                        <span>${level.name}</span>
                        <span style="opacity: 0.7;">(Lv.${level.level})</span>
                    </div>
                </td>
                <td>
                    <div>
                        <div style="font-weight: 500;">${level.minTeamSize.toLocaleString()} 人</div>
                        ${level.maxTeamSize ? `<div class="team-size-range">- ${level.maxTeamSize.toLocaleString()} 人</div>` : ''}
                    </div>
                </td>
                <td>
                    <span class="rate-display">
                        ${(level.incentiveRate * 100).toFixed(2)}%
                    </span>
                </td>
                <td>
                    <span style="color: #666;">${privilegeCount} 项</span>
                </td>
                <td>
                    <span class="status-badge status-${level.status}">
                        ${level.status === 'active' ? '启用' : '禁用'}
                    </span>
                </td>
                <td>
                    <span style="color: #666;">${level.sortOrder}</span>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-warning" onclick="editLevel(${level.id})" title="编辑">
                            ✏️
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteLevel(${level.id})" title="删除" ${level.level === 1 ? 'disabled' : ''}>
                            🗑️
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// 渲染分页
function renderPagination() {
    const pagination = document.getElementById('pagination');
    const { currentPage, totalPages } = window.teamExpansionLevelsData;
    
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    const pageButtons = [];
    for (let i = startPage; i <= endPage; i++) {
        pageButtons.push(`
            <button class="page-btn ${i === currentPage ? 'active' : ''}" 
                    onclick="goToPage(${i})" ${i === currentPage ? 'disabled' : ''}>
                ${i}
            </button>
        `);
    }
    
    pagination.innerHTML = `
        <div class="pagination-info">
            共 ${window.teamExpansionLevelsData.levels.length} 条记录，第 ${currentPage} / ${totalPages} 页
        </div>
        <div class="pagination-controls">
            <button class="page-btn" onclick="goToPage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>
                上一页
            </button>
            ${pageButtons.join('')}
            <button class="page-btn" onclick="goToPage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>
                下一页
            </button>
        </div>
    `;
}

// 搜索等级
function searchLevels() {
    window.teamExpansionLevelsData.searchKeyword = document.getElementById('searchInput').value;
    window.teamExpansionLevelsData.statusFilter = document.getElementById('statusFilter').value;
    window.teamExpansionLevelsData.currentPage = 1;
    loadLevels();
}

// 跳转页面
function goToPage(page) {
    if (page >= 1 && page <= window.teamExpansionLevelsData.totalPages) {
        window.teamExpansionLevelsData.currentPage = page;
        loadLevels();
    }
}

// 打开新增等级模态框
function openAddLevelModal() {
    window.teamExpansionLevelsData.editingLevel = null;
    document.getElementById('modalTitle').textContent = '新增团队拓展激励等级';
    document.getElementById('levelForm').reset();
    document.getElementById('levelColor').value = '#faad14';
    document.getElementById('levelStatus').value = 'active';
    document.getElementById('sortOrder').value = '0';
    document.getElementById('incentiveRate').value = '0.01';
    
    // 清空特权配置
    document.getElementById('privilegesContainer').innerHTML = '';
    
    document.getElementById('levelModal').classList.add('show');
}

// 编辑等级
async function editLevel(id) {
    try {
        const response = await fetch(`/api/team-expansion-levels/${id}`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.code === 0) {
            window.teamExpansionLevelsData.editingLevel = result.data.level;
            fillLevelForm(result.data.level);
            document.getElementById('modalTitle').textContent = '编辑团队拓展激励等级';
            document.getElementById('levelModal').classList.add('show');
        } else {
            alert('获取等级信息失败: ' + result.message);
        }
    } catch (error) {
        console.error('获取等级信息失败:', error);
        alert('获取等级信息失败: ' + error.message);
    }
}

// 填充等级表单
function fillLevelForm(level) {
    document.getElementById('levelName').value = level.name || '';
    document.getElementById('levelValue').value = level.level || '';
    document.getElementById('minTeamSize').value = level.minTeamSize || 0;
    document.getElementById('maxTeamSize').value = level.maxTeamSize || '';
    document.getElementById('incentiveRate').value = level.incentiveRate || 0.01;
    // 新增：激励计算基数
    document.getElementById('minIncentiveBase').value = level.minIncentiveBase || '';
    document.getElementById('maxIncentiveBase').value = level.maxIncentiveBase || '';
    document.getElementById('levelColor').value = level.color || '#faad14';
    document.getElementById('levelIcon').value = level.icon || '';
    document.getElementById('levelDescription').value = level.description || '';
    document.getElementById('levelStatus').value = level.status || 'active';
    document.getElementById('sortOrder').value = level.sortOrder || 0;
    
    // 填充特权配置
    renderPrivileges(level.privileges || {});
}

// 渲染特权配置
function renderPrivileges(privileges) {
    const container = document.getElementById('privilegesContainer');
    container.innerHTML = '';
    
    Object.entries(privileges).forEach(([key, value], index) => {
        addPrivilegeItem(key, value, index);
    });
}

// 添加特权项
function addPrivilegeItem(key = '', value = '', index = null) {
    const container = document.getElementById('privilegesContainer');
    const privilegeItem = document.createElement('div');
    privilegeItem.className = 'privilege-item';
    privilegeItem.innerHTML = `
        <input type="text" class="form-input privilege-input" placeholder="特权名称" value="${key}" onchange="updatePrivilegeKey(${index}, this.value)">
        <input type="text" class="form-input privilege-value" placeholder="特权值" value="${value}" onchange="updatePrivilegeValue(${index}, this.value)">
        <button type="button" class="privilege-remove" onclick="removePrivilege(${index})">删除</button>
    `;
    container.appendChild(privilegeItem);
}

// 添加特权
function addPrivilege() {
    const container = document.getElementById('privilegesContainer');
    const index = container.children.length;
    addPrivilegeItem('', '', index);
}

// 更新特权键
function updatePrivilegeKey(index, value) {
    // 这里可以添加验证逻辑
}

// 更新特权值
function updatePrivilegeValue(index, value) {
    // 这里可以添加验证逻辑
}

// 删除特权
function removePrivilege(index) {
    const container = document.getElementById('privilegesContainer');
    if (container.children[index]) {
        container.removeChild(container.children[index]);
    }
}

// 关闭等级模态框
function closeLevelModal() {
    document.getElementById('levelModal').classList.remove('show');
    window.teamExpansionLevelsData.editingLevel = null;
}

// 提交等级表单
async function submitLevelForm() {
    try {
        // 收集表单数据
        const formData = {
            name: document.getElementById('levelName').value.trim(),
            level: parseInt(document.getElementById('levelValue').value),
            minTeamSize: parseInt(document.getElementById('minTeamSize').value),
            maxTeamSize: document.getElementById('maxTeamSize').value ? parseInt(document.getElementById('maxTeamSize').value) : null,
            incentiveRate: parseFloat(document.getElementById('incentiveRate').value),
            // 新增：激励计算基数
            minIncentiveBase: document.getElementById('minIncentiveBase').value ? parseFloat(document.getElementById('minIncentiveBase').value) : null,
            maxIncentiveBase: document.getElementById('maxIncentiveBase').value ? parseFloat(document.getElementById('maxIncentiveBase').value) : null,
            color: document.getElementById('levelColor').value,
            icon: document.getElementById('levelIcon').value.trim(),
            description: document.getElementById('levelDescription').value.trim(),
            status: document.getElementById('levelStatus').value,
            sortOrder: parseInt(document.getElementById('sortOrder').value)
        };

        // 收集特权配置
        const privileges = {};
        const privilegeItems = document.querySelectorAll('.privilege-item');
        privilegeItems.forEach(item => {
            const key = item.querySelector('.privilege-input').value.trim();
            const value = item.querySelector('.privilege-value').value.trim();
            if (key && value) {
                privileges[key] = value;
            }
        });
        formData.privileges = privileges;

        // 验证必填字段
        if (!formData.name || !formData.level || formData.minTeamSize === undefined || !formData.incentiveRate) {
            alert('请填写必填字段');
            return;
        }

        const url = window.teamExpansionLevelsData.editingLevel 
            ? `/api/team-expansion-levels/${window.teamExpansionLevelsData.editingLevel.id}`
            : '/api/team-expansion-levels';
        
        const method = window.teamExpansionLevelsData.editingLevel ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: getAuthHeaders(),
            body: JSON.stringify(formData)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        if (result.code === 0) {
            alert(window.teamExpansionLevelsData.editingLevel ? '更新成功' : '创建成功');
            closeLevelModal();
            loadLevels();
            loadStats();
        } else {
            alert((window.teamExpansionLevelsData.editingLevel ? '更新失败' : '创建失败') + ': ' + result.message);
        }
    } catch (error) {
        console.error('提交等级表单失败:', error);
        alert('操作失败: ' + error.message);
    }
}

// 删除等级
async function deleteLevel(id) {
    if (!confirm('确定要删除这个等级吗？删除后不可恢复！')) {
        return;
    }

    try {
        const response = await fetch(`/api/team-expansion-levels/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        if (result.code === 0) {
            alert('删除成功');
            loadLevels();
            loadStats();
        } else {
            alert('删除失败: ' + result.message);
        }
    } catch (error) {
        console.error('删除等级失败:', error);
        alert('删除失败: ' + error.message);
    }
}

// 将函数暴露到全局作用域
window.initTeamExpansionLevels = initTeamExpansionLevels;
window.searchLevels = searchLevels;
window.goToPage = goToPage;
window.openAddLevelModal = openAddLevelModal;
window.editLevel = editLevel;
window.closeLevelModal = closeLevelModal;
window.submitLevelForm = submitLevelForm;
window.deleteLevel = deleteLevel;
window.addPrivilege = addPrivilege;
window.updatePrivilegeKey = updatePrivilegeKey;
window.updatePrivilegeValue = updatePrivilegeValue;
window.removePrivilege = removePrivilege;

// 页面加载完成后自动初始化
document.addEventListener('DOMContentLoaded', function() {
    initTeamExpansionLevels();
});