// 全局数据存储
window.memberLevelsData = {
    levels: [],
    currentPage: 1,
    totalPages: 1,
    pageSize: 10,
    searchKeyword: '',
    statusFilter: '',
    editingLevel: null
};

// 页面初始化
function initMemberLevels() {
    console.log('初始化会员等级管理页面');
    loadStats();
    loadLevels(); // 确保页面加载时自动加载列表
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
        const response = await fetch('/api/member-levels/stats/overview', {
            headers: getAuthHeaders()
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
            page: window.memberLevelsData.currentPage,
            limit: window.memberLevelsData.pageSize,
            search: window.memberLevelsData.searchKeyword,
            status: window.memberLevelsData.statusFilter
        });

        const response = await fetch(`/api/member-levels?${params}`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.code === 0) {
            window.memberLevelsData.levels = result.data.levels || [];
            window.memberLevelsData.totalPages = result.data.totalPages || 1;
            renderLevels();
            renderPagination();
        } else {
            alert('加载失败: ' + result.message);
        }
    } catch (error) {
        console.error('加载等级列表失败:', error);
        alert('加载失败: ' + error.message);
    }
}

// 渲染等级列表
function renderLevels() {
    const tbody = document.getElementById('levelsTableBody');
    
    if (!tbody) {
        console.error('找不到表格元素 levelsTableBody');
        return;
    }
    
    if (window.memberLevelsData.levels.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 40px; color: #999;">
                    暂无数据
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = window.memberLevelsData.levels.map(level => {
        const privileges = level.privileges || {};
        const privilegeCount = Object.keys(privileges).length;
        
        // 确保数值类型正确
        const discountRate = parseFloat(level.discountRate) || 1.0;
        const pointsRate = parseFloat(level.pointsRate) || 1.0;
        const minPoints = parseInt(level.minPoints) || 0;
        const maxPoints = level.maxPoints ? parseInt(level.maxPoints) : null;
        
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
                        <div style="font-weight: 500;">${minPoints.toLocaleString()}</div>
                        <div style="font-size: 12px; color: #666;">
                            ${maxPoints ? `- ${maxPoints.toLocaleString()}` : '无限制'}
                        </div>
                    </div>
                </td>
                <td>
                    <div style="display: flex; align-items: center; gap: 5px;">
                        <span style="font-weight: 500;">${(discountRate * 100).toFixed(1)}%</span>
                        <span style="font-size: 12px; color: #666;">折扣</span>
                    </div>
                </td>
                <td>
                    <div style="display: flex; align-items: center; gap: 5px;">
                        <span style="font-weight: 500;">${pointsRate.toFixed(1)}x</span>
                        <span style="font-size: 12px; color: #666;">倍率</span>
                    </div>
                </td>
                <td>
                    <div style="display: flex; align-items: center; gap: 5px;">
                        <span style="font-weight: 500;">${privilegeCount}</span>
                        <span style="font-size: 12px; color: #666;">特权</span>
                    </div>
                </td>
                <td>
                    <span class="status-badge status-${level.status}">
                        ${getStatusText(level.status)}
                    </span>
                </td>
                <td>${level.sortOrder}</td>
                <td>
                    <div style="display: flex; gap: 5px;">
                        <button class="btn btn-sm btn-warning" onclick="editLevel(${level.id})">编辑</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteLevel(${level.id})">删除</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// 渲染分页
function renderPagination() {
    const pagination = document.getElementById('pagination');
    pagination.innerHTML = '';

    const currentPage = window.memberLevelsData.currentPage;
    const totalPages = window.memberLevelsData.totalPages;

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
    if (page >= 1 && page <= window.memberLevelsData.totalPages) {
        window.memberLevelsData.currentPage = page;
        loadLevels();
    }
}

// 搜索等级
function searchLevels() {
    window.memberLevelsData.searchKeyword = document.getElementById('searchInput').value;
    window.memberLevelsData.statusFilter = document.getElementById('statusFilter').value;
    window.memberLevelsData.currentPage = 1;
    loadLevels();
}

// 打开添加等级模态框
function openAddLevelModal() {
    document.getElementById('levelModalTitle').textContent = '添加会员等级';
    document.getElementById('levelForm').reset();
    document.getElementById('levelModal').style.display = 'flex';
    window.memberLevelsData.editingLevel = null;
    clearPrivileges();
}

// 编辑等级
async function editLevel(id) {
    try {
        const response = await fetch(`/api/member-levels/${id}`, {
            headers: getAuthHeaders()
        });
        const result = await response.json();
        
        if (result.code === 0) {
            window.memberLevelsData.editingLevel = result.data;
            fillLevelForm(result.data);
            document.getElementById('levelModalTitle').textContent = '编辑会员等级';
            document.getElementById('levelModal').style.display = 'flex';
        }
    } catch (error) {
        console.error('获取等级信息失败:', error);
        alert('获取等级信息失败');
    }
}

// 填充等级表单
function fillLevelForm(level) {
    document.getElementById('levelName').value = level.name || '';
    document.getElementById('levelValue').value = level.level || '';
    document.getElementById('minPoints').value = level.minPoints || '';
    document.getElementById('maxPoints').value = level.maxPoints || '';
    document.getElementById('discountRate').value = level.discountRate || 1.0;
    document.getElementById('pointsRate').value = level.pointsRate || 1.0;
    document.getElementById('levelColor').value = level.color || '#1890ff';
    document.getElementById('levelIcon').value = level.icon || '';
    document.getElementById('levelDescription').value = level.description || '';
    document.getElementById('levelStatus').value = level.status || 'active';
    document.getElementById('sortOrder').value = level.sortOrder || 0;
    
    // 渲染特权
    renderPrivileges(level.privileges || {});
}

// 提交等级表单
async function submitLevelForm(event) {
    event.preventDefault();
    
    try {
        // 收集表单数据
        const formData = {
            name: document.getElementById('levelName').value.trim(),
            level: parseInt(document.getElementById('levelValue').value),
            minPoints: parseInt(document.getElementById('minPoints').value),
            maxPoints: document.getElementById('maxPoints').value ? parseInt(document.getElementById('maxPoints').value) : null,
            discountRate: parseFloat(document.getElementById('discountRate').value),
            pointsRate: parseFloat(document.getElementById('pointsRate').value),
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
        if (!formData.name || !formData.level || formData.minPoints === undefined) {
            alert('请填写必填字段');
            return;
        }

        // 验证数值范围
        if (formData.level < 1) {
            alert('等级数值必须大于0');
            return;
        }

        if (formData.minPoints < 0) {
            alert('最低积分不能小于0');
            return;
        }

        if (formData.maxPoints && formData.maxPoints < formData.minPoints) {
            alert('最高积分不能小于最低积分');
            return;
        }

        if (formData.discountRate < 0 || formData.discountRate > 1) {
            alert('折扣率必须在0-1之间');
            return;
        }

        if (formData.pointsRate < 0) {
            alert('积分倍率不能小于0');
            return;
        }

        const url = window.memberLevelsData.editingLevel 
            ? `/api/member-levels/${window.memberLevelsData.editingLevel.id}`
            : '/api/member-levels';
        
        const method = window.memberLevelsData.editingLevel ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: getAuthHeaders(),
            body: JSON.stringify(formData)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('服务器错误响应:', errorText);
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.code === 0) {
            alert(window.memberLevelsData.editingLevel ? '更新成功' : '创建成功');
            closeLevelModal();
            loadLevels();
            loadStats();
        } else {
            alert((window.memberLevelsData.editingLevel ? '更新失败' : '创建失败') + ': ' + result.message);
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
        const response = await fetch(`/api/member-levels/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
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

// 关闭等级模态框
function closeLevelModal() {
    document.getElementById('levelModal').style.display = 'none';
    window.memberLevelsData.editingLevel = null;
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
        <input type="text" class="privilege-input" placeholder="特权名称" value="${key}">
        <input type="text" class="privilege-value" placeholder="特权值" value="${value}">
        <button type="button" class="privilege-remove" onclick="removePrivilege(this)">删除</button>
    `;
    container.appendChild(item);
}

function removePrivilege(button) {
    button.parentElement.remove();
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

// 暴露函数到全局 - 修复：按照页面加载器期望的格式
window.MemberLevels = {
    init: initMemberLevels,
    loadLevels: loadLevels,
    openAddLevelModal: openAddLevelModal,
    editLevel: editLevel,
    deleteLevel: deleteLevel,
    closeLevelModal: closeLevelModal,
    searchLevels: searchLevels,
    goToPage: goToPage,
    submitLevelForm: submitLevelForm,
    addPrivilege: addPrivilege,
    removePrivilege: removePrivilege
};

// 同时暴露到全局作用域（为了onclick事件）
window.initMemberLevels = initMemberLevels;
window.openAddLevelModal = openAddLevelModal;
window.editLevel = editLevel;
window.deleteLevel = deleteLevel;
window.closeLevelModal = closeLevelModal;
window.searchLevels = searchLevels;
window.goToPage = goToPage;
window.submitLevelForm = submitLevelForm;
window.addPrivilege = addPrivilege;
window.removePrivilege = removePrivilege;