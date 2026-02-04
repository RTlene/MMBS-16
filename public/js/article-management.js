/**
 * 资讯管理 - 列表、新增、编辑、删除
 */
let articles = [];
let currentPage = 1;
let totalPages = 1;
const limit = 10;

function getToken() {
  return localStorage.getItem('token') || '';
}

function getHeaders(withContentType) {
  const h = { Authorization: 'Bearer ' + getToken() };
  if (!withContentType) return h;
  return h;
}

function getStatusClass(s) {
  if (s === 'published') return 'status-published';
  if (s === 'archived') return 'status-archived';
  return 'status-draft';
}

function getStatusText(s) {
  if (s === 'published') return '已发布';
  if (s === 'archived') return '已归档';
  return '草稿';
}

function formatDateTime(str) {
  if (!str) return '-';
  const d = new Date(str);
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function initArticleManagement() {
  loadArticles();
  document.getElementById('articleForm').addEventListener('submit', onSubmit);
  document.getElementById('searchInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); searchArticles(); }
  });
}

async function loadArticles() {
  try {
    const search = document.getElementById('searchInput').value.trim();
    const status = document.getElementById('statusFilter').value;
    const params = new URLSearchParams({ page: currentPage, limit });
    if (search) params.append('search', search);
    if (status) params.append('status', status);

    const res = await fetch('/api/articles?' + params, { headers: getHeaders() });
    const result = await res.json();
    if (result.code !== 0) throw new Error(result.message || '加载失败');

    articles = result.data.articles || [];
    totalPages = result.data.totalPages || 1;
    renderTable();
    renderPagination();
  } catch (err) {
    console.error(err);
    alert('加载列表失败: ' + (err.message || '请登录后重试'));
  }
}

function renderTable() {
  const tbody = document.getElementById('articleTableBody');
  if (!articles.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999;">暂无资讯</td></tr>';
    return;
  }
  tbody.innerHTML = articles.map(a => {
    const cover = a.coverImage
      ? '<img class="cover-preview" src="' + (a.coverImage.startsWith('http') ? a.coverImage : (window.location.origin + a.coverImage)) + '" alt="">'
      : '<span style="color:#999;">无</span>';
    return '<tr>' +
      '<td>' + a.id + '</td>' +
      '<td>' + cover + '</td>' +
      '<td>' + (a.title || '-').slice(0, 30) + (a.title && a.title.length > 30 ? '…' : '') + '</td>' +
      '<td><span class="' + getStatusClass(a.status) + '">' + getStatusText(a.status) + '</span></td>' +
      '<td>' + formatDateTime(a.publishTime) + '</td>' +
      '<td>' + (a.sortOrder ?? 0) + '</td>' +
      '<td>' +
      '<button class="btn btn-primary" style="margin-right:8px;padding:4px 10px;" onclick="editArticle(' + a.id + ')">编辑</button>' +
      '<button class="btn btn-danger" style="padding:4px 10px;" onclick="deleteArticle(' + a.id + ',\'' + (a.title || '').replace(/'/g, "\\'") + '\')">删除</button>' +
      '</td></tr>';
  }).join('');
}

function renderPagination() {
  const el = document.getElementById('pagination');
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  let html = '<button ' + (currentPage <= 1 ? 'disabled' : '') + ' onclick="goPage(' + (currentPage - 1) + ')">上一页</button>';
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
      html += '<button class="' + (i === currentPage ? 'active' : '') + '" onclick="goPage(' + i + ')">' + i + '</button>';
    } else if (i === currentPage - 3 || i === currentPage + 3) {
      html += '<span>…</span>';
    }
  }
  html += '<button ' + (currentPage >= totalPages ? 'disabled' : '') + ' onclick="goPage(' + (currentPage + 1) + ')">下一页</button>';
  el.innerHTML = html;
}

function goPage(p) {
  currentPage = p;
  loadArticles();
}

function searchArticles() {
  currentPage = 1;
  loadArticles();
}

function showAddModal() {
  document.getElementById('articleModalTitle').textContent = '新增资讯';
  document.getElementById('articleId').value = '';
  document.getElementById('articleTitle').value = '';
  document.getElementById('articleSummary').value = '';
  document.getElementById('articleContent').value = '';
  document.getElementById('articleAuthor').value = 'MMBS商城';
  document.getElementById('articlePublishTime').value = '';
  document.getElementById('articleStatus').value = 'draft';
  document.getElementById('articleSortOrder').value = '0';
  document.getElementById('articleExternalUrl').value = '';
  document.getElementById('articleCover').value = '';
  document.getElementById('articleModal').classList.add('show');
}

async function editArticle(id) {
  try {
    const res = await fetch('/api/articles/' + id, { headers: getHeaders() });
    const result = await res.json();
    if (result.code !== 0) throw new Error(result.message || '获取失败');
    const a = result.data;
    document.getElementById('articleModalTitle').textContent = '编辑资讯';
    document.getElementById('articleId').value = a.id;
    document.getElementById('articleTitle').value = a.title || '';
    document.getElementById('articleSummary').value = a.summary || '';
    document.getElementById('articleContent').value = a.content || '';
    document.getElementById('articleAuthor').value = a.author || 'MMBS商城';
    document.getElementById('articlePublishTime').value = a.publishTime ? new Date(a.publishTime).toISOString().slice(0, 16) : '';
    document.getElementById('articleStatus').value = a.status || 'draft';
    document.getElementById('articleSortOrder').value = a.sortOrder ?? 0;
    document.getElementById('articleExternalUrl').value = a.externalUrl || '';
    document.getElementById('articleCover').value = '';
    document.getElementById('articleModal').classList.add('show');
  } catch (err) {
    alert('加载失败: ' + (err.message || ''));
  }
}

function closeModal() {
  document.getElementById('articleModal').classList.remove('show');
}

async function onSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('articleId').value;
  const formData = new FormData();
  formData.append('title', document.getElementById('articleTitle').value.trim());
  formData.append('summary', document.getElementById('articleSummary').value.trim());
  formData.append('content', document.getElementById('articleContent').value);
  formData.append('author', document.getElementById('articleAuthor').value.trim());
  formData.append('publishTime', document.getElementById('articlePublishTime').value || '');
  formData.append('status', document.getElementById('articleStatus').value);
  formData.append('sortOrder', document.getElementById('articleSortOrder').value);
  formData.append('externalUrl', document.getElementById('articleExternalUrl').value.trim());
  const coverFile = document.getElementById('articleCover').files[0];
  if (coverFile) formData.append('coverImage', coverFile);

  try {
    const url = id ? '/api/articles/' + id : '/api/articles';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { Authorization: 'Bearer ' + getToken() },
      body: formData
    });
    const result = await res.json();
    if (result.code !== 0) throw new Error(result.message || '保存失败');
    closeModal();
    loadArticles();
    alert(id ? '更新成功' : '创建成功');
  } catch (err) {
    alert('保存失败: ' + (err.message || ''));
  }
}

async function deleteArticle(id, title) {
  if (!confirm('确定删除资讯《' + (title || id) + '》？')) return;
  try {
    const res = await fetch('/api/articles/' + id, { method: 'DELETE', headers: getHeaders() });
    const result = await res.json();
    if (result.code !== 0) throw new Error(result.message || '删除失败');
    loadArticles();
    alert('删除成功');
  } catch (err) {
    alert('删除失败: ' + (err.message || ''));
  }
}

document.addEventListener('DOMContentLoaded', initArticleManagement);

window.ArticleManagement = { init: initArticleManagement, loadArticles };
