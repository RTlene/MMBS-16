/**
 * 门店管理（后台）
 */
const API_BASE = '/api/stores';
let storeList = [];
let currentPage = 1;
let totalPages = 1;
let limit = 20;
let editingStoreId = null;

function getToken() {
    return localStorage.getItem('token') || '';
}

function getHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
    };
}

window.StoreManagement = {
    init() {
        loadStores();
        document.getElementById('searchInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') searchStores();
        });
    }
};

function searchStores() {
    currentPage = 1;
    loadStores();
}

async function loadStores() {
    const search = (document.getElementById('searchInput')?.value || '').trim();
    const status = document.getElementById('statusFilter')?.value || '';
    const params = new URLSearchParams({ page: currentPage, limit });
    if (search) params.append('search', search);
    if (status) params.append('status', status);

    try {
        const res = await fetch(`${API_BASE}?${params}`, { headers: getHeaders() });
        const result = await res.json();
        if (result.code === 0 && result.data) {
            storeList = Array.isArray(result.data.list) ? result.data.list : (Array.isArray(result.data) ? result.data : []);
            totalPages = result.data.totalPages || 1;
            renderTable();
            renderPagination();
        } else {
            alert(result.message || '加载失败');
        }
    } catch (e) {
        console.error(e);
        alert('加载门店列表失败');
    }
}

function renderTable() {
    const tbody = document.getElementById('storeTableBody');
    if (!tbody) return;
    if (!storeList.length) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:#999;">暂无门店</td></tr>';
        return;
    }
    tbody.innerHTML = storeList.map(s => `
        <tr>
            <td>${s.id}</td>
            <td>${escapeHtml(s.name || '-')}</td>
            <td style="max-width:200px;">${escapeHtml(s.address || '-')}</td>
            <td>${escapeHtml(s.region || '-')}</td>
            <td>${escapeHtml(s.phone || '-')}</td>
            <td>${escapeHtml(s.businessHours || '-')}</td>
            <td>${s.sortOrder != null ? s.sortOrder : 0}</td>
            <td><span class="status-badge status-${s.status || 'active'}">${s.status === 'inactive' ? '停用' : '启用'}</span></td>
            <td>
                <button class="btn btn-primary" onclick="editStore(${s.id})">编辑</button>
                <button class="btn btn-danger" onclick="deleteStore(${s.id})">删除</button>
            </td>
        </tr>
    `).join('');
}

function escapeHtml(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function renderPagination() {
    const el = document.getElementById('pagination');
    if (!el) return;
    el.innerHTML = `
        <button ${currentPage <= 1 ? 'disabled' : ''} onclick="goPage(${currentPage - 1})">上一页</button>
        <span>第 ${currentPage} / ${totalPages || 1} 页</span>
        <button ${currentPage >= totalPages ? 'disabled' : ''} onclick="goPage(${currentPage + 1})">下一页</button>
    `;
}

function goPage(page) {
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    loadStores();
}

function showAddStoreModal() {
    editingStoreId = null;
    document.getElementById('storeModalTitle').textContent = '新增门店';
    document.getElementById('storeName').value = '';
    document.getElementById('storeAddress').value = '';
    document.getElementById('storeRegion').value = '';
    document.getElementById('storeLatitude').value = '';
    document.getElementById('storeLongitude').value = '';
    document.getElementById('storePhone').value = '';
    document.getElementById('storeBusinessHours').value = '';
    document.getElementById('storeSortOrder').value = '0';
    document.getElementById('storeStatus').value = 'active';
    document.getElementById('storeModal').classList.add('show');
}

function closeStoreModal() {
    document.getElementById('storeModal').classList.remove('show');
    editingStoreId = null;
}

async function editStore(id) {
    try {
        const res = await fetch(`${API_BASE}/${id}`, { headers: getHeaders() });
        const result = await res.json();
        if (result.code !== 0 || !result.data) {
            alert(result.message || '获取门店失败');
            return;
        }
        const s = result.data;
        editingStoreId = id;
        document.getElementById('storeModalTitle').textContent = '编辑门店';
        document.getElementById('storeName').value = s.name || '';
        document.getElementById('storeAddress').value = s.address || '';
        document.getElementById('storeRegion').value = s.region || '';
        document.getElementById('storeLatitude').value = s.latitude != null ? s.latitude : '';
        document.getElementById('storeLongitude').value = s.longitude != null ? s.longitude : '';
        document.getElementById('storePhone').value = s.phone || '';
        document.getElementById('storeBusinessHours').value = s.businessHours || '';
        document.getElementById('storeSortOrder').value = s.sortOrder != null ? s.sortOrder : 0;
        document.getElementById('storeStatus').value = s.status === 'inactive' ? 'inactive' : 'active';
        document.getElementById('storeModal').classList.add('show');
    } catch (e) {
        alert('获取门店失败');
    }
}

function saveStore() {
    const name = (document.getElementById('storeName').value || '').trim();
    if (!name) {
        alert('请填写门店名称');
        return;
    }
    const payload = {
        name,
        address: (document.getElementById('storeAddress').value || '').trim() || null,
        region: (document.getElementById('storeRegion').value || '').trim() || null,
        latitude: document.getElementById('storeLatitude').value.trim() || null,
        longitude: document.getElementById('storeLongitude').value.trim() || null,
        phone: (document.getElementById('storePhone').value || '').trim() || null,
        businessHours: (document.getElementById('storeBusinessHours').value || '').trim() || null,
        sortOrder: parseInt(document.getElementById('storeSortOrder').value, 10) || 0,
        status: document.getElementById('storeStatus').value
    };
    if (payload.latitude !== null) payload.latitude = parseFloat(payload.latitude);
    if (payload.longitude !== null) payload.longitude = parseFloat(payload.longitude);

    const url = editingStoreId ? `${API_BASE}/${editingStoreId}` : API_BASE;
    const method = editingStoreId ? 'PUT' : 'POST';

    fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(payload)
    })
        .then(res => res.json())
        .then(result => {
            if (result.code === 0) {
                alert(editingStoreId ? '保存成功' : '添加成功');
                closeStoreModal();
                loadStores();
            } else {
                alert(result.message || '保存失败');
            }
        })
        .catch(() => alert('请求失败'));
}

function deleteStore(id) {
    const store = storeList.find(s => s.id === id);
    const name = store ? (store.name || '') : id;
    if (!confirm(`确定删除门店「${name}」吗？`)) return;
    fetch(`${API_BASE}/${id}`, { method: 'DELETE', headers: getHeaders() })
        .then(res => res.json())
        .then(result => {
            if (result.code === 0) {
                alert('删除成功');
                loadStores();
            } else {
                alert(result.message || '删除失败');
            }
        })
        .catch(() => alert('请求失败'));
}
