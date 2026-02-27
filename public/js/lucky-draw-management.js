// 抽奖活动管理数据
window.luckyDrawData = {
    draws: [],
    currentPage: 1,
    totalPages: 1,
    pageSize: 10,
    searchKeyword: '',
    statusFilter: '',
    currentDraw: null,
    prizeCount: 0,
    productsList: [],
    couponsList: [],
    customPrizesList: []
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

// 加载奖品类型所需的下拉数据（商品、优惠券、自定义奖品）
async function loadPrizeOptions() {
    const token = localStorage.getItem('token');
    const headers = { 'Authorization': 'Bearer ' + token };
    try {
        const [productsRes, couponsRes, customRes] = await Promise.all([
            fetch('/api/products?page=1&limit=500&status=active', { headers }),
            fetch('/api/coupons?page=1&limit=500&status=active', { headers }),
            fetch('/api/custom-prizes/all', { headers })
        ]);
        const productsData = await productsRes.json();
        const couponsData = await couponsRes.json();
        const customData = await customRes.json();
        if (productsData.code === 0 && productsData.data && productsData.data.products) {
            window.luckyDrawData.productsList = productsData.data.products;
        }
        if (couponsData.code === 0 && couponsData.data && couponsData.data.coupons) {
            window.luckyDrawData.couponsList = couponsData.data.coupons;
        }
        if (customData.code === 0 && customData.data && customData.data.list) {
            window.luckyDrawData.customPrizesList = customData.data.list;
        }
    } catch (e) {
        console.error('加载奖品选项失败:', e);
    }
}

// 显示添加抽奖活动模态框
async function showAddDrawModal() {
    window.luckyDrawData.currentDraw = null;
    document.getElementById('drawModalTitle').textContent = '添加抽奖活动';
    document.getElementById('drawForm').reset();
    window.luckyDrawData.prizeCount = 0;
    await loadPrizeOptions();
    renderPrizeList();
    document.getElementById('drawModal').classList.add('show');
}

// 编辑抽奖活动
async function editDraw(drawId) {
    const draw = window.luckyDrawData.draws.find(d => d.id === drawId);
    if (!draw) return;

    window.luckyDrawData.currentDraw = draw;
    document.getElementById('drawModalTitle').textContent = '编辑抽奖活动';
    document.getElementById('drawName').value = draw.name;
    document.getElementById('drawDescription').value = draw.description || '';
    document.getElementById('startTime').value = formatDateTimeLocal(draw.startTime);
    document.getElementById('endTime').value = formatDateTimeLocal(draw.endTime);

    await loadPrizeOptions();
    if (draw.prizes) {
        window.luckyDrawData.prizeCount = Object.keys(draw.prizes).length;
        renderPrizeList(draw.prizes);
    } else {
        window.luckyDrawData.prizeCount = 0;
        renderPrizeList();
    }
    document.getElementById('drawModal').classList.add('show');
}

// 奖品类型选项
const PRIZE_TYPE_OPTIONS = [
    { value: 'product', label: '商品' },
    { value: 'coupon', label: '优惠券' },
    { value: 'points', label: '积分' },
    { value: 'commission', label: '佣金奖励' },
    { value: 'custom', label: '自定义' }
];

// 渲染奖品列表（含类型与关联配置）
function renderPrizeList(prizes = {}) {
    const prizeList = document.getElementById('prizeList');
    prizeList.innerHTML = '';
    const products = window.luckyDrawData.productsList || [];
    const coupons = window.luckyDrawData.couponsList || [];
    const customPrizes = window.luckyDrawData.customPrizesList || [];

    for (let i = 0; i < window.luckyDrawData.prizeCount; i++) {
        const p = prizes['prize' + i] || {};
        const type = (p.type || 'custom').toLowerCase();
        const prizeItem = document.createElement('div');
        prizeItem.className = 'prize-item';
        prizeItem.dataset.index = i;

        const typeSelectOpts = PRIZE_TYPE_OPTIONS.map(o => '<option value="' + o.value + '"' + (type === o.value ? ' selected' : '') + '>' + o.label + '</option>').join('');
        const productOpts = '<option value="">请选择商品</option>' + products.map(pr => '<option value="' + pr.id + '"' + (p.productId == pr.id ? ' selected' : '') + '>' + (pr.name || '') + '</option>').join('');
        const couponOpts = '<option value="">请选择优惠券</option>' + coupons.map(c => '<option value="' + c.id + '"' + (p.couponId == c.id ? ' selected' : '') + '>' + (c.name || c.code || '') + '</option>').join('');
        const customOpts = '<option value="">请选择自定义奖品</option>' + customPrizes.map(cp => '<option value="' + cp.id + '"' + (p.customPrizeId == cp.id ? ' selected' : '') + '>' + (cp.name || '') + '</option>').join('');

        prizeItem.innerHTML = `
            <select class="prize-type-select" data-field="type" onchange="onPrizeTypeChange(${i})">${typeSelectOpts}</select>
            <div class="prize-ref prize-ref-product" data-type-ref="product" style="display:${type === 'product' ? 'inline-block' : 'none'}">
                <select class="prize-ref" data-field="productId"><option value="">请选择商品</option>${products.map(pr => '<option value="' + pr.id + '"' + (p.productId == pr.id ? ' selected' : '') + '>' + (pr.name || '') + '</option>').join('')}</select>
            </div>
            <div class="prize-ref prize-ref-coupon" data-type-ref="coupon" style="display:${type === 'coupon' ? 'inline-block' : 'none'}">
                <select class="prize-ref" data-field="couponId"><option value="">请选择优惠券</option>${coupons.map(c => '<option value="' + c.id + '"' + (p.couponId == c.id ? ' selected' : '') + '>' + (c.name || c.code || '') + '</option>').join('')}</select>
            </div>
            <div class="prize-ref prize-ref-points" data-type-ref="points" style="display:${type === 'points' ? 'inline-block' : 'none'}">
                <input type="number" class="prize-ref" data-field="points" min="0" placeholder="积分" value="${p.points != null ? p.points : ''}" style="width:100px">
            </div>
            <div class="prize-ref prize-ref-commission" data-type-ref="commission" style="display:${type === 'commission' ? 'inline-block' : 'none'}">
                <input type="number" class="prize-ref" data-field="commissionAmount" min="0" step="0.01" placeholder="佣金金额" value="${p.commissionAmount != null ? p.commissionAmount : ''}" style="width:100px">
            </div>
            <div class="prize-ref prize-ref-custom" data-type-ref="custom" style="display:${type === 'custom' ? 'inline-block' : 'none'}">
                <select class="prize-ref" data-field="customPrizeId"><option value="">可选自定义奖品</option>${customPrizes.map(cp => '<option value="' + cp.id + '"' + (p.customPrizeId == cp.id ? ' selected' : '') + '>' + (cp.name || '') + '</option>').join('')}</select>
            </div>
            <input type="text" class="prize-name" placeholder="奖品名称" value="${escapeHtml(p.name || '')}" data-field="name">
            <input type="number" class="prize-prob" placeholder="概率%" min="0" max="100" step="0.01" value="${p.probability != null ? p.probability : ''}" data-field="probability">
            <input type="number" class="prize-qty" placeholder="数量" min="1" value="${p.quantity != null ? p.quantity : ''}" data-field="quantity">
            <button type="button" class="btn btn-danger btn-remove-prize" onclick="removePrize(${i})">删除</button>
        `;
        prizeList.appendChild(prizeItem);
    }
}

function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

// 切换奖品类型时显示/隐藏对应控件
function onPrizeTypeChange(index) {
    const container = document.querySelector('.prize-item[data-index="' + index + '"]');
    if (!container) return;
    const type = (container.querySelector('[data-field="type"]') || {}).value;
    container.querySelectorAll('[data-type-ref]').forEach(el => {
        el.style.display = el.getAttribute('data-type-ref') === type ? 'inline-block' : 'none';
    });
}

// 添加奖品
function addPrize() {
    window.luckyDrawData.prizeCount++;
    renderPrizeList();
}

// 删除奖品（保留其余行数据）
function removePrize(index) {
    if (window.luckyDrawData.prizeCount <= 1) {
        alert('至少需要保留一个奖品');
        return;
    }
    const current = getPrizesConfig();
    const keys = Object.keys(current).sort();
    keys.splice(index, 1);
    const next = {};
    keys.forEach((k, i) => { next['prize' + i] = current[k]; });
    window.luckyDrawData.prizeCount = keys.length;
    renderPrizeList(next);
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

// 获取奖品配置（含 type 及关联字段）
function getPrizesConfig() {
    const prizes = {};
    const prizeItems = document.querySelectorAll('.prize-item');
    prizeItems.forEach((item, index) => {
        const name = (item.querySelector('[data-field="name"]') || {}).value;
        const probability = parseFloat((item.querySelector('[data-field="probability"]') || {}).value);
        const quantity = parseInt((item.querySelector('[data-field="quantity"]') || {}).value, 10);
        const type = ((item.querySelector('[data-field="type"]') || {}).value || 'custom').toLowerCase();
        if (!name || isNaN(probability) || isNaN(quantity)) return;

        const row = {
            type: type,
            name: name,
            probability: probability,
            quantity: quantity
        };
        if (type === 'product') {
            const v = (item.querySelector('[data-field="productId"]') || {}).value;
            if (v) row.productId = parseInt(v, 10);
        } else if (type === 'coupon') {
            const v = (item.querySelector('[data-field="couponId"]') || {}).value;
            if (v) row.couponId = parseInt(v, 10);
        } else if (type === 'points') {
            const v = (item.querySelector('[data-field="points"]') || {}).value;
            if (v !== '' && v != null) row.points = parseInt(v, 10);
        } else if (type === 'commission') {
            const v = (item.querySelector('[data-field="commissionAmount"]') || {}).value;
            if (v !== '' && v != null) row.commissionAmount = parseFloat(v);
        } else if (type === 'custom') {
            const v = (item.querySelector('[data-field="customPrizeId"]') || {}).value;
            if (v) row.customPrizeId = parseInt(v, 10);
        }
        prizes['prize' + index] = row;
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

// ---------- 自定义奖品管理 ----------
function openCustomPrizeManage() {
    document.getElementById('customPrizeModal').classList.add('show');
    hideCustomPrizeForm();
    loadCustomPrizes();
}

function closeCustomPrizeModal() {
    document.getElementById('customPrizeModal').classList.remove('show');
}

async function loadCustomPrizes() {
    try {
        const res = await fetch('/api/custom-prizes?page=1&limit=200', {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        const data = await res.json();
        const list = (data.code === 0 && data.data && data.data.list) ? data.data.list : [];
        window.luckyDrawData.customPrizesList = list;
        renderCustomPrizeTable(list);
    } catch (e) {
        console.error('加载自定义奖品失败:', e);
        renderCustomPrizeTable([]);
    }
}

function renderCustomPrizeTable(list) {
    const tbody = document.getElementById('customPrizeTableBody');
    tbody.innerHTML = '';
    list.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td>' + item.id + '</td><td>' + escapeHtml(item.name || '') + '</td><td>' + escapeHtml((item.description || '').slice(0, 50)) + '</td><td><button type="button" class="btn btn-primary" onclick="editCustomPrize(' + item.id + ')">编辑</button> <button type="button" class="btn btn-danger" onclick="deleteCustomPrize(' + item.id + ')">删除</button></td>';
        tbody.appendChild(tr);
    });
}

function showAddCustomPrizeForm() {
    document.getElementById('customPrizeFormBox').style.display = 'block';
    document.getElementById('customPrizeId').value = '';
    document.getElementById('customPrizeName').value = '';
    document.getElementById('customPrizeDesc').value = '';
    document.getElementById('customPrizeImage').value = '';
    document.getElementById('customPrizeSort').value = '0';
}

function hideCustomPrizeForm() {
    document.getElementById('customPrizeFormBox').style.display = 'none';
}

async function editCustomPrize(id) {
    try {
        const res = await fetch('/api/custom-prizes/' + id, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        const data = await res.json();
        if (data.code !== 0 || !data.data) { alert('获取失败'); return; }
        const item = data.data;
        document.getElementById('customPrizeFormBox').style.display = 'block';
        document.getElementById('customPrizeId').value = item.id;
        document.getElementById('customPrizeName').value = item.name || '';
        document.getElementById('customPrizeDesc').value = item.description || '';
        document.getElementById('customPrizeImage').value = item.image || '';
        document.getElementById('customPrizeSort').value = item.sortOrder != null ? item.sortOrder : 0;
    } catch (e) {
        console.error(e);
        alert('获取失败');
    }
}

async function saveCustomPrize() {
    const id = document.getElementById('customPrizeId').value;
    const name = document.getElementById('customPrizeName').value.trim();
    if (!name) { alert('请输入名称'); return; }
    const body = {
        name: name,
        description: document.getElementById('customPrizeDesc').value.trim() || null,
        image: document.getElementById('customPrizeImage').value.trim() || null,
        sortOrder: parseInt(document.getElementById('customPrizeSort').value, 10) || 0
    };
    try {
        const url = id ? '/api/custom-prizes/' + id : '/api/custom-prizes';
        const method = id ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.code === 0) {
            alert('保存成功');
            hideCustomPrizeForm();
            loadCustomPrizes();
            if (!id) window.luckyDrawData.customPrizesList = (window.luckyDrawData.customPrizesList || []).concat([data.data]);
        } else {
            alert('保存失败: ' + (data.message || ''));
        }
    } catch (e) {
        console.error(e);
        alert('保存失败');
    }
}

async function deleteCustomPrize(id) {
    if (!confirm('确定删除该自定义奖品？')) return;
    try {
        const res = await fetch('/api/custom-prizes/' + id, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        const data = await res.json();
        if (data.code === 0) {
            alert('删除成功');
            loadCustomPrizes();
            window.luckyDrawData.customPrizesList = (window.luckyDrawData.customPrizesList || []).filter(cp => cp.id !== id);
        } else {
            alert('删除失败: ' + (data.message || ''));
        }
    } catch (e) {
        console.error(e);
        alert('删除失败');
    }
}

// 供 PageLoader 调用；直接打开页面时也执行一次
window.LuckyDrawManagement = { init: initLuckyDrawManagement };
document.addEventListener('DOMContentLoaded', function() {
    initLuckyDrawManagement();
});