let _customPageCurrent = null;

async function customPageRequest(url, options = {}) {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
    },
    ...options
  });
  return res.json();
}

function customPageModal(show) {
  const el = document.getElementById('customPageModal');
  if (el) el.style.display = show ? 'block' : 'none';
}

function normalizeSchemaInput(v) {
  const raw = String(v || '').trim();
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (_) {
    return [];
  }
}

function fillCustomPageForm(data = {}) {
  document.getElementById('cpgName').value = data.name || '';
  document.getElementById('cpgSlug').value = data.slug || '';
  document.getElementById('cpgTitle').value = data.title || '';
  document.getElementById('cpgStatus').value = data.status || 'draft';
  document.getElementById('cpgStartTime').value = data.startTime ? new Date(data.startTime).toISOString().slice(0, 16) : '';
  document.getElementById('cpgEndTime').value = data.endTime ? new Date(data.endTime).toISOString().slice(0, 16) : '';
  document.getElementById('cpgEnableShare').checked = data.enableShare !== false;
  document.getElementById('cpgShareTitle').value = data.shareTitle || '';
  document.getElementById('cpgShareImage').value = data.shareImage || '';
  document.getElementById('cpgSchemaJson').value = JSON.stringify(data.schemaJson || [], null, 2);
}

function readCustomPageForm() {
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
    schemaJson: normalizeSchemaInput(document.getElementById('cpgSchemaJson').value)
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
  tbody.innerHTML = list.map(item => `
    <tr>
      <td>${item.id}</td>
      <td>${item.name || '-'}</td>
      <td>${item.slug || '-'}</td>
      <td>${item.status || '-'}</td>
      <td>${item.enableShare === false ? '关闭' : '开启'} ${item.shareTitle ? `| ${item.shareTitle}` : ''}</td>
      <td>
        <button class="btn btn-primary" onclick="CustomPageManagement.edit(${item.id})">编辑</button>
        <button class="btn btn-danger" onclick="CustomPageManagement.remove(${item.id})">删除</button>
      </td>
    </tr>
  `).join('');
}

window.CustomPageManagement = {
  init: loadCustomPages,
  load: loadCustomPages,
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

document.addEventListener('DOMContentLoaded', () => {
  if (window.PageLoader && window.PageLoader.getCurrentPage && window.PageLoader.getCurrentPage() === 'custom-page-management') {
    loadCustomPages();
  }
});

