let _customPageCurrent = null;
let _hotspots = [];

async function customPageRequest(url, options = {}) {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token') || ''}`
    },
    ...options
  });
  return res.json();
}

async function uploadImageToStorage(file) {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch('/api/popups/upload-image', {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
    body: fd
  });
  const result = await res.json();
  if (!result || result.code !== 0 || !result.data || !result.data.url) {
    throw new Error((result && result.message) || '上传失败');
  }
  return result.data.url;
}

function customPageModal(show) {
  const el = document.getElementById('customPageModal');
  if (el) el.style.display = show ? 'block' : 'none';
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

function parseActivitySchema(schemaJson) {
  let schema = schemaJson;
  if (typeof schema === 'string') {
    try { schema = JSON.parse(schema); } catch (_) { schema = {}; }
  }
  if (Array.isArray(schema)) {
    const poster = (schema.find((x) => x && (x.type === 'image' || x.image || x.imageUrl)) || {});
    return {
      posterUrl: poster.url || poster.image || poster.imageUrl || '',
      background: '',
      hotspots: []
    };
  }
  if (!schema || typeof schema !== 'object') return { posterUrl: '', background: '', hotspots: [] };
  return {
    posterUrl: String(schema.posterUrl || '').trim(),
    background: String(schema.background || '').trim(),
    hotspots: Array.isArray(schema.hotspots) ? schema.hotspots : []
  };
}

function renderHotspotsTable() {
  const tbody = document.getElementById('cpgHotspotTableBody');
  if (!tbody) return;
  tbody.innerHTML = _hotspots.map((it, idx) => `
    <tr>
      <td><input id="hs-name-${idx}" value="${it.name || ''}" placeholder="区域名称" /></td>
      <td><input id="hs-x-${idx}" type="number" step="0.1" value="${Number(it.x || 0)}" /></td>
      <td><input id="hs-y-${idx}" type="number" step="0.1" value="${Number(it.y || 0)}" /></td>
      <td><input id="hs-w-${idx}" type="number" step="0.1" value="${Number(it.w || 0)}" /></td>
      <td><input id="hs-h-${idx}" type="number" step="0.1" value="${Number(it.h || 0)}" /></td>
      <td>
        <select id="hs-jump-type-${idx}">
          <option value="none" ${it.jumpType === 'none' ? 'selected' : ''}>不跳转</option>
          <option value="custom_page" ${it.jumpType === 'custom_page' ? 'selected' : ''}>自定义页</option>
          <option value="miniapp_page" ${it.jumpType === 'miniapp_page' ? 'selected' : ''}>小程序页</option>
          <option value="tab" ${it.jumpType === 'tab' ? 'selected' : ''}>Tab页</option>
          <option value="webview" ${it.jumpType === 'webview' ? 'selected' : ''}>Web链接</option>
        </select>
      </td>
      <td><input id="hs-jump-target-${idx}" value="${it.jumpTarget || ''}" placeholder="如 /pages/product/product?id=16" /></td>
      <td><button class="btn btn-danger" onclick="CustomPageManagement.removeHotspot(${idx})">删除</button></td>
    </tr>
  `).join('');
}

function collectHotspotsFromTable() {
  const list = [];
  for (let i = 0; i < _hotspots.length; i += 1) {
    const x = Number((document.getElementById(`hs-x-${i}`) || {}).value || 0);
    const y = Number((document.getElementById(`hs-y-${i}`) || {}).value || 0);
    const w = Number((document.getElementById(`hs-w-${i}`) || {}).value || 0);
    const h = Number((document.getElementById(`hs-h-${i}`) || {}).value || 0);
    list.push({
      name: ((document.getElementById(`hs-name-${i}`) || {}).value || '').trim(),
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
      w: Number.isFinite(w) ? w : 0,
      h: Number.isFinite(h) ? h : 0,
      jumpType: ((document.getElementById(`hs-jump-type-${i}`) || {}).value || 'none').trim(),
      jumpTarget: ((document.getElementById(`hs-jump-target-${i}`) || {}).value || '').trim()
    });
  }
  return list;
}

function fillCustomPageForm(data = {}) {
  const schema = parseActivitySchema(data.schemaJson);
  document.getElementById('cpgName').value = data.name || '';
  document.getElementById('cpgSlug').value = data.slug || '';
  document.getElementById('cpgTitle').value = data.title || '';
  document.getElementById('cpgStatus').value = data.status || 'draft';
  document.getElementById('cpgStartTime').value = fmtLocal(data.startTime);
  document.getElementById('cpgEndTime').value = fmtLocal(data.endTime);
  document.getElementById('cpgEnableShare').checked = data.enableShare !== false;
  document.getElementById('cpgShareTitle').value = data.shareTitle || '';
  document.getElementById('cpgShareImage').value = data.shareImage || '';
  document.getElementById('cpgPosterUrl').value = schema.posterUrl || data.shareImage || '';
  document.getElementById('cpgBackground').value = schema.background || '#f8fafc';
  _hotspots = Array.isArray(schema.hotspots) ? schema.hotspots.slice(0, 50) : [];
  renderHotspotsTable();
}

function readCustomPageForm() {
  const hotspots = collectHotspotsFromTable();
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
    schemaJson: {
      type: 'activity_poster',
      posterUrl: document.getElementById('cpgPosterUrl').value.trim(),
      background: document.getElementById('cpgBackground').value.trim(),
      hotspots
    }
  };
}

async function loadCustomPages() {
  const search = (document.getElementById('customPageSearch') || {}).value || '';
  const status = (document.getElementById('customPageStatus') || {}).value || '';
  const q = new URLSearchParams({ search, status, page: 1, limit: 100 });
  const result = await customPageRequest(`/api/custom-pages?${q.toString()}`);
  const tbody = document.getElementById('customPageTableBody');
  if (!tbody) return;
  const list = (result && result.code === 0 && result.data && result.data.list) || [];
  tbody.innerHTML = list.map((item) => {
    const schema = parseActivitySchema(item.schemaJson);
    const img = schema.posterUrl || item.shareImage || '';
    return `
      <tr>
        <td>${item.id}</td>
        <td>${item.name || '-'}</td>
        <td>${item.slug || '-'}</td>
        <td>${item.status || '-'}</td>
        <td>${img ? `<img src="${img}" style="width:96px;height:56px;object-fit:cover;border-radius:6px;">` : '-'}</td>
        <td>${Array.isArray(schema.hotspots) ? schema.hotspots.length : 0}</td>
        <td>${item.enableShare === false ? '关闭' : '开启'}</td>
        <td>
          <button class="btn btn-primary" onclick="CustomPageManagement.edit(${item.id})">编辑</button>
          <button class="btn btn-danger" onclick="CustomPageManagement.remove(${item.id})">删除</button>
        </td>
      </tr>
    `;
  }).join('');
}

window.CustomPageManagement = {
  init: loadCustomPages,
  load: loadCustomPages,
  addHotspot() {
    _hotspots.push({ name: '', x: 10, y: 10, w: 30, h: 12, jumpType: 'none', jumpTarget: '' });
    renderHotspotsTable();
  },
  removeHotspot(index) {
    _hotspots.splice(index, 1);
    renderHotspotsTable();
  },
  async uploadShareImage() {
    const file = (document.getElementById('cpgShareImageFile') || {}).files?.[0];
    if (!file) return alert('请先选择分享图');
    try {
      const url = await uploadImageToStorage(file);
      document.getElementById('cpgShareImage').value = url;
      alert('分享图上传成功');
    } catch (e) {
      alert(`上传失败：${e.message || '未知错误'}`);
    }
  },
  async uploadPosterImage() {
    const file = (document.getElementById('cpgPosterFile') || {}).files?.[0];
    if (!file) return alert('请先选择海报');
    try {
      const url = await uploadImageToStorage(file);
      document.getElementById('cpgPosterUrl').value = url;
      alert('海报上传成功');
    } catch (e) {
      alert(`上传失败：${e.message || '未知错误'}`);
    }
  },
  openCreate() {
    _customPageCurrent = null;
    fillCustomPageForm({});
    customPageModal(true);
  },
  async edit(id) {
    const result = await customPageRequest(`/api/custom-pages/${id}`);
    if (result.code !== 0) return alert(result.message || '获取失败');
    _customPageCurrent = result.data;
    fillCustomPageForm(result.data || {});
    customPageModal(true);
  },
  async save() {
    const payload = readCustomPageForm();
    if (!payload.name) return alert('页面名称不能为空');
    if (!payload.slug) return alert('slug 不能为空');
    if (!payload.schemaJson.posterUrl) return alert('请上传或填写活动海报');
    const isEdit = !!(_customPageCurrent && _customPageCurrent.id);
    const result = await customPageRequest(isEdit ? `/api/custom-pages/${_customPageCurrent.id}` : '/api/custom-pages', {
      method: isEdit ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    if (result.code !== 0) return alert(result.message || '保存失败');
    customPageModal(false);
    loadCustomPages();
  },
  async remove(id) {
    if (!confirm('确认删除该页面吗？')) return;
    const result = await customPageRequest(`/api/custom-pages/${id}`, { method: 'DELETE' });
    if (result.code !== 0) return alert(result.message || '删除失败');
    loadCustomPages();
  },
  closeModal() {
    customPageModal(false);
  }
};

