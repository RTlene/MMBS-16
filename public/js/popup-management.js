let popups = [];
let currentPage = 1;
let totalPages = 1;
let currentPopup = null;
let campaignList = [];
let campaignCurrent = null;
let campaignPreviewIndex = 0;
let customList = [];
let customCurrent = null;
const CAMPAIGN_TAB_TARGETS = [
    { value: '/pages/index/index', label: '首页 /pages/index/index' },
    { value: '/pages/category/category', label: '分类 /pages/category/category' },
    { value: '/pages/cart/cart', label: '购物车 /pages/cart/cart' },
    { value: '/pages/profile/profile', label: '我的 /pages/profile/profile' }
];
const CAMPAIGN_PAGE_PRESETS = [
    { value: '/pages/product/product?id=', label: '商品详情（需补 id）' },
    { value: '/pages/article/article?id=', label: '资讯详情（需补 id）' },
    { value: '/pages/custom-page/custom-page?slug=', label: '自定义页（需补 slug）' }
];

function authHeaders(withJson = false) {
    const h = { Authorization: `Bearer ${localStorage.getItem('token') || ''}` };
    if (withJson) h['Content-Type'] = 'application/json';
    return h;
}

function fmt(dt) {
    if (!dt) return '-';
    const d = new Date(dt);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('zh-CN');
}

function fmtLocal(dt) {
    if (!dt) return '';
    const d = new Date(dt);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day}T${hh}:${mm}`;
}

function resolveMediaUrl(rawUrl) {
    const url = String(rawUrl || '').trim();
    if (!url) return '';
    if (url.startsWith('cloud://')) {
        return `/api/storage/temp-url?fileId=${encodeURIComponent(url)}`;
    }
    if (/^https?:\/\//i.test(url) && /myqcloud\.com/i.test(url)) {
        return `/api/storage/cos-url?url=${encodeURIComponent(url)}`;
    }
    return url;
}

function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('show');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('show');
}

async function jsonRequest(url, options = {}) {
    const res = await fetch(url, options);
    return res.json();
}

function bindTabs() {
    const tabs = document.querySelectorAll('.pm-tab');
    tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            tabs.forEach((t) => t.classList.remove('active'));
            tab.classList.add('active');
            const name = tab.getAttribute('data-tab');
            document.querySelectorAll('.pm-panel').forEach((p) => p.classList.remove('active'));
            const panel = document.getElementById(`panel-${name}`);
            if (panel) panel.classList.add('active');
        });
    });
}

function bindSiteEvents() {
    const searchInput = document.getElementById('searchInput');
    const typeFilter = document.getElementById('typeFilter');
    const statusFilter = document.getElementById('statusFilter');
    const imageInput = document.getElementById('popupImage');
    if (searchInput) {
        searchInput.addEventListener('input', function onSearchInput() {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(searchPopups, 300);
        });
    }
    if (typeFilter) typeFilter.addEventListener('change', searchPopups);
    if (statusFilter) statusFilter.addEventListener('change', searchPopups);
    if (imageInput) imageInput.addEventListener('change', handleImageSelect);
    const jumpType = document.getElementById('cpJumpType');
    if (jumpType) jumpType.addEventListener('change', () => renderCampaignJumpTargetUI());
}

async function loadPopups() {
    const params = new URLSearchParams({
        page: currentPage,
        limit: 10,
        search: (document.getElementById('searchInput') || {}).value || '',
        type: (document.getElementById('typeFilter') || {}).value || '',
        status: (document.getElementById('statusFilter') || {}).value || ''
    });
    const result = await jsonRequest(`/api/popups?${params.toString()}`, { headers: authHeaders() });
    if (result.code !== 0) return;
    popups = result.data.popups || [];
    totalPages = result.data.totalPages || 1;
    const tbody = document.getElementById('popupTableBody');
    if (!tbody) return;
    tbody.innerHTML = popups.map((item) => `
        <tr>
            <td>${item.id}</td>
            <td>${item.name || '-'}</td>
            <td>${({ ad: '广告', notice: '通知', promotion: '促销' }[item.type] || item.type || '-')}</td>
            <td><span class="pm-badge ${item.status === 'active' ? 'pm-badge-active' : 'pm-badge-inactive'}">${item.status === 'active' ? '有效' : '无效'}</span></td>
            <td>${item.imageUrl ? `<img class="pm-img" src="${resolveMediaUrl(item.imageUrl)}">` : '-'}</td>
            <td>${({ once: '仅一次', daily: '每日一次', session: '每次会话', always: '总是显示' }[item.frequency] || item.frequency || '-')}</td>
            <td>${fmt(item.startTime)}</td>
            <td>${fmt(item.endTime)}</td>
            <td>
                <button class="btn btn-primary" onclick="editPopup(${item.id})">编辑</button>
                <button class="btn btn-danger" onclick="deletePopup(${item.id})">删除</button>
            </td>
        </tr>
    `).join('');
    renderPagination();
}

function renderPagination() {
    const p = document.getElementById('pagination');
    if (!p) return;
    p.innerHTML = '';
    const mk = (txt, disabled, fn) => {
        const b = document.createElement('button');
        b.className = 'btn btn-light';
        b.textContent = txt;
        b.disabled = !!disabled;
        b.onclick = fn;
        b.style.marginRight = '6px';
        return b;
    };
    p.appendChild(mk('上一页', currentPage <= 1, () => { currentPage--; loadPopups(); }));
    p.appendChild(mk(`第 ${currentPage}/${totalPages} 页`, true, () => {}));
    p.appendChild(mk('下一页', currentPage >= totalPages, () => { currentPage++; loadPopups(); }));
}

function resetImagePreview() {
    const a = document.getElementById('imagePreview');
    const b = document.getElementById('popupPreview');
    const c = document.getElementById('noPreview');
    if (a) a.style.display = 'none';
    if (b) b.style.display = 'none';
    if (c) c.style.display = 'block';
    const input = document.getElementById('popupImage');
    if (input) input.value = '';
}

function handleImageSelect(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const src = ev.target.result;
        const a = document.getElementById('imagePreview');
        const b = document.getElementById('popupPreview');
        const c = document.getElementById('noPreview');
        if (a) { a.src = src; a.style.display = 'block'; }
        if (b) { b.src = src; b.style.display = 'block'; }
        if (c) c.style.display = 'none';
    };
    reader.readAsDataURL(file);
}

function showAddPopupModal() {
    currentPopup = null;
    document.getElementById('popupModalTitle').textContent = '新增站内弹窗';
    document.getElementById('popupForm').reset();
    resetImagePreview();
    openModal('popupModal');
}

async function editPopup(id) {
    const result = await jsonRequest(`/api/popups/${id}`, { headers: authHeaders() });
    if (result.code !== 0) return alert(result.message || '获取失败');
    currentPopup = result.data;
    document.getElementById('popupModalTitle').textContent = '编辑站内弹窗';
    document.getElementById('popupName').value = currentPopup.name || '';
    document.getElementById('popupType').value = currentPopup.type || 'ad';
    document.getElementById('popupFrequency').value = currentPopup.frequency || 'once';
    document.getElementById('popupStatus').value = currentPopup.status || 'active';
    document.getElementById('popupStartTime').value = fmtLocal(currentPopup.startTime);
    document.getElementById('popupEndTime').value = fmtLocal(currentPopup.endTime);
    document.getElementById('popupLink').value = currentPopup.link || '';
    const cond = currentPopup.conditions || {};
    document.getElementById('showToMembers').checked = cond.showToMembers !== false;
    document.getElementById('showToGuests').checked = cond.showToGuests !== false;
    document.getElementById('showOnMobile').checked = cond.showOnMobile !== false;
    document.getElementById('showOnDesktop').checked = cond.showOnDesktop !== false;
    if (currentPopup.imageUrl) {
        document.getElementById('imagePreview').src = currentPopup.imageUrl;
        document.getElementById('popupPreview').src = currentPopup.imageUrl;
        document.getElementById('imagePreview').style.display = 'block';
        document.getElementById('popupPreview').style.display = 'block';
        document.getElementById('noPreview').style.display = 'none';
    } else {
        resetImagePreview();
    }
    openModal('popupModal');
}

async function savePopup() {
    const formData = new FormData();
    formData.append('name', document.getElementById('popupName').value.trim());
    formData.append('type', document.getElementById('popupType').value);
    formData.append('frequency', document.getElementById('popupFrequency').value);
    formData.append('startTime', document.getElementById('popupStartTime').value || '');
    formData.append('endTime', document.getElementById('popupEndTime').value || '');
    formData.append('link', document.getElementById('popupLink').value || '');
    formData.append('status', document.getElementById('popupStatus').value);
    formData.append('conditions', JSON.stringify({
        showToMembers: document.getElementById('showToMembers').checked,
        showToGuests: document.getElementById('showToGuests').checked,
        showOnMobile: document.getElementById('showOnMobile').checked,
        showOnDesktop: document.getElementById('showOnDesktop').checked
    }));
    const file = document.getElementById('popupImage').files[0];
    if (file) formData.append('image', file);
    if (!formData.get('name')) return alert('弹窗名称不能为空');
    const isEdit = !!(currentPopup && currentPopup.id);
    const result = await jsonRequest(isEdit ? `/api/popups/${currentPopup.id}` : '/api/popups', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
        body: formData
    });
    if (result.code !== 0) return alert(result.message || '保存失败');
    closePopupModal();
    loadPopups();
}

async function deletePopup(id) {
    if (!confirm('确认删除该站内弹窗吗？')) return;
    const result = await jsonRequest(`/api/popups/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (result.code !== 0) return alert(result.message || '删除失败');
    loadPopups();
}

function closePopupModal() {
    closeModal('popupModal');
    currentPopup = null;
    resetImagePreview();
}

function searchPopups() {
    currentPage = 1;
    loadPopups();
}

async function loadCampaign() {
    const q = new URLSearchParams({
        page: 1,
        limit: 100,
        search: (document.getElementById('campaignPopupSearch') || {}).value || '',
        status: (document.getElementById('campaignPopupStatus') || {}).value || ''
    });
    const result = await jsonRequest(`/api/campaign-popups?${q.toString()}`, { headers: authHeaders() });
    if (result.code !== 0) return;
    campaignList = (result.data && result.data.list) || [];
    const tbody = document.getElementById('campaignPopupTableBody');
    if (!tbody) return;
    tbody.innerHTML = campaignList.map((item) => {
        const image = Array.isArray(item.imageUrls) && item.imageUrls.length ? item.imageUrls[0] : '';
        return `
            <tr>
                <td>${item.id}</td>
                <td>${item.name || '-'}</td>
                <td>${item.status || '-'}</td>
                <td>${item.priority || 0}</td>
                <td>${image ? `<img src="${resolveMediaUrl(image)}" class="pm-img">` : '-'}</td>
                <td>${fmt(item.startTime)} ~ ${fmt(item.endTime)}</td>
                <td>${item.jumpType || 'none'} ${item.jumpTarget ? `(${item.jumpTarget})` : ''}</td>
                <td>
                    <button class="btn btn-light" onclick="PopupManagement.moveCampaignUp(${item.id})">上移</button>
                    <button class="btn btn-light" onclick="PopupManagement.moveCampaignDown(${item.id})">下移</button>
                    <button class="btn btn-warning" onclick="PopupManagement.moveCampaignTop(${item.id})">置顶</button>
                    <button class="btn btn-primary" onclick="PopupManagement.editCampaign(${item.id})">编辑</button>
                    <button class="btn btn-danger" onclick="PopupManagement.deleteCampaign(${item.id})">删除</button>
                </td>
            </tr>
        `;
    }).join('');
}

function fillCampaignForm(data = {}) {
    document.getElementById('cpName').value = data.name || '';
    document.getElementById('cpTitle').value = data.title || '';
    document.getElementById('cpStatus').value = data.status || 'draft';
    document.getElementById('cpPriority').value = data.priority || 0;
    document.getElementById('cpStartTime').value = fmtLocal(data.startTime);
    document.getElementById('cpEndTime').value = fmtLocal(data.endTime);
    document.getElementById('cpJumpType').value = data.jumpType || 'none';
    renderCampaignJumpTargetUI(data.jumpTarget || '');
    document.getElementById('cpShowOnce').checked = data.showOncePerCycle !== false;
    document.getElementById('cpImageUrls').value = Array.isArray(data.imageUrls) ? data.imageUrls.join('\n') : '';
}

function readCampaignForm() {
    const jumpType = document.getElementById('cpJumpType').value;
    const inputEl = document.getElementById('cpJumpTargetInput');
    const selectEl = document.getElementById('cpJumpTargetSelect');
    const jumpTarget = (selectEl && selectEl.style.display !== 'none' ? selectEl.value : (inputEl ? inputEl.value : '')).trim();
    return {
        name: document.getElementById('cpName').value.trim(),
        title: document.getElementById('cpTitle').value.trim(),
        status: document.getElementById('cpStatus').value,
        priority: Number(document.getElementById('cpPriority').value || 0),
        startTime: document.getElementById('cpStartTime').value || null,
        endTime: document.getElementById('cpEndTime').value || null,
        jumpType,
        jumpTarget,
        showOncePerCycle: !!document.getElementById('cpShowOnce').checked,
        imageUrls: document.getElementById('cpImageUrls').value.split('\n').map((s) => s.trim()).filter(Boolean)
    };
}

function renderCampaignJumpTargetUI(currentTarget = '') {
    const type = (document.getElementById('cpJumpType') || {}).value || 'none';
    const inputEl = document.getElementById('cpJumpTargetInput');
    const selectEl = document.getElementById('cpJumpTargetSelect');
    const hintEl = document.getElementById('cpJumpTargetHint');
    if (!inputEl || !selectEl || !hintEl) return;

    inputEl.style.display = 'none';
    selectEl.style.display = 'none';
    inputEl.value = currentTarget || inputEl.value || '';
    selectEl.innerHTML = '';

    if (type === 'none') {
        hintEl.textContent = '当前不跳转，活动仅展示不响应点击。';
        return;
    }

    if (type === 'tab') {
        selectEl.style.display = '';
        selectEl.innerHTML = CAMPAIGN_TAB_TARGETS.map((x) => `<option value="${x.value}">${x.label}</option>`).join('');
        const fallback = CAMPAIGN_TAB_TARGETS[0] ? CAMPAIGN_TAB_TARGETS[0].value : '';
        selectEl.value = currentTarget || selectEl.value || fallback;
        hintEl.textContent = '点击海报后切换到对应 tab 页面。';
        return;
    }

    if (type === 'custom_page') {
        selectEl.style.display = '';
        const list = customList.map((x) => ({ value: x.slug || '', label: `${x.name || '未命名'}（${x.slug || '-'}）` })).filter((x) => x.value);
        if (!list.length) {
            selectEl.innerHTML = '<option value="">暂无可选自定义页，请先在“自定义页面”页创建并发布</option>';
            selectEl.value = '';
            hintEl.textContent = '请选择自定义页 slug；未创建时会显示空。';
            return;
        }
        selectEl.innerHTML = list.map((x) => `<option value="${x.value}">${x.label}</option>`).join('');
        selectEl.value = currentTarget || selectEl.value || list[0].value;
        hintEl.textContent = '点击海报后跳转到该自定义页。';
        return;
    }

    if (type === 'miniapp_page') {
        inputEl.style.display = '';
        inputEl.placeholder = '/pages/product/product?id=16';
        if (!inputEl.value && CAMPAIGN_PAGE_PRESETS[0]) inputEl.value = CAMPAIGN_PAGE_PRESETS[0].value;
        hintEl.textContent = `示例：${CAMPAIGN_PAGE_PRESETS.map((x) => x.value).join(' / ')}`;
        return;
    }

    if (type === 'webview') {
        inputEl.style.display = '';
        inputEl.placeholder = 'https://example.com/activity';
        hintEl.textContent = '请输入完整链接（https://...），点击海报后复制链接。';
        return;
    }
}

async function uploadImageToStorage(file) {
    const fd = new FormData();
    fd.append('image', file);
    const result = await jsonRequest('/api/popups/upload-image', {
        method: 'POST',
        headers: authHeaders(),
        body: fd
    });
    if (!result || result.code !== 0 || !result.data || !result.data.url) {
        throw new Error((result && result.message) || '上传失败');
    }
    return result.data.url;
}

async function loadCustom() {
    const q = new URLSearchParams({
        page: 1,
        limit: 100,
        search: (document.getElementById('customPageSearch') || {}).value || '',
        status: (document.getElementById('customPageStatus') || {}).value || ''
    });
    const result = await jsonRequest(`/api/custom-pages?${q.toString()}`, { headers: authHeaders() });
    if (result.code !== 0) return;
    customList = (result.data && result.data.list) || [];
    renderCampaignJumpTargetUI();
    const tbody = document.getElementById('customPageTableBody');
    if (!tbody) return;
    tbody.innerHTML = customList.map((item) => `
        <tr>
            <td>${item.id}</td>
            <td>${item.name || '-'}</td>
            <td>${item.slug || '-'}</td>
            <td>${item.status || '-'}</td>
            <td>${item.enableShare === false ? '关闭' : '开启'} ${item.shareTitle ? `| ${item.shareTitle}` : ''}</td>
            <td>
                <button class="btn btn-primary" onclick="PopupManagement.editCustom(${item.id})">编辑</button>
                <button class="btn btn-danger" onclick="PopupManagement.deleteCustom(${item.id})">删除</button>
            </td>
        </tr>
    `).join('');
}

function fillCustomForm(data = {}) {
    document.getElementById('cpgName').value = data.name || '';
    document.getElementById('cpgSlug').value = data.slug || '';
    document.getElementById('cpgTitle').value = data.title || '';
    document.getElementById('cpgStatus').value = data.status || 'draft';
    document.getElementById('cpgStartTime').value = fmtLocal(data.startTime);
    document.getElementById('cpgEndTime').value = fmtLocal(data.endTime);
    document.getElementById('cpgEnableShare').checked = data.enableShare !== false;
    document.getElementById('cpgShareTitle').value = data.shareTitle || '';
    document.getElementById('cpgShareImage').value = data.shareImage || '';
    document.getElementById('cpgSchemaJson').value = JSON.stringify(data.schemaJson || [], null, 2);
}

function readCustomForm() {
    let schemaJson = [];
    try { schemaJson = JSON.parse(document.getElementById('cpgSchemaJson').value || '[]'); } catch (_) {}
    return {
        name: document.getElementById('cpgName').value.trim(),
        slug: document.getElementById('cpgSlug').value.trim(),
        title: document.getElementById('cpgTitle').value.trim(),
        status: document.getElementById('cpgStatus').value,
        startTime: document.getElementById('cpgStartTime').value || null,
        endTime: document.getElementById('cpgEndTime').value || null,
        enableShare: !!document.getElementById('cpgEnableShare').checked,
        shareTitle: document.getElementById('cpgShareTitle').value.trim(),
        shareImage: document.getElementById('cpgShareImage').value.trim(),
        schemaJson
    };
}

function initPopupManagement() {
    bindTabs();
    bindSiteEvents();
    loadPopups();
    loadCampaign();
    loadCustom();
}

window.PopupManagement = {
    init: initPopupManagement,
    loadCampaign,
    openCampaignCreate() {
        campaignCurrent = null;
        fillCampaignForm({});
        openModal('campaignPopupModal');
    },
    async editCampaign(id) {
        const result = await jsonRequest(`/api/campaign-popups/${id}`, { headers: authHeaders() });
        if (result.code !== 0) return alert(result.message || '获取失败');
        campaignCurrent = result.data;
        fillCampaignForm(result.data || {});
        openModal('campaignPopupModal');
    },
    async saveCampaign() {
        const payload = readCampaignForm();
        if (!payload.name) return alert('活动名称不能为空');
        const isEdit = !!(campaignCurrent && campaignCurrent.id);
        const result = await jsonRequest(isEdit ? `/api/campaign-popups/${campaignCurrent.id}` : '/api/campaign-popups', {
            method: isEdit ? 'PUT' : 'POST',
            headers: authHeaders(true),
            body: JSON.stringify(payload)
        });
        if (result.code !== 0) return alert(result.message || '保存失败');
        this.closeCampaignModal();
        loadCampaign();
    },
    async deleteCampaign(id) {
        if (!confirm('确认删除该活动吗？')) return;
        const result = await jsonRequest(`/api/campaign-popups/${id}`, { method: 'DELETE', headers: authHeaders() });
        if (result.code !== 0) return alert(result.message || '删除失败');
        loadCampaign();
    },
    closeCampaignModal() {
        closeModal('campaignPopupModal');
        campaignCurrent = null;
    },
    async moveCampaignUp(id) {
        const idx = campaignList.findIndex((x) => Number(x.id) === Number(id));
        if (idx <= 0) return;
        const a = campaignList[idx];
        const b = campaignList[idx - 1];
        await jsonRequest(`/api/campaign-popups/${a.id}`, { method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ priority: b.priority || 0 }) });
        await jsonRequest(`/api/campaign-popups/${b.id}`, { method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ priority: a.priority || 0 }) });
        loadCampaign();
    },
    async moveCampaignDown(id) {
        const idx = campaignList.findIndex((x) => Number(x.id) === Number(id));
        if (idx < 0 || idx >= campaignList.length - 1) return;
        const a = campaignList[idx];
        const b = campaignList[idx + 1];
        await jsonRequest(`/api/campaign-popups/${a.id}`, { method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ priority: b.priority || 0 }) });
        await jsonRequest(`/api/campaign-popups/${b.id}`, { method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ priority: a.priority || 0 }) });
        loadCampaign();
    },
    async moveCampaignTop(id) {
        const maxP = campaignList.reduce((m, x) => Math.max(m, Number(x.priority || 0)), 0);
        const result = await jsonRequest(`/api/campaign-popups/${id}`, { method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ priority: maxP + 10 }) });
        if (result.code !== 0) return alert(result.message || '置顶失败');
        loadCampaign();
    },
    previewCampaign() {
        if (!campaignList.length) return alert('暂无活动可预览');
        campaignPreviewIndex = 0;
        this.renderCampaignPreview();
        openModal('campaignPreviewModal');
    },
    renderCampaignPreview() {
        if (!campaignList.length) return;
        const item = campaignList[campaignPreviewIndex];
        const image = Array.isArray(item.imageUrls) && item.imageUrls.length ? item.imageUrls[0] : '';
        document.getElementById('campaignPreviewImage').src = resolveMediaUrl(image);
        document.getElementById('campaignPreviewTitle').textContent = item.title || item.name || '';
        document.getElementById('campaignPreviewMeta').textContent = `第 ${campaignPreviewIndex + 1}/${campaignList.length} 项 | 优先级 ${item.priority || 0}`;
    },
    campaignPreviewPrev() {
        if (!campaignList.length) return;
        campaignPreviewIndex = (campaignPreviewIndex - 1 + campaignList.length) % campaignList.length;
        this.renderCampaignPreview();
    },
    campaignPreviewNext() {
        if (!campaignList.length) return;
        campaignPreviewIndex = (campaignPreviewIndex + 1) % campaignList.length;
        this.renderCampaignPreview();
    },
    closeCampaignPreview() {
        closeModal('campaignPreviewModal');
    },
    loadCustom,
    openCustomCreate() {
        customCurrent = null;
        fillCustomForm({});
        openModal('customPageModal');
    },
    async editCustom(id) {
        const result = await jsonRequest(`/api/custom-pages/${id}`, { headers: authHeaders() });
        if (result.code !== 0) return alert(result.message || '获取失败');
        customCurrent = result.data;
        fillCustomForm(result.data || {});
        openModal('customPageModal');
    },
    async saveCustom() {
        const payload = readCustomForm();
        if (!payload.name) return alert('页面名称不能为空');
        if (!payload.slug) return alert('slug 不能为空');
        const isEdit = !!(customCurrent && customCurrent.id);
        const result = await jsonRequest(isEdit ? `/api/custom-pages/${customCurrent.id}` : '/api/custom-pages', {
            method: isEdit ? 'PUT' : 'POST',
            headers: authHeaders(true),
            body: JSON.stringify(payload)
        });
        if (result.code !== 0) return alert(result.message || '保存失败');
        this.closeCustomModal();
        loadCustom();
    },
    async deleteCustom(id) {
        if (!confirm('确认删除该页面吗？')) return;
        const result = await jsonRequest(`/api/custom-pages/${id}`, { method: 'DELETE', headers: authHeaders() });
        if (result.code !== 0) return alert(result.message || '删除失败');
        loadCustom();
    },
    closeCustomModal() {
        closeModal('customPageModal');
        customCurrent = null;
    },
    async uploadCampaignImages() {
        const input = document.getElementById('cpImageFiles');
        const files = input && input.files ? Array.from(input.files) : [];
        if (!files.length) return alert('请先选择图片');
        const uploaded = [];
        for (const file of files) {
            try {
                const url = await uploadImageToStorage(file);
                uploaded.push(url);
            } catch (e) {
                alert(`图片上传失败: ${file.name}，原因：${e.message || '未知错误'}`);
                return;
            }
        }
        const textarea = document.getElementById('cpImageUrls');
        const existed = (textarea.value || '').split('\n').map((s) => s.trim()).filter(Boolean);
        textarea.value = [...existed, ...uploaded].join('\n');
        if (input) input.value = '';
        alert(`上传成功：${uploaded.length} 张`);
    },
    async uploadCustomShareImage() {
        const input = document.getElementById('cpgShareImageFile');
        const file = input && input.files ? input.files[0] : null;
        if (!file) return alert('请先选择图片');
        try {
            const url = await uploadImageToStorage(file);
            document.getElementById('cpgShareImage').value = url;
            if (input) input.value = '';
            alert('分享图上传成功');
        } catch (e) {
            alert(`上传失败：${e.message || '未知错误'}`);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    initPopupManagement();
});