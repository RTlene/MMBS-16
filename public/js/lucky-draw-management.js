// 抽奖活动管理数据
window.luckyDrawData = {
    draws: [],
    currentPage: 1,
    totalPages: 1,
    pageSize: 10,
    searchKeyword: '',
    statusFilter: '',
    currentDraw: null,
    prizeCount: 0
};

// 页面初始化
function initLuckyDrawManagement() {
    console.log('初始化抽奖活动管理页面');
    loadStats();
    loadDraws();
    bindEvents();
}

// 绑定事件
function bindEvents() {
    // 搜索输入框回车事件
    document.getElementById('searchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchDraws();
        }
    });

    // 筛选条件变化事件
    document.getElementById('statusFilter').addEventListener('change', searchDraws);
}

// 加载统计数据
async function loadStats() {
    try {
        const response = await fetch('/api/lucky-draws/stats', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            document.getElementById('totalDraws').textContent = result.data.total || 0;
            document.getElementById('activeDraws').textContent = result.data.active || 0;
            document.getElementById('draftDraws').textContent = result.data.draft || 0;
            document.getElementById('endedDraws').textContent = result.data.ended || 0;
        }
    } catch (error) {
        console.error('加载统计数据失败:', error);
    }
}

// 加载抽奖活动列表
async function loadDraws() {
    try {
        const params = new URLSearchParams({
            page: window.luckyDrawData.currentPage,
            limit: window.luckyDrawData.pageSize,
            search: window.luckyDrawData.searchKeyword,
            status: window.luckyDrawData.statusFilter
        });

        const response = await fetch(`/api/lucky-draws?${params}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            window.luckyDrawData.draws = result.data.draws || [];
            window.luckyDrawData.totalPages = result.data.totalPages || 1;
            renderDrawTable();
            renderPagination();
        } else {
            alert('加载抽奖活动列表失败: ' + result.message);
        }
    } catch (error) {
        console.error('加载抽奖活动列表失败:', error);
        alert('加载抽奖活动列表失败');
    }
}

// 渲染抽奖活动表格
function renderDrawTable() {
    const tbody = document.getElementById('drawTableBody');
    tbody.innerHTML = '';

    window.luckyDrawData.draws.forEach(draw => {
        const row = document.createElement('tr');
        const prizeCount = draw.prizes ? Object.keys(draw.prizes).length : 0;
        
        row.innerHTML = `
            <td>${draw.id}</td>
            <td>${draw.name}</td>
            <td><span class="status-badge status-${draw.status}">${getStatusText(draw.status)}</span></td>
            <td>${formatDate(draw.startTime)}</td>
            <td>${formatDate(draw.endTime)}</td>
            <td>${prizeCount}</td>
            <td>${formatDate(draw.createdAt)}</td>
            <td>
                <button class="btn btn-primary" onclick="editDraw(${draw.id})">编辑</button>
                <button class="btn btn-warning" onclick="toggleDrawStatus(${draw.id})">${getToggleButtonText(draw.status)}</button>
                <button class="btn btn-danger" onclick="deleteDraw(${draw.id})">删除</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 渲染分页
function renderPagination() {
    const pagination = document.getElementById('pagination');
    pagination.innerHTML = '';

    const { currentPage, totalPages } = window.luckyDrawData;

    // 上一页按钮
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '上一页';
    prevBtn.disabled = currentPage <= 1;
    prevBtn.onclick = () => {
        if (currentPage > 1) {
            window.luckyDrawData.currentPage = currentPage - 1;
            loadDraws();
        }
    };
    pagination.appendChild(prevBtn);

    // 页码按钮
    for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.textContent = i;
        pageBtn.className = i === currentPage ? 'active' : '';
        pageBtn.onclick = () => {
            window.luckyDrawData.currentPage = i;
            loadDraws();
        };
        pagination.appendChild(pageBtn);
    }

    // 下一页按钮
    const nextBtn = document.createElement('button');
    nextBtn.textContent = '下一页';
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.onclick = () => {
        if (currentPage < totalPages) {
            window.luckyDrawData.currentPage = currentPage + 1;
            loadDraws();
        }
    };
    pagination.appendChild(nextBtn);
}

// 搜索抽奖活动
function searchDraws() {
    window.luckyDrawData.searchKeyword = document.getElementById('searchInput').value;
    window.luckyDrawData.statusFilter = document.getElementById('statusFilter').value;
    window.luckyDrawData.currentPage = 1;
    loadDraws();
}

// 显示添加抽奖活动模态框
function showAddDrawModal() {
    window.luckyDrawData.currentDraw = null;
    document.getElementById('drawModalTitle').textContent = '添加抽奖活动';
    document.getElementById('drawForm').reset();
    window.luckyDrawData.prizeCount = 0;
    renderPrizeList();
    document.getElementById('drawModal').classList.add('show');
}

// 编辑抽奖活动
function editDraw(drawId) {
    const draw = window.luckyDrawData.draws.find(d => d.id === drawId);
    if (!draw) return;

    window.luckyDrawData.currentDraw = draw;
    document.getElementById('drawModalTitle').textContent = '编辑抽奖活动';
    
    // 填充表单数据
    document.getElementById('drawName').value = draw.name;
    document.getElementById('drawDescription').value = draw.description || '';
    document.getElementById('startTime').value = formatDateTimeLocal(draw.startTime);
    document.getElementById('endTime').value = formatDateTimeLocal(draw.endTime);
    
    // 渲染奖品列表
    if (draw.prizes) {
        window.luckyDrawData.prizeCount = Object.keys(draw.prizes).length;
        renderPrizeList(draw.prizes);
    } else {
        window.luckyDrawData.prizeCount = 0;
        renderPrizeList();
    }
    
    document.getElementById('drawModal').classList.add('show');
}

// 渲染奖品列表
function renderPrizeList(prizes = {}) {
    const prizeList = document.getElementById('prizeList');
    prizeList.innerHTML = '';

    for (let i = 0; i < window.luckyDrawData.prizeCount; i++) {
        const prizeItem = document.createElement('div');
        prizeItem.className = 'prize-item';
        prizeItem.innerHTML = `
            <input type="text" placeholder="奖品名称" value="${prizes[`prize${i}`]?.name || ''}" data-field="name">
            <input type="number" placeholder="中奖概率(%)" min="0" max="100" step="0.01" value="${prizes[`prize${i}`]?.probability || ''}" data-field="probability">
            <input type="number" placeholder="奖品数量" min="1" value="${prizes[`prize${i}`]?.quantity || ''}" data-field="quantity">
            <button type="button" class="btn btn-danger" onclick="removePrize(${i})">删除</button>
        `;
        prizeList.appendChild(prizeItem);
    }
}

// 添加奖品
function addPrize() {
    window.luckyDrawData.prizeCount++;
    renderPrizeList();
}

// 删除奖品
function removePrize(index) {
    if (window.luckyDrawData.prizeCount <= 1) {
        alert('至少需要保留一个奖品');
        return;
    }
    
    window.luckyDrawData.prizeCount--;
    renderPrizeList();
}

// 保存抽奖活动
async function saveDraw() {
    const formData = {
        name: document.getElementById('drawName').value,
        description: document.getElementById('drawDescription').value,
        startTime: document.getElementById('startTime').value,
        endTime: document.getElementById('endTime').value,
        prizes: getPrizesConfig()
    };

    // 验证奖品配置
    if (Object.keys(formData.prizes).length === 0) {
        alert('请至少添加一个奖品');
        return;
    }

    // 验证概率总和
    const totalProbability = Object.values(formData.prizes).reduce((sum, prize) => sum + (prize.probability || 0), 0);
    if (Math.abs(totalProbability - 100) > 0.01) {
        alert('所有奖品的中奖概率总和必须等于100%');
        return;
    }

    try {
        const url = window.luckyDrawData.currentDraw 
            ? `/api/lucky-draws/${window.luckyDrawData.currentDraw.id}`
            : '/api/lucky-draws';
        
        const method = window.luckyDrawData.currentDraw ? 'PUT' : 'POST';
        
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
            closeDrawModal();
            loadDraws();
            loadStats();
        } else {
            alert('保存失败: ' + result.message);
        }
    } catch (error) {
        console.error('保存抽奖活动失败:', error);
        alert('保存失败');
    }
}

// 获取奖品配置
function getPrizesConfig() {
    const prizes = {};
    const prizeItems = document.querySelectorAll('.prize-item');
    
    prizeItems.forEach((item, index) => {
        const name = item.querySelector('[data-field="name"]').value;
        const probability = parseFloat(item.querySelector('[data-field="probability"]').value);
        const quantity = parseInt(item.querySelector('[data-field="quantity"]').value);
        
        if (name && !isNaN(probability) && !isNaN(quantity)) {
            prizes[`prize${index}`] = {
                name: name,
                probability: probability,
                quantity: quantity
            };
        }
    });
    
    return prizes;
}

// 切换抽奖活动状态
async function toggleDrawStatus(drawId) {
    const draw = window.luckyDrawData.draws.find(d => d.id === drawId);
    if (!draw) return;

    let newStatus;
    let action;
    
    switch (draw.status) {
        case 'draft':
            newStatus = 'active';
            action = '启动';
            break;
        case 'active':
            newStatus = 'ended';
            action = '结束';
            break;
        default:
            alert('当前状态无法切换');
            return;
    }

    if (!confirm(`确定要${action}这个抽奖活动吗？`)) return;

    try {
        const response = await fetch(`/api/lucky-draws/${drawId}/status`, {
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
            loadDraws();
            loadStats();
        } else {
            alert(`${action}失败: ` + result.message);
        }
    } catch (error) {
        console.error(`${action}抽奖活动失败:`, error);
        alert(`${action}失败`);
    }
}

// 删除抽奖活动
async function deleteDraw(drawId) {
    if (!confirm('确定要删除这个抽奖活动吗？')) return;

    try {
        const response = await fetch(`/api/lucky-draws/${drawId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const result = await response.json();
        
        if (result.code === 0) {
            alert('删除成功');
            loadDraws();
            loadStats();
        } else {
            alert('删除失败: ' + result.message);
        }
    } catch (error) {
        console.error('删除抽奖活动失败:', error);
        alert('删除失败');
    }
}

// 关闭模态框
function closeDrawModal() {
    document.getElementById('drawModal').classList.remove('show');
}

// 工具函数
function getStatusText(status) {
    const statusMap = {
        'draft': '草稿',
        'active': '进行中',
        'ended': '已结束'
    };
    return statusMap[status] || status;
}

function getToggleButtonText(status) {
    const buttonMap = {
        'draft': '启动',
        'active': '结束',
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
window.LuckyDrawManagement = { init: initLuckyDrawManagement };
document.addEventListener('DOMContentLoaded', function() {
    initLuckyDrawManagement();
});