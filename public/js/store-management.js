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
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') searchStores();
            });
        }
        loadStores();
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

// ---------- 高德：地图选点 / 地址与坐标互查（接口见 /api/amap） ----------
const AMAP_API = '/api/amap';
let amapScriptPromise = null;
let amapPickerMap = null;
let amapPickerMarker = null;
let mapPickLng = null;
let mapPickLat = null;
let amapConfigCache = null;

async function fetchAmapConfig() {
    if (amapConfigCache) return amapConfigCache;
    const res = await fetch(`${AMAP_API}/config`, { headers: getHeaders() });
    const result = await res.json();
    if (result.code !== 0 || !result.data) throw new Error(result.message || '获取地图配置失败');
    amapConfigCache = result.data;
    return amapConfigCache;
}

function loadAmapJsScript(key, securityJsCode) {
    if (amapScriptPromise) return amapScriptPromise;
    amapScriptPromise = new Promise((resolve, reject) => {
        if (window.AMap) {
            resolve(window.AMap);
            return;
        }
        if (securityJsCode) {
            window._AMapSecurityConfig = window._AMapSecurityConfig || {};
            window._AMapSecurityConfig.securityJsCode = securityJsCode;
        }
        const s = document.createElement('script');
        s.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`;
        s.onload = () => {
            if (window.AMap) resolve(window.AMap);
            else reject(new Error('AMap 未加载'));
        };
        s.onerror = () => reject(new Error('高德地图脚本加载失败，请检查 Key 是否启用 Web端(JS API)'));
        document.head.appendChild(s);
    });
    return amapScriptPromise;
}

function readLngLatFromForm() {
    const lng = parseFloat((document.getElementById('storeLongitude') || {}).value);
    const lat = parseFloat((document.getElementById('storeLatitude') || {}).value);
    return { lng, lat, ok: Number.isFinite(lng) && Number.isFinite(lat) };
}

/** 打开地图弹窗时：用主表单「区域+详细地址」预填搜索框（每次打开同步） */
function prefillMapPickerSearchInput() {
    const searchInp = document.getElementById('mapPickerSearchAddress');
    if (!searchInp) return;
    const reg = (document.getElementById('storeRegion') || {}).value || '';
    const addr = (document.getElementById('storeAddress') || {}).value || '';
    searchInp.value = [reg, addr].filter((x) => String(x).trim()).join('') || addr || '';
}

function bindMapPickerSearchEnterOnce() {
    const searchInp = document.getElementById('mapPickerSearchAddress');
    if (!searchInp || searchInp.dataset.enterBound === '1') return;
    searchInp.dataset.enterBound = '1';
    searchInp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            locateMapPickerByAddress();
        }
    });
}

/** 将标记与视野移到指定经纬度（不改变主表单，直至用户点确认选点） */
function moveMapPickerTo(lng, lat, zoom) {
    mapPickLng = lng;
    mapPickLat = lat;
    if (amapPickerMap && amapPickerMarker) {
        amapPickerMarker.setPosition([lng, lat]);
        amapPickerMap.setCenter([lng, lat]);
        if (zoom != null && Number.isFinite(zoom)) amapPickerMap.setZoom(zoom);
    }
}

/** 地图弹窗：按输入框地址调用地理编码并定位 */
async function locateMapPickerByAddress() {
    const inp = document.getElementById('mapPickerSearchAddress');
    let address = (inp && inp.value ? inp.value : '').trim();
    if (!address) {
        const reg = (document.getElementById('storeRegion') || {}).value || '';
        const addr = (document.getElementById('storeAddress') || {}).value || '';
        address = [reg, addr].filter((x) => String(x).trim()).join('') || String(addr).trim();
    }
    if (!address) {
        alert('请输入要搜索的地址');
        return;
    }
    if (!amapPickerMap || !amapPickerMarker) {
        alert('地图尚未加载完成，请稍候再试');
        return;
    }
    try {
        const params = new URLSearchParams({ address });
        const res = await fetch(`${AMAP_API}/geocode?${params}`, { headers: getHeaders() });
        const result = await res.json();
        if (result.code !== 0 || !result.data) {
            alert(result.message || '未找到该地址，请换更完整的描述');
            return;
        }
        const d = result.data;
        moveMapPickerTo(d.lng, d.lat, 17);
    } catch (e) {
        alert(e.message || '定位失败');
    }
}

async function openMapPickerModal() {
    const modal = document.getElementById('storeMapPickerModal');
    if (!modal) return;

    prefillMapPickerSearchInput();
    bindMapPickerSearchEnterOnce();

    const cur = readLngLatFromForm();
    if (cur.ok) {
        mapPickLng = cur.lng;
        mapPickLat = cur.lat;
    } else {
        mapPickLng = 116.397428;
        mapPickLat = 39.90923;
    }

    modal.classList.add('show');

    try {
        const cfg = await fetchAmapConfig();
        if (!cfg.enabled || !cfg.mapJsKey) {
            alert('未配置高德地图 Key：请在「通用设置」填写「Web 端（JS API）Key」；若地理编码失败，请另填「Web 服务 Key」或在高德控制台为 Key 同时勾选「Web服务」。');
            modal.classList.remove('show');
            return;
        }
        await loadAmapJsScript(cfg.mapJsKey, cfg.securityJsCode);
        await new Promise((r) => setTimeout(r, 80));

        if (amapPickerMap) {
            try {
                amapPickerMap.destroy();
            } catch (_) { /* ignore */ }
            amapPickerMap = null;
            amapPickerMarker = null;
        }

        const AMap = window.AMap;
        amapPickerMap = new AMap.Map('amapStorePicker', {
            zoom: 16,
            center: [mapPickLng, mapPickLat]
        });
        amapPickerMarker = new AMap.Marker({
            position: [mapPickLng, mapPickLat],
            map: amapPickerMap
        });
        amapPickerMap.on('click', (e) => {
            const ll = e.lnglat;
            mapPickLng = typeof ll.getLng === 'function' ? ll.getLng() : ll.lng;
            mapPickLat = typeof ll.getLat === 'function' ? ll.getLat() : ll.lat;
            amapPickerMarker.setPosition([mapPickLng, mapPickLat]);
        });
        bindMapPickerSearchEnterOnce();
    } catch (e) {
        console.error(e);
        alert(e.message || '打开地图失败');
        modal.classList.remove('show');
    }
}

function closeMapPickerModal() {
    const modal = document.getElementById('storeMapPickerModal');
    if (modal) modal.classList.remove('show');
    if (amapPickerMap) {
        try {
            amapPickerMap.destroy();
        } catch (_) { /* ignore */ }
        amapPickerMap = null;
        amapPickerMarker = null;
    }
}

async function applyRegeoToForm(lng, lat) {
    const params = new URLSearchParams({ lng: String(lng), lat: String(lat) });
    const res = await fetch(`${AMAP_API}/regeo?${params}`, { headers: getHeaders() });
    const result = await res.json();
    if (result.code !== 0 || !result.data) {
        throw new Error(result.message || '逆地理编码失败');
    }
    const d = result.data;
    const addrEl = document.getElementById('storeAddress');
    const regionEl = document.getElementById('storeRegion');
    const lngEl = document.getElementById('storeLongitude');
    const latEl = document.getElementById('storeLatitude');
    if (addrEl && d.address) addrEl.value = d.address;
    if (regionEl && d.region) regionEl.value = d.region;
    if (lngEl) lngEl.value = String(d.lng != null ? d.lng : lng);
    if (latEl) latEl.value = String(d.lat != null ? d.lat : lat);
}

async function confirmMapPick() {
    if (mapPickLng == null || mapPickLat == null) {
        alert('请先在地图上点击选择位置');
        return;
    }
    try {
        await applyRegeoToForm(mapPickLng, mapPickLat);
        closeMapPickerModal();
    } catch (e) {
        alert(e.message || '获取地址失败');
    }
}

async function geocodeStoreAddress() {
    const addrEl = document.getElementById('storeAddress');
    const address = (addrEl && addrEl.value ? addrEl.value : '').trim();
    if (!address) {
        alert('请先填写详细地址');
        return;
    }
    try {
        const params = new URLSearchParams({ address });
        const res = await fetch(`${AMAP_API}/geocode?${params}`, { headers: getHeaders() });
        const result = await res.json();
        if (result.code !== 0 || !result.data) {
            alert(result.message || '解析失败');
            return;
        }
        const d = result.data;
        if (addrEl && (d.address || d.formattedAddress)) addrEl.value = d.address || d.formattedAddress;
        const regionEl = document.getElementById('storeRegion');
        if (regionEl && d.region) regionEl.value = d.region;
        const lngEl = document.getElementById('storeLongitude');
        const latEl = document.getElementById('storeLatitude');
        if (lngEl) lngEl.value = String(d.lng);
        if (latEl) latEl.value = String(d.lat);
    } catch (e) {
        alert(e.message || '请求失败');
    }
}

async function regeoStoreFromInputs() {
    const { lng, lat, ok } = readLngLatFromForm();
    if (!ok) {
        alert('请先填写有效的经度、纬度');
        return;
    }
    try {
        await applyRegeoToForm(lng, lat);
        alert('已根据坐标更新地址与区域');
    } catch (e) {
        alert(e.message || '逆地理编码失败');
    }
}

window.openMapPickerModal = openMapPickerModal;
window.closeMapPickerModal = closeMapPickerModal;
window.confirmMapPick = confirmMapPick;
window.geocodeStoreAddress = geocodeStoreAddress;
window.regeoStoreFromInputs = regeoStoreFromInputs;
window.locateMapPickerByAddress = locateMapPickerByAddress;

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
