let _cpCurrent = null;
let _cpList = [];
let _cpPreviewList = [];
let _cpPreviewIndex = 0;

async function cpRequest(url, options = {}) {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
    },
    ...options
  });
  return res.json();
}

function cpModal(show) {
  const el = document.getElementById('campaignPopupModal');
  if (el) el.style.display = show ? 'block' : 'none';
}

function cpFormData() {
  return {
    name: document.getElementById('cpName').value.trim(),
    title: document.getElementById('cpTitle').value.trim(),
    status: document.getElementById('cpStatus').value,
    priority: Number(document.getElementById('cpPriority').value || 0),
    startTime: document.getElementById('cpStartTime').value || null,
    endTime: document.getElementById('cpEndTime').value || null,
    jumpType: document.getElementById('cpJumpType').value,
    jumpTarget: document.getElementById('cpJumpTarget').value.trim(),
    showOncePerCycle: !!document.getElementById('cpShowOnce').checked,
    imageUrls: document.getElementById('cpImageUrls').value.split('\n').map(s => s.trim()).filter(Boolean)
  };
}

function cpFill(data = {}) {
  document.getElementById('cpName').value = data.name || '';
  document.getElementById('cpTitle').value = data.title || '';
  document.getElementById('cpStatus').value = data.status || 'draft';
  document.getElementById('cpPriority').value = data.priority || 0;
  document.getElementById('cpStartTime').value = data.startTime ? new Date(data.startTime).toISOString().slice(0, 16) : '';
  document.getElementById('cpEndTime').value = data.endTime ? new Date(data.endTime).toISOString().slice(0, 16) : '';
  document.getElementById('cpJumpType').value = data.jumpType || 'none';
  document.getElementById('cpJumpTarget').value = data.jumpTarget || '';
  document.getElementById('cpShowOnce').checked = data.showOncePerCycle !== false;
  document.getElementById('cpImageUrls').value = Array.isArray(data.imageUrls) ? data.imageUrls.join('\n') : '';
}

async function cpLoad() {
  const search = (document.getElementById('campaignPopupSearch') || {}).value || '';
  const status = (document.getElementById('campaignPopupStatus') || {}).value || '';
  const q = new URLSearchParams({ search, status, page: 1, limit: 100 });
  const result = await cpRequest(`/api/campaign-popups?${q.toString()}`);
  const tbody = document.getElementById('campaignPopupTableBody');
  if (!tbody) return;
  const list = (result && result.code === 0 && result.data && result.data.list) || [];
  _cpList = list.slice();
  tbody.innerHTML = list.map(item => `
    <tr>
      <td>${item.id}</td>
      <td>${item.name || '-'}</td>
      <td>${item.status || '-'}</td>
      <td>${item.startTime ? new Date(item.startTime).toLocaleString() : '-'} ~ ${item.endTime ? new Date(item.endTime).toLocaleString() : '-'}</td>
      <td>${item.priority || 0}</td>
      <td>${item.jumpType || 'none'} ${item.jumpTarget ? `(${item.jumpTarget})` : ''}</td>
      <td>
        <button class="btn" onclick="CampaignPopupManagement.moveUp(${item.id})">上移</button>
        <button class="btn" onclick="CampaignPopupManagement.moveDown(${item.id})">下移</button>
        <button class="btn btn-warning" onclick="CampaignPopupManagement.toTop(${item.id})">置顶</button>
        <button class="btn btn-primary" onclick="CampaignPopupManagement.edit(${item.id})">编辑</button>
        <button class="btn btn-danger" onclick="CampaignPopupManagement.remove(${item.id})">删除</button>
      </td>
    </tr>
  `).join('');
}

function cpPreviewModal(show) {
  const el = document.getElementById('campaignPopupPreviewModal');
  if (el) el.style.display = show ? 'block' : 'none';
}

function cpRenderPreview() {
  const emptyEl = document.getElementById('campaignPopupPreviewEmpty');
  const boxEl = document.getElementById('campaignPopupPreviewBox');
  if (!_cpPreviewList.length) {
    if (emptyEl) emptyEl.style.display = 'block';
    if (boxEl) boxEl.style.display = 'none';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  if (boxEl) boxEl.style.display = 'block';
  const item = _cpPreviewList[_cpPreviewIndex];
  const imageEl = document.getElementById('campaignPopupPreviewImage');
  const titleEl = document.getElementById('campaignPopupPreviewTitle');
  const metaEl = document.getElementById('campaignPopupPreviewMeta');
  if (imageEl) imageEl.src = item.coverImage || '';
  if (titleEl) titleEl.textContent = item.title || item.name || '未命名活动';
  if (metaEl) metaEl.textContent = `第 ${_cpPreviewIndex + 1}/${_cpPreviewList.length} 条 | 优先级 ${item.priority || 0}`;
}

async function cpSwapPriority(a, b) {
  const pa = Number(a.priority || 0);
  const pb = Number(b.priority || 0);
  await cpRequest(`/api/campaign-popups/${a.id}`, { method: 'PUT', body: JSON.stringify({ priority: pb }) });
  await cpRequest(`/api/campaign-popups/${b.id}`, { method: 'PUT', body: JSON.stringify({ priority: pa }) });
}

window.CampaignPopupManagement = {
  init: cpLoad,
  load: cpLoad,
  openCreate() {
    _cpCurrent = null;
    cpFill({});
    cpModal(true);
  },
  async edit(id) {
    const result = await cpRequest(`/api/campaign-popups/${id}`);
    if (result.code !== 0) return alert(result.message || '获取失败');
    _cpCurrent = result.data;
    cpFill(result.data || {});
    cpModal(true);
  },
  async save() {
    const payload = cpFormData();
    if (!payload.name) return alert('活动名称不能为空');
    const isEdit = !!(_cpCurrent && _cpCurrent.id);
    const result = await cpRequest(isEdit ? `/api/campaign-popups/${_cpCurrent.id}` : '/api/campaign-popups', {
      method: isEdit ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    if (result.code !== 0) return alert(result.message || '保存失败');
    cpModal(false);
    cpLoad();
  },
  async remove(id) {
    if (!confirm('确认删除该活动弹窗吗？')) return;
    const result = await cpRequest(`/api/campaign-popups/${id}`, { method: 'DELETE' });
    if (result.code !== 0) return alert(result.message || '删除失败');
    cpLoad();
  },
  async moveUp(id) {
    const idx = _cpList.findIndex((x) => Number(x.id) === Number(id));
    if (idx <= 0) return;
    await cpSwapPriority(_cpList[idx], _cpList[idx - 1]);
    await cpLoad();
  },
  async moveDown(id) {
    const idx = _cpList.findIndex((x) => Number(x.id) === Number(id));
    if (idx < 0 || idx >= _cpList.length - 1) return;
    await cpSwapPriority(_cpList[idx], _cpList[idx + 1]);
    await cpLoad();
  },
  async toTop(id) {
    const item = _cpList.find((x) => Number(x.id) === Number(id));
    if (!item) return;
    const maxPriority = _cpList.reduce((m, x) => Math.max(m, Number(x.priority || 0)), 0);
    const result = await cpRequest(`/api/campaign-popups/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ priority: maxPriority + 10 })
    });
    if (result.code !== 0) return alert(result.message || '置顶失败');
    cpLoad();
  },
  preview() {
    _cpPreviewList = _cpList
      .map((item) => {
        const images = Array.isArray(item.imageUrls) ? item.imageUrls.filter(Boolean) : [];
        return {
          ...item,
          coverImage: images[0] || ''
        };
      })
      .filter((item) => !!item.coverImage);
    _cpPreviewIndex = 0;
    cpRenderPreview();
    cpPreviewModal(true);
  },
  previewPrev() {
    if (!_cpPreviewList.length) return;
    _cpPreviewIndex = (_cpPreviewIndex - 1 + _cpPreviewList.length) % _cpPreviewList.length;
    cpRenderPreview();
  },
  previewNext() {
    if (!_cpPreviewList.length) return;
    _cpPreviewIndex = (_cpPreviewIndex + 1) % _cpPreviewList.length;
    cpRenderPreview();
  },
  closePreview() {
    cpPreviewModal(false);
  },
  closeModal() {
    cpModal(false);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (window.PageLoader && window.PageLoader.getCurrentPage && window.PageLoader.getCurrentPage() === 'campaign-popup-management') {
    cpLoad();
  }
});

