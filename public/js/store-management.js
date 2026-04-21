/**
 * 门店管理（后台）
 */
const API_BASE = '/api/stores';
let storeList = [];
let currentPage = 1;
let totalPages = 1;
let limit = 20;
let editingStoreId = null;
let managerMembers = [];

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
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') searchStores();
            });
        }
        const managerSearchEl = document.getElementById('storeManagerSearch');
        if (managerSearchEl) {
            managerSearchEl.addEventListener('input', () => {
                const current = (document.getElementById('storeManagerMemberId') || {}).value || '';
                renderManagerMemberOptions(managerSearchEl.value || '', current);
            });
        }
        Promise.all([loadManagerMembers(), loadStores()]);
    }
};

function searchStores() {
    currentPage = 1;
    loadStores();
}

async function loadStores() {
    const searchEl = document.getElementById('searchInput');
    const statusEl = document.getElementById('statusFilter');
    const search = (searchEl && searchEl.value ? searchEl.value : '').trim();
    const status = (statusEl && statusEl.value) ? statusEl.value : '';
    const params = new URLSearchParams({ page: currentPage, limit });
    if (search) params.append('search', search);
    if (status) params.append('status', status);

    try {
        const res = await fetch(`${API_BASE}?${params}`, { headers: getHeaders() });
        if (!res.ok) {
            const text = await res.text();
            try {
                const err = JSON.parse(text);
                alert(err.message || '加载失败');
            } catch (_) {
                alert('加载门店列表失败：' + res.status);
            }
            return;
        }
        const result = await res.json();
        if (result.code === 0 && result.data) {
            storeList = Array.isArray(result.data.list) ? result.data.list : (Array.isArray(result.data) ? result.data : []);
            totalPages = (result.data.totalPages != null) ? result.data.totalPages : 1;
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

// 兼容 HTML 内联 onclick（避免函数不在全局作用域导致报错）
window.searchStores = searchStores;
window.showAddStoreModal = showAddStoreModal;
window.closeStoreModal = closeStoreModal;
window.saveStore = saveStore;
window.editStore = editStore;
window.deleteStore = deleteStore;
window.goPage = goPage;

function renderTable() {
    const tbody = document.getElementById('storeTableBody');
    if (!tbody) return;
    if (!storeList.length) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:40px;color:#999;">暂无门店</td></tr>';
        return;
    }
    tbody.innerHTML = storeList.map(s => `
        <tr>
            <td>${s.id}</td>
            <td>${escapeHtml(s.name || '-')}</td>
            <td style="max-width:200px;">${escapeHtml(s.address || '-')}</td>
            <td>${escapeHtml(s.region || '-')}</td>
            <td>${escapeHtml(s.phone || '-')}</td>
            <td>${renderManagerMemberCell(s)}</td>
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

function renderManagerMemberCell(store) {
    if (!store) return '-';
    const mm = store.managerMember;
    if (mm && (mm.nickname || mm.memberCode || mm.id)) {
        const code = mm.memberCode || mm.id;
        return `${escapeHtml(mm.nickname || '未命名会员')} (${escapeHtml(String(code))})`;
    }
    if (store.managerMemberId) return `会员ID ${escapeHtml(String(store.managerMemberId))}`;
    return '-';
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
    document.getElementById('storeManagerSearch').value = '';
    document.getElementById('storeBusinessHours').value = '';
    document.getElementById('storeManagerMemberId').value = '';
    renderManagerMemberOptions('', '');
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
        document.getElementById('storeManagerSearch').value = '';
        renderManagerMemberOptions('', s.managerMemberId || '');
        if (s.managerMemberId && !isManagerMemberInOptions(s.managerMemberId)) {
            appendHistoricalManagerOption(s);
        }
        document.getElementById('storeManagerMemberId').value = s.managerMemberId != null ? String(s.managerMemberId) : '';
        document.getElementById('storeBusinessHours').value = s.businessHours || '';
        document.getElementById('storeSortOrder').value = s.sortOrder != null ? s.sortOrder : 0;
        document.getElementById('storeStatus').value = s.status === 'inactive' ? 'inactive' : 'active';
        document.getElementById('storeModal').classList.add('show');
    } catch (e) {
        alert('获取门店失败');
    }
}

function saveStore() {
    const nameEl = document.getElementById('storeName');
    const name = (nameEl && nameEl.value ? nameEl.value : '').trim();
    if (!name) {
        alert('请填写门店名称');
        return;
    }
    const getVal = (id) => { const el = document.getElementById(id); return el ? (el.value || '').trim() : ''; };
    const payload = {
        name,
        address: getVal('storeAddress') || null,
        region: getVal('storeRegion') || null,
        latitude: getVal('storeLatitude') || null,
        longitude: getVal('storeLongitude') || null,
        phone: getVal('storePhone') || null,
        managerMemberId: getVal('storeManagerMemberId') || null,
        businessHours: getVal('storeBusinessHours') || null,
        sortOrder: parseInt(getVal('storeSortOrder'), 10) || 0,
        status: (document.getElementById('storeStatus') || {}).value || 'active'
    };
    if (payload.latitude !== null && payload.latitude !== '') payload.latitude = parseFloat(payload.latitude);
    else payload.latitude = null;
    if (payload.longitude !== null && payload.longitude !== '') payload.longitude = parseFloat(payload.longitude);
    else payload.longitude = null;

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

async function loadManagerMembers() {
    try {
        const res = await fetch('/api/members?limit=1000&status=active', { headers: getHeaders() });
        const result = await res.json();
        if (result.code === 0 && result.data && Array.isArray(result.data.members)) {
            managerMembers = result.data.members.map((m) => ({
                id: m.id,
                nickname: m.nickname || '',
                memberCode: m.memberCode || '',
                phone: m.phone || ''
            }));
        } else {
            managerMembers = [];
        }
    } catch (e) {
        console.warn('加载门店管理者会员列表失败:', e);
        managerMembers = [];
    }
    renderManagerMemberOptions('', (document.getElementById('storeManagerMemberId') || {}).value || '');
}

function renderManagerMemberOptions(keyword, selectedId) {
    const sel = document.getElementById('storeManagerMemberId');
    if (!sel) return;
    const kw = String(keyword || '').trim().toLowerCase();
    const selected = selectedId == null ? '' : String(selectedId);
    const list = !kw
        ? managerMembers
        : managerMembers.filter((m) => {
            const text = `${m.nickname} ${m.memberCode} ${m.phone}`.toLowerCase();
            return text.includes(kw);
        });
    sel.innerHTML = '<option value="">请选择门店管理者（可不选）</option>';
    list.forEach((m) => {
        const opt = document.createElement('option');
        opt.value = String(m.id);
        const code = m.memberCode || m.id;
        opt.textContent = `${m.nickname || '未命名会员'} (${code})`;
        sel.appendChild(opt);
    });
    if (selected && [...sel.options].some((o) => o.value === selected)) sel.value = selected;
}

function isManagerMemberInOptions(memberId) {
    const sid = String(memberId || '');
    return managerMembers.some((m) => String(m.id) === sid);
}

function appendHistoricalManagerOption(store) {
    const sel = document.getElementById('storeManagerMemberId');
    if (!sel || !store || !store.managerMemberId) return;
    const sid = String(store.managerMemberId);
    if ([...sel.options].some((o) => o.value === sid)) return;
    const mm = store.managerMember || {};
    const label = mm.nickname
        ? `${mm.nickname} (${mm.memberCode || sid})（历史/停用）`
        : `${sid}（历史管理者）`;
    const opt = document.createElement('option');
    opt.value = sid;
    opt.textContent = label;
    sel.appendChild(opt);
}
