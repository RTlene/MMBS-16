// 会员管理数据
window.memberManagementData = {
    members: [],
    currentPage: 1,
    pageSize: 10,
    totalPages: 0,
    searchKeyword: '',
    statusFilter: '',
    levelFilter: '',
    currentMemberDetail: null,
    editingMember: null,
    selectedMembers: new Set()
};

// 直接调用初始化（移除DOMContentLoaded事件监听器）
console.log('Member Management JS loaded');
initMemberManagement();

// 创建单独的事件绑定函数
function bindEventListeners() {
    console.log('Binding event listeners...');
    
    // 绑定事件监听器
    const addMemberBtn = document.getElementById('addMemberBtn');
    if (addMemberBtn) {
        addMemberBtn.addEventListener('click', showAddMemberModal);
        console.log('Add member button bound');
    }
    
    const batchDeleteBtn = document.getElementById('batchDeleteBtn');
    if (batchDeleteBtn) {
        batchDeleteBtn.addEventListener('click', batchDeleteMembers);
        console.log('Batch delete button bound');
    }

    // 报表导出/导入
    const exportMembersBtn = document.getElementById('exportMembersBtn');
    if (exportMembersBtn) {
        exportMembersBtn.addEventListener('click', exportMembers);
        console.log('Export members button bound');
    }

    const importMembersBtn = document.getElementById('importMembersBtn');
    if (importMembersBtn) {
        importMembersBtn.addEventListener('click', triggerImportMembers);
        console.log('Import members button bound');
    }

    const downloadMembersTemplateBtn = document.getElementById('downloadMembersTemplateBtn');
    if (downloadMembersTemplateBtn) {
        downloadMembersTemplateBtn.addEventListener('click', downloadMembersTemplate);
        console.log('Download members template button bound');
    }

    const membersImportFile = document.getElementById('membersImportFile');
    if (membersImportFile) {
        membersImportFile.addEventListener('change', handleMembersImportFileChange);
        console.log('Members import file input bound');
    }
    
    const searchBtn = document.getElementById('searchBtn');
    if (searchBtn) {
        searchBtn.addEventListener('click', searchMembers);
        console.log('Search button bound');
    }
    
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetFilters);
        console.log('Reset button bound');
    }
    
    const selectAll = document.getElementById('selectAll');
    if (selectAll) {
        selectAll.addEventListener('change', toggleSelectAll);
        console.log('Select all checkbox bound');
    }
    
    // 搜索框回车事件
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchMembers();
            }
        });
        console.log('Search input bound');
    }
    
    // 筛选器变化事件
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) {
        statusFilter.addEventListener('change', loadMembers);
        console.log('Status filter bound');
    }
    
    const levelFilter = document.getElementById('levelFilter');
    if (levelFilter) {
        levelFilter.addEventListener('change', loadMembers);
        console.log('Level filter bound');
    }
    
    // 会员表单提交事件
    const memberForm = document.getElementById('memberForm');
    if (memberForm) {
        memberForm.addEventListener('submit', submitMemberForm);
        console.log('Member form submit event bound');
    }
    
    // 测试订单表单事件
    const testOrderForm = document.getElementById('testOrderForm');
    if (testOrderForm) {
        testOrderForm.addEventListener('submit', handleTestOrderSubmit);
        console.log('Test order form bound');
    }
    
    // 调整积分表单提交事件
    const adjustPointsForm = document.getElementById('adjustPointsForm');
    if (adjustPointsForm) {
        adjustPointsForm.addEventListener('submit', handleAdjustPoints);
        console.log('Adjust points form submit event bound');
    }
    
    // 调整佣金表单提交事件
    const adjustCommissionForm = document.getElementById('adjustCommissionForm');
    if (adjustCommissionForm) {
        adjustCommissionForm.addEventListener('submit', handleAdjustCommission);
        console.log('Adjust commission form submit event bound');
    }
    
    // 商品选择变化时自动填充价格
    const productSelect = document.getElementById('testProductId');
    if (productSelect) {
        productSelect.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            if (selectedOption.dataset.price) {
                document.getElementById('testUnitPrice').value = selectedOption.dataset.price;
                calculateTotalAmount();
            }
        });
        console.log('Product select bound');
    }
    
    // 数量或单价变化时自动计算总金额
    const quantityInput = document.getElementById('testQuantity');
    const unitPriceInput = document.getElementById('testUnitPrice');
    if (quantityInput && unitPriceInput) {
        quantityInput.addEventListener('input', calculateTotalAmount);
        unitPriceInput.addEventListener('input', calculateTotalAmount);
        console.log('Quantity and unit price inputs bound');
    }
    
    console.log('Event listeners binding completed');
}

function buildMembersExportQuery() {
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const levelFilter = document.getElementById('levelFilter');

    const params = new URLSearchParams();
    if (searchInput?.value) params.set('search', searchInput.value);
    if (statusFilter?.value) params.set('status', statusFilter.value);
    // 后端使用 memberLevelId 参数
    if (levelFilter?.value) params.set('memberLevelId', levelFilter.value);

    return params.toString();
}

function exportMembers() {
    const token = localStorage.getItem('token');
    const qs = buildMembersExportQuery();
    const url = `/api/members/export${qs ? `?${qs}` : ''}`;

    // 通过带 Authorization 的 fetch 下载 blob（避免 window.open 丢 token）
    fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
    }).then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const a = document.createElement('a');
        const href = URL.createObjectURL(blob);
        a.href = href;
        a.download = `members_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(href);
        alert('会员报表导出成功');
    }).catch((err) => {
        console.error('导出会员失败:', err);
        alert('导出会员失败: ' + err.message);
    });
}

function downloadMembersTemplate() {
    const token = localStorage.getItem('token');
    fetch('/api/members/import-template', {
        headers: { 'Authorization': `Bearer ${token}` }
    }).then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const a = document.createElement('a');
        const href = URL.createObjectURL(blob);
        a.href = href;
        a.download = 'members_import_template.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(href);
    }).catch((err) => {
        console.error('下载会员模板失败:', err);
        alert('下载模板失败: ' + err.message);
    });
}

function triggerImportMembers() {
    const input = document.getElementById('membersImportFile');
    if (input) input.click();
}

function handleMembersImportFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm(`确认导入会员报表？\n文件: ${file.name}`)) {
        e.target.value = '';
        return;
    }
    importMembers(file).finally(() => {
        e.target.value = '';
    });
}

async function importMembers(file) {
    const token = localStorage.getItem('token');
    const form = new FormData();
    form.append('file', file);
    try {
        const res = await fetch('/api/members/import', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: form
        });
        const result = await res.json();
        if (!res.ok || result.code !== 0) throw new Error(result.message || `HTTP ${res.status}`);
        alert(`导入完成：\n总行数: ${result.data.total}\n新增: ${result.data.created}\n更新: ${result.data.updated}\n跳过: ${result.data.skipped}\n错误: ${result.data.errors.length}`);
        await loadMembers();
    } catch (err) {
        console.error('导入会员失败:', err);
        alert('导入会员失败: ' + err.message);
    }
}

// 初始化会员管理
async function initMemberManagement() {
    console.log('Initializing member management...');
    await loadStats();
    await loadMembers();
    
    // 添加等级数据加载
    await loadMemberLevels();
    await loadDistributorLevels();
    await loadTeamExpansionLevels();
    
    // 添加推荐人数据加载
    await loadReferrers();
    
    // 在初始化完成后立即绑定事件监听器
    bindEventListeners();
    
    console.log('Member management initialized');
}

// 加载统计信息
async function loadStats() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/members/stats/overview', {
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
    if (!statsGrid) {
        console.error('Stats grid element not found');
        return;
    }
    
    statsGrid.innerHTML = `
        <div class="stat-card">
            <div class="stat-value">${data.totalMembers || 0}</div>
            <div class="stat-label">总会员数</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${data.activeMembers || 0}</div>
            <div class="stat-label">活跃会员</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${data.newMembersToday || 0}</div>
            <div class="stat-label">今日新增</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${data.totalPoints || 0}</div>
            <div class="stat-label">总积分</div>
        </div>
    `;
}

// 加载会员列表
async function loadMembers() {
    try {
        const token = localStorage.getItem('token');
        const params = new URLSearchParams({
            page: window.memberManagementData.currentPage,
            limit: window.memberManagementData.pageSize,
            search: window.memberManagementData.searchKeyword,
            status: window.memberManagementData.statusFilter,
            level: window.memberManagementData.levelFilter
        });

        const response = await fetch(`/api/members?${params}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            window.memberManagementData.members = result.data.members;
            window.memberManagementData.totalPages = result.data.pagination.pages;
            renderMembers();
            renderPagination();
        }
    } catch (error) {
        console.error('加载会员列表失败:', error);
    }
}

// 加载会员等级数据
async function loadMemberLevels() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/member-levels?status=active&limit=100', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            const select = document.getElementById('memberLevelId');
            if (select) {
                select.innerHTML = '<option value="">请选择会员等级</option>';
                result.data.levels.forEach(level => {
                    const option = document.createElement('option');
                    option.value = level.id;
                    option.textContent = level.name;
                    select.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('加载会员等级失败:', error);
    }
}

// 加载分销等级数据
async function loadDistributorLevels() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/distributor-levels?status=active&limit=100', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            const select = document.getElementById('distributorLevelId');
            if (select) {
                select.innerHTML = '<option value="">请选择分销等级</option>';
                result.data.levels.forEach(level => {
                    const option = document.createElement('option');
                    option.value = level.id;
                    option.textContent = level.name;
                    select.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('加载分销等级失败:', error);
    }
}

// 加载团队拓展等级数据
async function loadTeamExpansionLevels() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/team-expansion-levels?status=active&limit=100', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            const select = document.getElementById('teamExpansionLevelId');
            if (select) {
                select.innerHTML = '<option value="">请选择团队拓展激励等级</option>';
                result.data.levels.forEach(level => {
                    const option = document.createElement('option');
                    option.value = level.id;
                    option.textContent = level.name;
                    select.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('加载团队拓展等级失败:', error);
    }
}

// 加载推荐人数据
async function loadReferrers() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/members?limit=1000&status=active', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            const select = document.getElementById('referrerId');
            if (select) {
                select.innerHTML = '<option value="">请选择推荐人</option>';
                result.data.members.forEach(member => {
                    const option = document.createElement('option');
                    option.value = member.id;
                    option.textContent = `${member.nickname} (${member.memberCode || member.id})`;
                    select.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('加载推荐人列表失败:', error);
    }
}

// 在 renderMembers 函数中添加调试信息
function renderMembers() {
    const tbody = document.getElementById('memberTableBody');
    if (!tbody) {
        console.error('Member table body not found');
        return;
    }
    
    tbody.innerHTML = '';

    window.memberManagementData.members.forEach(member => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="checkbox" class="member-checkbox" value="${member.id}"></td>
            <td>${member.nickname || '-'}</td>
            <td>${member.phone || '-'}</td>
            <td>${member.memberLevelName || '普通会员'}</td>
            <td>
                <span class="status-badge status-${member.status}">
                    ${getStatusText(member.status)}
                </span>
            </td>
            <td>${(Number(member.totalPoints) || 0).toLocaleString()}</td>
            <td>¥${(parseFloat(member.totalCommission) || 0).toFixed(2)}</td>
            <td>${formatDateTime(member.createdAt)}</td>
            <td>
                <button class="btn btn-sm btn-info" onclick="viewMemberDetail(${member.id})">详情</button>
                <button class="btn btn-sm btn-warning" onclick="editMember(${member.id})">编辑</button>
                <button class="btn btn-sm btn-danger" onclick="deleteMember(${member.id})">删除</button>
            </td>
        `;
        tbody.appendChild(row);
    });
    
    // 添加调试信息
    console.log('Member table rendered, checking button functions...');
    console.log('viewMemberDetail function:', typeof window.viewMemberDetail);
    console.log('editMember function:', typeof window.editMember);
    console.log('deleteMember function:', typeof window.deleteMember);
}

// 渲染分页
function renderPagination() {
    const pagination = document.getElementById('pagination');
    if (!pagination) {
        console.error('Pagination element not found');
        return;
    }
    
    pagination.innerHTML = '';

    const currentPage = window.memberManagementData.currentPage;
    const totalPages = window.memberManagementData.totalPages;

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

// 跳转到指定页面
function goToPage(page) {
    window.memberManagementData.currentPage = page;
    loadMembers();
}

// 搜索会员
function searchMembers() {
    window.memberManagementData.searchKeyword = document.getElementById('searchInput').value;
    window.memberManagementData.currentPage = 1;
    loadMembers();
}

// 重置筛选器
function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('statusFilter').value = '';
    document.getElementById('levelFilter').value = '';
    
    window.memberManagementData.searchKeyword = '';
    window.memberManagementData.statusFilter = '';
    window.memberManagementData.levelFilter = '';
    window.memberManagementData.currentPage = 1;
    
    loadMembers();
}

// 全选/取消全选
function toggleSelectAll() {
    const selectAll = document.getElementById('selectAll');
    const checkboxes = document.querySelectorAll('.member-checkbox');
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAll.checked;
        if (selectAll.checked) {
            window.memberManagementData.selectedMembers.add(parseInt(checkbox.value));
        } else {
            window.memberManagementData.selectedMembers.delete(parseInt(checkbox.value));
        }
    });
}

// 修改 showAddMemberModal 函数
function showAddMemberModal() {
    console.log('Opening add member modal');
    
    // 清除编辑状态
    window.memberManagementData.editingMember = null;
    
    // 设置模态框标题
    document.getElementById('memberModalTitle').textContent = '添加会员';
    
    // 清空表单
    document.getElementById('memberForm').reset();
    
    // 重新加载等级数据和推荐人数据
    loadMemberLevels();
    loadDistributorLevels();
    loadTeamExpansionLevels();
    loadReferrers();
    
    // 显示模态框
    document.getElementById('memberModal').style.display = 'flex';
}

// 修改 editMember 函数
function editMember(memberId) {
    console.log('Editing member:', memberId);
    
    // 设置编辑状态
    window.memberManagementData.editingMember = { id: memberId };
    
    // 设置模态框标题
    document.getElementById('memberModalTitle').textContent = '编辑会员';
    
    // 重新加载等级数据和推荐人数据
    loadMemberLevels();
    loadDistributorLevels();
    loadTeamExpansionLevels();
    loadReferrers();
    
    // 获取会员信息
    fetch(`/api/members/${memberId}`, {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
    })
    .then(response => response.json())
    .then(result => {
        if (result.code === 0) {
            // 填充表单
            fillMemberForm(result.data);
            // 显示模态框
            document.getElementById('memberModal').style.display = 'flex';
        } else {
            console.error('获取会员信息失败:', result.message);
            alert('获取会员信息失败: ' + result.message);
        }
    })
    .catch(error => {
        console.error('获取会员信息失败:', error);
        alert('获取会员信息失败: ' + error.message);
    });
}

// 填充会员表单
function fillMemberForm(member) {
    console.log('Filling member form with:', member);
    
    // 基本信息
    document.getElementById('nickname').value = member.nickname || '';
    document.getElementById('realName').value = member.realName || '';
    document.getElementById('phone').value = member.phone || '';
    document.getElementById('openid').value = member.openid || '';
    document.getElementById('unionid').value = member.unionid || '';
    document.getElementById('gender').value = member.gender || '';
    document.getElementById('birthday').value = member.birthday ? member.birthday.split('T')[0] : '';
    document.getElementById('province').value = member.province || '';
    document.getElementById('city').value = member.city || '';
    document.getElementById('district').value = member.district || '';
    document.getElementById('address').value = member.address || '';
    document.getElementById('status').value = member.status || 'active';
    document.getElementById('avatar').value = member.avatar || '';
    document.getElementById('remark').value = member.remark || '';
    
    // 等级信息
    document.getElementById('memberLevelId').value = member.memberLevelId || '';
    document.getElementById('distributorLevelId').value = member.distributorLevelId || '';
    document.getElementById('teamExpansionLevelId').value = member.teamExpansionLevelId || '';
    
    // 推荐人信息
    document.getElementById('referrerId').value = member.referrerId || '';
    
    // 修复：编辑时保持会员编号，不显示在表单中让用户修改
    const memberCodeField = document.getElementById('memberCode');
    if (memberCodeField) {
        memberCodeField.value = member.memberCode || '';
        memberCodeField.readOnly = true;
        memberCodeField.style.backgroundColor = '#f5f5f5';
    }
    
    console.log('Member form filled successfully');
}

// 查看会员详情
async function viewMemberDetail(memberId) {
    console.log('Viewing member detail:', memberId);
    
    try {
        const response = await fetch(`/api/members/${memberId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            window.memberManagementData.currentMemberDetail = result.data;
            
            // 先渲染内容，再显示模态框
            renderMemberDetail(result.data);
            
            // 显示模态框
            document.getElementById('memberDetailModal').style.display = 'flex';
        } else {
            console.error('获取会员详情失败:', result.message);
            alert('获取会员详情失败: ' + result.message);
        }
    } catch (error) {
        console.error('获取会员详情失败:', error);
        alert('获取会员详情失败');
    }
}

// 渲染会员详情
function renderMemberDetail(member) {
    try {
        // 基本信息
        setElementText('detailNickname', member.nickname || '-');
        setElementText('detailRealName', member.realName || '-');
        setElementText('detailPhone', member.phone || '-');
        setElementText('detailMemberCode', member.memberCode || '-');
        setElementText('detailOpenid', member.openid || '-');
        setElementText('detailUnionid', member.unionid || '-');
        setElementText('detailGender', getGenderText(member.gender));
        setElementText('detailBirthday', member.birthday || '-');
        setElementText('detailAddress', member.address || '-');
        setElementText('detailStatus', getStatusText(member.status));
        setElementText('detailRemark', member.remark || '-');
        
        // 等级信息
        setElementText('detailMemberLevel', member.memberLevelName || '普通会员');
        setElementText('detailDistributorLevel', member.distributorLevelName || '无');
        setElementText('detailTeamExpansionLevel', member.teamExpansionLevelName || '无');
        
        // 积分信息
        setElementText('detailTotalPoints', member.totalPoints || 0);
        setElementText('detailAvailablePoints', member.availablePoints || 0);
        setElementText('detailFrozenPoints', member.frozenPoints || 0);
        
        // 佣金信息
        setElementText('detailTotalCommission', member.totalCommission || 0);
        setElementText('detailAvailableCommission', member.availableCommission || 0);
        setElementText('detailFrozenCommission', member.frozenCommission || 0);
        
        // 销售信息
        setElementText('detailTotalSales', member.totalSales || 0);
        setElementText('detailDirectSales', member.directSales || 0);
        setElementText('detailIndirectSales', member.indirectSales || 0);
        
        // 粉丝信息
        setElementText('detailDirectFans', member.directFans || 0);
        setElementText('detailTotalFans', member.totalFans || 0);
        
        // 推荐人信息
        setElementText('detailReferrer', member.referrerName || '无');
        
        // 时间信息
        setElementText('detailCreatedAt', formatDateTime(member.createdAt));
        setElementText('detailUpdatedAt', formatDateTime(member.updatedAt));
        
        console.log('Member detail rendered successfully');
    } catch (error) {
        console.error('渲染会员详情失败:', error);
    }
}

// 辅助函数：安全设置元素文本
function setElementText(elementId, text) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = text;
    } else {
        console.warn(`Element with id '${elementId}' not found`);
    }
}

// 标签页切换
function switchTab(tabName) {
    console.log('Switching to tab:', tabName);
    
    // 隐藏所有标签页内容
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // 移除所有标签按钮的active类
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // 显示选中的标签页
    const targetTab = document.getElementById(tabName + 'Tab');
    if (targetTab) {
        targetTab.classList.add('active');
    }
    
    // 激活对应的标签按钮
    event.target.classList.add('active');
    
    // 根据标签页加载相应数据
    switch(tabName) {
        case 'distributor':
            loadDistributorInfo();
            break;
        case 'network':
            loadMemberNetwork();
            break;
        case 'consumption':
            loadConsumptionRecords();
            break;
        case 'commission':
            loadCommissionRecords();
            break;
        case 'test':
            loadTestProducts();
            break;
        default:
            console.log('No specific loading for tab:', tabName);
    }
}

// 加载分销商信息
async function loadDistributorInfo() {
    try {
        const member = window.memberManagementData.currentMemberDetail;
        if (!member.distributorLevelId) {
            document.getElementById('distributorInfoTableBody').innerHTML = 
                '<tr><td colspan="8" class="text-center">该会员不是分销商</td></tr>';
            return;
        }

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/distributor-levels/${member.distributorLevelId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            const level = result.data.level;
            document.getElementById('distributorInfoTableBody').innerHTML = `
                <tr>
                    <td>${level.name}</td>
                    <td>${level.level}</td>
                    <td>${formatSalesRange(level.minSales, level.maxSales)}</td>
                    <td>${formatFansRange(level.minFans, level.maxFans)}</td>
                    <td>${(level.procurementCost * 100).toFixed(2)}%</td>
                    <td>${(level.sharerDirectCommissionRate * 100).toFixed(2)}%</td>
                    <td>${(level.sharerIndirectCommissionRate * 100).toFixed(2)}%</td>
                    <td>${formatPrivileges(level.privileges)}</td>
                </tr>
            `;
        }
    } catch (error) {
        console.error('加载分销商信息失败:', error);
    }
}

// 加载会员关系网
async function loadMemberNetwork() {
    try {
        const member = window.memberManagementData.currentMemberDetail;
        const token = localStorage.getItem('token');
        
        // 获取下级会员
        const response = await fetch(`/api/members/network/${member.id}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            renderMemberNetwork(result.data.network);
        }
    } catch (error) {
        console.error('加载会员关系网失败:', error);
    }
}

// 渲染会员关系网
function renderMemberNetwork(network) {
    const container = document.getElementById('networkTree');
    container.innerHTML = '';
    
    function renderNode(member, level = 0) {
        const node = document.createElement('div');
        node.className = `network-node level-${level}`;
        node.innerHTML = `
            <strong>${member.nickname}</strong> (${member.memberCode})
            <br>
            <small>等级: ${member.memberLevelName || '普通会员'} | 分销等级: ${member.distributorLevelName || '无'}</small>
        `;
        container.appendChild(node);
        
        if (member.children && member.children.length > 0) {
            member.children.forEach(child => renderNode(child, level + 1));
        }
    }
    
    renderNode(network);
}

// 加载消费记录
async function loadConsumptionRecords(page = 1) {
    try {
        const member = window.memberManagementData.currentMemberDetail;
        const token = localStorage.getItem('token');
        const statusFilter = document.getElementById('consumptionStatusFilter').value;
        
        const params = new URLSearchParams({
            page: page,
            limit: 10,
            status: statusFilter
        });
        
        const response = await fetch(`/api/orders/member/${member.id}?${params}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            renderConsumptionRecords(result.data.orders);
            renderConsumptionPagination(result.data);
        }
    } catch (error) {
        console.error('加载消费记录失败:', error);
    }
}

// 渲染消费记录
function renderConsumptionRecords(orders) {
    const tbody = document.getElementById('consumptionTableBody');
    tbody.innerHTML = '';
    
    orders.forEach(order => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${order.orderNo}</td>
            <td>${order.product ? order.product.name : '商品已删除'}</td>
            <td>${order.quantity}</td>
            <td>¥${order.unitPrice}</td>
            <td>¥${order.totalAmount}</td>
            <td><span class="status-badge status-${order.status}">${getOrderStatusText(order.status)}</span></td>
            <td>${getPaymentMethodText(order.paymentMethod)}</td>
            <td>${formatDateTime(order.createdAt)}</td>
        `;
        tbody.appendChild(row);
    });
}

// 渲染消费记录分页
function renderConsumptionPagination(data) {
    const pagination = document.getElementById('consumptionPagination');
    pagination.innerHTML = '';

    const currentPage = data.currentPage;
    const totalPages = data.totalPages;

    // 上一页按钮
    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn btn-sm btn-outline-primary';
    prevBtn.textContent = '上一页';
    prevBtn.disabled = currentPage <= 1;
    prevBtn.onclick = () => loadConsumptionRecords(currentPage - 1);
    pagination.appendChild(prevBtn);

    // 页码按钮
    for (let i = Math.max(1, currentPage - 2); i <= Math.min(totalPages, currentPage + 2); i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `btn btn-sm ${i === currentPage ? 'btn-primary' : 'btn-outline-primary'}`;
        pageBtn.textContent = i;
        pageBtn.onclick = () => loadConsumptionRecords(i);
        pagination.appendChild(pageBtn);
    }

    // 下一页按钮
    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn btn-sm btn-outline-primary';
    nextBtn.textContent = '下一页';
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.onclick = () => loadConsumptionRecords(currentPage + 1);
    pagination.appendChild(nextBtn);
}

// 加载佣金记录
async function loadCommissionRecords(page = 1) {
    try {
        const member = window.memberManagementData.currentMemberDetail;
        const token = localStorage.getItem('token');
        const typeFilter = document.getElementById('commissionTypeFilter').value;
        
        const params = new URLSearchParams({
            page: page,
            limit: 10,
            type: typeFilter
        });
        
        const response = await fetch(`/api/orders/commission/${member.id}?${params}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            renderCommissionRecords(result.data.commissionRecords);
            renderCommissionPagination(result.data);
        }
    } catch (error) {
        console.error('加载佣金记录失败:', error);
    }
}

// 渲染佣金记录
function renderCommissionRecords(records) {
    const tbody = document.getElementById('commissionTableBody');
    tbody.innerHTML = '';
    
    records.forEach(record => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${record.order ? record.order.orderNo : '订单已删除'}</td>
            <td><span class="commission-type-badge type-${record.type}">${getCommissionTypeText(record.type)}</span></td>
            <td>¥${record.amount}</td>
            <td>${record.description || '-'}</td>
            <td><span class="status-badge status-${record.status}">${getCommissionStatusText(record.status)}</span></td>
            <td>${formatDateTime(record.createdAt)}</td>
        `;
        tbody.appendChild(row);
    });
}

// 渲染佣金记录分页
function renderCommissionPagination(data) {
    const pagination = document.getElementById('commissionPagination');
    pagination.innerHTML = '';

    const currentPage = data.currentPage;
    const totalPages = data.totalPages;

    // 上一页按钮
    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn btn-sm btn-outline-primary';
    prevBtn.textContent = '上一页';
    prevBtn.disabled = currentPage <= 1;
    prevBtn.onclick = () => loadCommissionRecords(currentPage - 1);
    pagination.appendChild(prevBtn);

    // 页码按钮
    for (let i = Math.max(1, currentPage - 2); i <= Math.min(totalPages, currentPage + 2); i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `btn btn-sm ${i === currentPage ? 'btn-primary' : 'btn-outline-primary'}`;
        pageBtn.textContent = i;
        pageBtn.onclick = () => loadCommissionRecords(i);
        pagination.appendChild(pageBtn);
    }

    // 下一页按钮
    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn btn-sm btn-outline-primary';
    nextBtn.textContent = '下一页';
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.onclick = () => loadCommissionRecords(currentPage + 1);
    pagination.appendChild(nextBtn);
}

// 加载测试商品
async function loadTestProducts() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/products', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            const select = document.getElementById('testProductId');
            select.innerHTML = '<option value="">请选择商品</option>';
            
            result.data.products.forEach(product => {
                const option = document.createElement('option');
                option.value = product.id;
                option.textContent = `${product.name} - ¥${product.price}`;
                option.dataset.price = product.price;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('加载商品列表失败:', error);
    }
}

// 计算总金额
function calculateTotalAmount() {
    const quantity = parseFloat(document.getElementById('testQuantity').value) || 0;
    const unitPrice = parseFloat(document.getElementById('testUnitPrice').value) || 0;
    const totalAmount = quantity * unitPrice;
    document.getElementById('testTotalAmount').value = totalAmount.toFixed(2);
}

// 处理测试订单表单提交
async function handleTestOrderSubmit(event) {
    event.preventDefault();
    await submitCreateOrder();
}

// 提交创建订单
async function submitCreateOrder() {
    const formData = new FormData(document.getElementById('testOrderForm'));
    
    const orderData = {
        memberId: parseInt(formData.get('testMemberId')),
        productId: parseInt(formData.get('testProductId')),
        quantity: parseInt(formData.get('testQuantity')),
        unitPrice: parseFloat(formData.get('testUnitPrice')),
        totalAmount: parseFloat(formData.get('testTotalAmount')),
        paymentMethod: formData.get('testPaymentMethod'),
        shippingAddress: formData.get('testShippingAddress'),
        remark: formData.get('testRemark')
    };
    
    // 验证必填字段
    if (!orderData.memberId || !orderData.productId || !orderData.quantity || !orderData.unitPrice || !orderData.totalAmount) {
        alert('请填写所有必填字段');
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/orders/test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(orderData)
        });
        
        const result = await response.json();
        
        if (result.code === 0) {
            alert('测试订单创建成功！');
            closeCreateOrderModal();
            loadConsumptionRecords();
            loadCommissionRecords();
        } else {
            alert('创建失败: ' + result.message);
        }
    } catch (error) {
        console.error('创建订单失败:', error);
        alert('创建失败: ' + error.message);
    }
}

// 提交会员表单
async function submitMemberForm(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    
    // 获取表单数据
    const memberData = {
        nickname: formData.get('nickname'),
        realName: formData.get('realName'),
        phone: formData.get('phone'),
        openid: formData.get('openid'),
        unionid: formData.get('unionid'),
        gender: formData.get('gender') || null,
        birthday: formData.get('birthday') || null,
        province: formData.get('province'),
        city: formData.get('city'),
        district: formData.get('district'),
        address: formData.get('address'),
        memberLevelId: formData.get('memberLevelId') || null,
        distributorLevelId: formData.get('distributorLevelId') || null,
        teamExpansionLevelId: formData.get('teamExpansionLevelId') || null,
        referrerId: formData.get('referrerId') || null, // 添加推荐人字段
        status: formData.get('status'),
        avatar: formData.get('avatar'),
        remark: formData.get('remark')
    };
    
    // 验证必填字段
    if (!memberData.nickname) {
        alert('昵称不能为空');
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        const isEditing = window.memberManagementData.editingMember;
        const url = isEditing 
            ? `/api/members/${window.memberManagementData.editingMember.id}`
            : '/api/members';
        const method = isEditing ? 'PUT' : 'POST';
        
        console.log('Submitting member data:', memberData);
        console.log('Is editing:', isEditing);
        console.log('URL:', url);
        console.log('Method:', method);
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(memberData)
        });
        
        const result = await response.json();
        console.log('Response:', result);
        
        if (result.code === 0) {
            alert(isEditing ? '会员更新成功' : '会员创建成功');
            closeMemberModal();
            loadMembers(); // 重新加载会员列表
        } else {
            alert('操作失败: ' + result.message);
        }
    } catch (error) {
        console.error('提交表单失败:', error);
        alert('操作失败: ' + error.message);
    }
}

// 删除会员
async function deleteMember(id) {
    if (!confirm('确定要删除这个会员吗？')) {
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/members/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const result = await response.json();
        
        if (result.code === 0) {
            alert('删除成功');
            loadMembers();
        } else {
            alert('删除失败: ' + result.message);
        }
    } catch (error) {
        console.error('删除会员失败:', error);
        alert('删除失败: ' + error.message);
    }
}

// 批量删除会员
async function batchDeleteMembers() {
    const selectedMembers = Array.from(window.memberManagementData.selectedMembers);
    
    if (selectedMembers.length === 0) {
        alert('请选择要删除的会员');
        return;
    }
    
    if (!confirm(`确定要删除选中的 ${selectedMembers.length} 个会员吗？`)) {
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/members/batch-delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ ids: selectedMembers })
        });
        
        const result = await response.json();
        
        if (result.code === 0) {
            alert('批量删除成功');
            window.memberManagementData.selectedMembers.clear();
            document.getElementById('selectAll').checked = false;
            loadMembers();
        } else {
            alert('批量删除失败: ' + result.message);
        }
    } catch (error) {
        console.error('批量删除会员失败:', error);
        alert('批量删除失败: ' + error.message);
    }
}

// 关闭会员模态框
function closeMemberModal() {
    document.getElementById('memberModal').style.display = 'none';
    window.memberManagementData.editingMember = null;
}

// 关闭会员详情模态框
function closeMemberDetailModal() {
    document.getElementById('memberDetailModal').style.display = 'none';
    window.memberManagementData.currentMemberDetail = null;
}

// 关闭创建订单模态框
function closeCreateOrderModal() {
    document.getElementById('createOrderModal').style.display = 'none';
    document.getElementById('testOrderForm').reset();
}

// ==================== 公开方法 ====================
// 直接暴露到全局作用域，以便HTML中的onclick事件可以调用

// 会员操作相关
window.viewMemberDetail = viewMemberDetail;
window.editMember = editMember;
window.deleteMember = deleteMember;

// 模态框控制
window.closeMemberModal = closeMemberModal;
window.closeMemberDetailModal = closeMemberDetailModal;

// 表单提交
window.submitMemberForm = submitMemberForm;

// 搜索和筛选
window.searchMembers = searchMembers;
window.resetFilters = resetFilters;

// 分页
window.goToPage = goToPage;

// 全选
window.toggleSelectAll = toggleSelectAll;

// 批量操作
window.batchDeleteMembers = batchDeleteMembers;

// 添加会员
window.showAddMemberModal = showAddMemberModal;

// 标签页切换
window.switchTab = switchTab;

// 测试功能
window.calculateTotalAmount = calculateTotalAmount;
window.handleTestOrderSubmit = handleTestOrderSubmit;

// 记录刷新
window.loadConsumptionRecords = loadConsumptionRecords;
window.loadCommissionRecords = loadCommissionRecords;

// 调整积分和佣金
window.showAdjustPointsModal = showAdjustPointsModal;
window.closeAdjustPointsModal = closeAdjustPointsModal;
window.showAdjustCommissionModal = showAdjustCommissionModal;
window.closeAdjustCommissionModal = closeAdjustCommissionModal;

// 创建 MemberManagement 对象
window.MemberManagement = {
    init: initMemberManagement,
    viewMemberDetail: viewMemberDetail,
    editMember: editMember,
    deleteMember: deleteMember,
    closeMemberModal: closeMemberModal,
    closeMemberDetailModal: closeMemberDetailModal,
    submitMemberForm: submitMemberForm,
    searchMembers: searchMembers,
    resetFilters: resetFilters,
    goToPage: goToPage,
    toggleSelectAll: toggleSelectAll,
    batchDeleteMembers: batchDeleteMembers,
    showAddMemberModal: showAddMemberModal,
    switchTab: switchTab,
    calculateTotalAmount: calculateTotalAmount,
    handleTestOrderSubmit: handleTestOrderSubmit,
    loadConsumptionRecords: loadConsumptionRecords,
    loadCommissionRecords: loadCommissionRecords,
    showAdjustPointsModal: showAdjustPointsModal,
    closeAdjustPointsModal: closeAdjustPointsModal,
    showAdjustCommissionModal: showAdjustCommissionModal,
    closeAdjustCommissionModal: closeAdjustCommissionModal,
    handleAdjustPoints: handleAdjustPoints,
    handleAdjustCommission: handleAdjustCommission
};

// 显示调整积分模态框
function showAdjustPointsModal() {
    const member = window.memberManagementData.currentMemberDetail;
    if (!member) {
        alert('请先选择会员');
        return;
    }
    
    const currentPoints = parseInt(member.availablePoints || 0);
    document.getElementById('currentPoints').value = currentPoints;
    document.getElementById('pointsAmount').value = '';
    document.getElementById('newPoints').value = currentPoints;
    document.getElementById('pointsDescription').value = '';
    
    // 监听输入变化，实时计算新积分
    document.getElementById('pointsAmount').addEventListener('input', function() {
        const amount = parseInt(this.value) || 0;
        const newPoints = Math.max(0, currentPoints + amount);
        document.getElementById('newPoints').value = newPoints;
    });
    
    document.getElementById('adjustPointsModal').style.display = 'flex';
}

// 关闭调整积分模态框
function closeAdjustPointsModal() {
    document.getElementById('adjustPointsModal').style.display = 'none';
    document.getElementById('adjustPointsForm').reset();
}

// 显示调整佣金模态框
function showAdjustCommissionModal() {
    const member = window.memberManagementData.currentMemberDetail;
    if (!member) {
        alert('请先选择会员');
        return;
    }
    
    const currentCommission = parseFloat(member.availableCommission || 0);
    document.getElementById('currentCommission').value = '¥' + currentCommission.toFixed(2);
    document.getElementById('commissionAmount').value = '';
    document.getElementById('newCommission').value = '¥' + currentCommission.toFixed(2);
    document.getElementById('commissionDescription').value = '';
    
    // 监听输入变化，实时计算新佣金
    document.getElementById('commissionAmount').addEventListener('input', function() {
        const amount = parseFloat(this.value) || 0;
        const newCommission = Math.max(0, currentCommission + amount);
        document.getElementById('newCommission').value = '¥' + newCommission.toFixed(2);
    });
    
    document.getElementById('adjustCommissionModal').style.display = 'flex';
}

// 关闭调整佣金模态框
function closeAdjustCommissionModal() {
    document.getElementById('adjustCommissionModal').style.display = 'none';
    document.getElementById('adjustCommissionForm').reset();
}

// 处理调整积分
async function handleAdjustPoints(e) {
    e.preventDefault();
    
    const member = window.memberManagementData.currentMemberDetail;
    if (!member) {
        alert('请先选择会员');
        return;
    }
    
    const pointsAmount = parseInt(document.getElementById('pointsAmount').value);
    const description = document.getElementById('pointsDescription').value;
    
    if (isNaN(pointsAmount) || pointsAmount === 0) {
        alert('请输入有效的积分数量');
        return;
    }
    
    if (!confirm(`确认${pointsAmount > 0 ? '增加' : '减少'} ${Math.abs(pointsAmount)} 积分吗？`)) {
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/members/${member.id}/points`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                type: 'admin_adjust',
                points: pointsAmount,
                source: 'admin_adjust',
                description: description || `管理员调整：${pointsAmount > 0 ? '增加' : '减少'} ${Math.abs(pointsAmount)} 积分`
            })
        });
        
        const result = await response.json();
        
        if (result.code === 0) {
            alert('积分调整成功');
            closeAdjustPointsModal();
            // 重新加载会员详情
            await viewMemberDetail(member.id);
        } else {
            alert('积分调整失败: ' + result.message);
        }
    } catch (error) {
        console.error('调整积分失败:', error);
        alert('调整积分失败');
    }
}

// 处理调整佣金
async function handleAdjustCommission(e) {
    e.preventDefault();
    
    const member = window.memberManagementData.currentMemberDetail;
    if (!member) {
        alert('请先选择会员');
        return;
    }
    
    const commissionAmountInput = document.getElementById('commissionAmount').value;
    const description = document.getElementById('commissionDescription').value;
    
    if (!commissionAmountInput || commissionAmountInput.trim() === '') {
        alert('请输入佣金金额');
        return;
    }
    
    const commissionAmount = parseFloat(commissionAmountInput);
    
    if (isNaN(commissionAmount) || commissionAmount === 0) {
        alert('请输入有效的佣金金额');
        return;
    }
    
    if (!confirm(`确认${commissionAmount > 0 ? '增加' : '减少'} ¥${Math.abs(commissionAmount).toFixed(2)} 佣金吗？`)) {
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/members/${member.id}/commission`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                type: 'admin_adjust',
                amount: Number(commissionAmount), // 确保是数字类型
                source: 'admin_adjust',
                description: description || `管理员调整：${commissionAmount > 0 ? '增加' : '减少'} ¥${Math.abs(commissionAmount).toFixed(2)}`
            })
        });
        
        const result = await response.json();
        
        if (result.code === 0) {
            alert('佣金调整成功');
            closeAdjustCommissionModal();
            // 重新加载会员详情
            await viewMemberDetail(member.id);
        } else {
            alert('佣金调整失败: ' + result.message);
        }
    } catch (error) {
        console.error('调整佣金失败:', error);
        alert('调整佣金失败');
    }
}

// 辅助函数
function getStatusText(status) {
    const statusMap = {
        'active': '活跃',
        'inactive': '非活跃',
        'suspended': '暂停'
    };
    return statusMap[status] || status;
}

function getGenderText(gender) {
    const genderMap = {
        'male': '男',
        'female': '女',
        'other': '其他'
    };
    return genderMap[gender] || '-';
}

function getOrderStatusText(status) {
    const statusMap = {
        'pending': '待支付',
        'paid': '已支付',
        'shipped': '已发货',
        'delivered': '已送达',
        'cancelled': '已取消',
        'refunded': '已退款'
    };
    return statusMap[status] || status;
}

function getPaymentMethodText(method) {
    const methodMap = {
        'wechat': '微信支付',
        'alipay': '支付宝',
        'bank': '银行卡',
        'points': '积分支付',
        'commission': '佣金支付',
        'test': '测试支付'
    };
    return methodMap[method] || method;
}

function getCommissionTypeText(type) {
    const typeMap = {
        'direct': '直接佣金',
        'indirect': '间接佣金',
        'differential': '差额佣金',
        'team_expansion': '团队拓展'
    };
    return typeMap[type] || type;
}

function getCommissionStatusText(status) {
    const statusMap = {
        'pending': '待结算',
        'completed': '已结算',
        'cancelled': '已取消'
    };
    return statusMap[status] || status;
}

function formatSalesRange(minSales, maxSales) {
    if (maxSales === null) {
        return `≥¥${minSales}`;
    }
    return `¥${minSales} - ¥${maxSales}`;
}

function formatFansRange(minFans, maxFans) {
    if (maxFans === null) {
        return `≥${minFans}人`;
    }
    return `${minFans} - ${maxFans}人`;
}

function formatPrivileges(privileges) {
    if (!privileges || Object.keys(privileges).length === 0) {
        return '无';
    }
    return Object.keys(privileges).join(', ');
}

function formatDateTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN');
}

// 调试信息
console.log('Available functions:', {
    viewMemberDetail: typeof window.viewMemberDetail,
    editMember: typeof window.editMember,
    deleteMember: typeof window.deleteMember,
    closeMemberModal: typeof window.closeMemberModal,
    switchTab: typeof window.switchTab,
    searchMembers: typeof window.searchMembers,
    showAddMemberModal: typeof window.showAddMemberModal
});