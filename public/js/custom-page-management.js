let _customPageCurrent = null;
let _hotspots = [];
let _selectedHotspotIndex = -1;
let _dragState = null;

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
  if (el) el.style.display = show ? 'flex' : 'none';
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

function resolveMediaUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url) return '';
  if (url.startsWith('cloud://')) return `/api/storage/temp-url?fileId=${encodeURIComponent(url)}`;
  if (/^https?:\/\//i.test(url) && /myqcloud\.com/i.test(url)) {
    return `/api/storage/cos-url?url=${encodeURIComponent(url)}`;
  }
  return url;
}

function clampPercent(value, min = 0, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function renderHotspotList() {
  const listEl = document.getElementById('cpgHotspotList');
  if (!listEl) return;
  listEl.innerHTML = _hotspots.map((it, idx) => `
    <div class="cpm-hotspot-item ${idx === _selectedHotspotIndex ? 'active' : ''}" onclick="CustomPageManagement.selectHotspot(${idx})">
      <span>${it.name || `热区${idx + 1}`}</span>
      <span>${Number(it.x || 0).toFixed(1)}%, ${Number(it.y || 0).toFixed(1)}%</span>
    </div>
  `).join('');
}

function renderHotspotPropertyPanel() {
  const hs = _hotspots[_selectedHotspotIndex];
  const setVal = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = v;
  };
  if (!hs) {
    setVal('cpgSelectedName', '');
    setVal('cpgSelectedX', '');
    setVal('cpgSelectedY', '');
    setVal('cpgSelectedW', '');
    setVal('cpgSelectedH', '');
    setVal('cpgSelectedJumpType', 'none');
    setVal('cpgSelectedJumpTarget', '');
    return;
  }
  setVal('cpgSelectedName', hs.name || '');
  setVal('cpgSelectedX', Number(hs.x || 0));
  setVal('cpgSelectedY', Number(hs.y || 0));
  setVal('cpgSelectedW', Number(hs.w || 0));
  setVal('cpgSelectedH', Number(hs.h || 0));
  setVal('cpgSelectedJumpType', hs.jumpType || 'none');
  setVal('cpgSelectedJumpTarget', hs.jumpTarget || '');
}

function renderHotspotCanvas() {
  const layer = document.getElementById('cpgHotspotLayer');
  const canvas = document.getElementById('cpgEditorCanvas');
  if (!layer || !canvas) return;
  layer.innerHTML = _hotspots.map((it, idx) => {
    const x = clampPercent(it.x);
    const y = clampPercent(it.y);
    const w = clampPercent(it.w, 1, 100);
    const h = clampPercent(it.h, 1, 100);
    return `
      <div class="cpm-hotspot ${idx === _selectedHotspotIndex ? 'active' : ''}" data-index="${idx}"
        style="left:${x}%;top:${y}%;width:${w}%;height:${h}%;">
        <div class="cpm-hotspot-label">${it.name || `热区${idx + 1}`}</div>
        <div class="cpm-hotspot-handle" data-role="resize" data-index="${idx}"></div>
      </div>
    `;
  }).join('');
}

function renderHotspotEditor() {
  renderHotspotCanvas();
  renderHotspotList();
  renderHotspotPropertyPanel();
}

function bindEditorEvents() {
  const posterInput = document.getElementById('cpgPosterUrl');
  const poster = document.getElementById('cpgEditorPoster');
  if (posterInput && poster) {
    posterInput.oninput = () => {
      poster.src = resolveMediaUrl(posterInput.value);
    };
  }
  const layer = document.getElementById('cpgHotspotLayer');
  const canvas = document.getElementById('cpgEditorCanvas');
  if (!layer || !canvas) return;

  layer.onmousedown = (e) => {
    const target = e.target;
    const hotspotEl = target.closest('.cpm-hotspot');
    if (!hotspotEl) return;
    const index = Number(hotspotEl.getAttribute('data-index'));
    if (!Number.isFinite(index)) return;
    _selectedHotspotIndex = index;
    const role = target.getAttribute('data-role') === 'resize' ? 'resize' : 'move';
    const rect = canvas.getBoundingClientRect();
    const hs = _hotspots[index];
    _dragState = {
      role,
      index,
      startX: e.clientX,
      startY: e.clientY,
      rect,
      origin: { x: hs.x, y: hs.y, w: hs.w, h: hs.h }
    };
    renderHotspotEditor();
    e.preventDefault();
  };

  window.onmousemove = (e) => {
    if (!_dragState) return;
    const { index, role, rect, startX, startY, origin } = _dragState;
    const dx = ((e.clientX - startX) / rect.width) * 100;
    const dy = ((e.clientY - startY) / rect.height) * 100;
    const hs = _hotspots[index];
    if (!hs) return;
    if (role === 'move') {
      hs.x = clampPercent(origin.x + dx, 0, 100 - clampPercent(hs.w, 1, 100));
      hs.y = clampPercent(origin.y + dy, 0, 100 - clampPercent(hs.h, 1, 100));
    } else {
      hs.w = clampPercent(origin.w + dx, 1, 100 - clampPercent(origin.x));
      hs.h = clampPercent(origin.h + dy, 1, 100 - clampPercent(origin.y));
    }
    renderHotspotEditor();
  };

  window.onmouseup = () => {
    _dragState = null;
  };
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
  _selectedHotspotIndex = _hotspots.length ? 0 : -1;
  const poster = document.getElementById('cpgEditorPoster');
  if (poster) poster.src = resolveMediaUrl(document.getElementById('cpgPosterUrl').value || '');
  renderHotspotEditor();
}

function readCustomPageForm() {
  const hotspots = _hotspots.map((it) => ({
    name: String(it.name || '').trim(),
    x: clampPercent(it.x),
    y: clampPercent(it.y),
    w: clampPercent(it.w, 1, 100),
    h: clampPercent(it.h, 1, 100),
    jumpType: String(it.jumpType || 'none').trim(),
    jumpTarget: String(it.jumpTarget || '').trim()
  }));
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
      <td>${img ? `<img class="cpm-poster" src="${resolveMediaUrl(img)}">` : '-'}</td>
        <td>${Array.isArray(schema.hotspots) ? schema.hotspots.length : 0}</td>
        <td>${item.enableShare === false ? '关闭' : '开启'}</td>
        <td>
          <button class="cpm-btn cpm-btn-primary" onclick="CustomPageManagement.edit(${item.id})">编辑</button>
          <button class="cpm-btn cpm-btn-danger" onclick="CustomPageManagement.remove(${item.id})">删除</button>
        </td>
      </tr>
    `;
  }).join('');
}

window.CustomPageManagement = {
  init() {
    loadCustomPages();
    bindEditorEvents();
  },
  load: loadCustomPages,
  addHotspot() {
    _hotspots.push({ name: '', x: 10, y: 10, w: 30, h: 12, jumpType: 'none', jumpTarget: '' });
    _selectedHotspotIndex = _hotspots.length - 1;
    renderHotspotEditor();
  },
  selectHotspot(index) {
    _selectedHotspotIndex = index;
    renderHotspotEditor();
  },
  applySelectedHotspot() {
    const hs = _hotspots[_selectedHotspotIndex];
    if (!hs) return alert('请先选择一个热区');
    hs.name = ((document.getElementById('cpgSelectedName') || {}).value || '').trim();
    hs.x = clampPercent((document.getElementById('cpgSelectedX') || {}).value, 0, 100);
    hs.y = clampPercent((document.getElementById('cpgSelectedY') || {}).value, 0, 100);
    hs.w = clampPercent((document.getElementById('cpgSelectedW') || {}).value, 1, 100);
    hs.h = clampPercent((document.getElementById('cpgSelectedH') || {}).value, 1, 100);
    hs.jumpType = ((document.getElementById('cpgSelectedJumpType') || {}).value || 'none').trim();
    hs.jumpTarget = ((document.getElementById('cpgSelectedJumpTarget') || {}).value || '').trim();
    renderHotspotEditor();
  },
  removeHotspot(index) {
    _hotspots.splice(index, 1);
    if (_selectedHotspotIndex >= _hotspots.length) _selectedHotspotIndex = _hotspots.length - 1;
    renderHotspotEditor();
  },
  removeSelectedHotspot() {
    if (_selectedHotspotIndex < 0 || _selectedHotspotIndex >= _hotspots.length) return alert('请先选择一个热区');
    _hotspots.splice(_selectedHotspotIndex, 1);
    if (_selectedHotspotIndex >= _hotspots.length) _selectedHotspotIndex = _hotspots.length - 1;
    renderHotspotEditor();
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
    bindEditorEvents();
    customPageModal(true);
  },
  async edit(id) {
    const result = await customPageRequest(`/api/custom-pages/${id}`);
    if (result.code !== 0) return alert(result.message || '获取失败');
    _customPageCurrent = result.data;
    fillCustomPageForm(result.data || {});
    bindEditorEvents();
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

