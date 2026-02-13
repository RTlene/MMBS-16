/**
 * 佣金提现管理 - 后台
 */
window.WithdrawalManagement = {
  data: {
    withdrawals: [],
    currentPage: 1,
    totalPages: 1,
    pageSize: 10,
    search: '',
    statusFilter: '',
    currentId: null
  },

  init() {
    this.loadWithdrawals();
    this.bindEvents();
  },

  bindEvents() {
    const self = this;
    document.getElementById('searchInput').addEventListener('keypress', function (e) {
      if (e.key === 'Enter') self.searchWithdrawals();
    });
    document.getElementById('statusFilter').addEventListener('change', function () {
      self.searchWithdrawals();
    });
    document.getElementById('btnApprove').addEventListener('click', function () {
      self.doApprove();
    });
    document.getElementById('btnReject').addEventListener('click', function () {
      self.doReject();
    });
    document.getElementById('btnComplete').addEventListener('click', function () {
      self.doComplete();
    });
  },

  getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    };
  },

  async loadWithdrawals() {
    const d = this.data;
    const params = new URLSearchParams({
      page: d.currentPage,
      limit: d.pageSize,
      status: d.statusFilter,
      search: d.search
    });
    try {
      const res = await fetch('/api/withdrawals?' + params, { headers: this.getAuthHeaders() });
      const result = await res.json();
      if (result.code === 0) {
        d.withdrawals = result.data.withdrawals || [];
        d.totalPages = result.data.totalPages || 1;
        this.renderTable();
        this.renderPagination();
      } else {
        alert(result.message || '加载列表失败');
      }
    } catch (e) {
      console.error(e);
      alert('网络错误');
    }
  },

  statusClass(s) {
    const map = {
      pending: 'status-pending',
      approved: 'status-approved',
      rejected: 'status-rejected',
      processing: 'status-processing',
      completed: 'status-completed',
      cancelled: 'status-cancelled'
    };
    return map[s] || '';
  },

  renderTable() {
    const tbody = document.getElementById('withdrawalTableBody');
    const list = this.data.withdrawals;
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#999;">暂无提现申请</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(w => {
      const accountInfo = w.accountType === 'bank' ? (w.bankName || '') + ' ' + (w.accountNumber || '') : (w.accountNumber || '');
      const time = w.createdAt ? new Date(w.createdAt).toLocaleString() : '-';
      return '<tr>' +
        '<td>' + (w.withdrawalNo || '-') + '</td>' +
        '<td>' + (w.memberNickname || '-') + '<br><small>' + (w.memberPhone || '') + '</small></td>' +
        '<td>¥' + (parseFloat(w.amount) || 0).toFixed(2) + '</td>' +
        '<td>' + (w.accountTypeText || w.accountType || '-') + '</td>' +
        '<td>' + (w.accountName || '') + ' ' + accountInfo + '</td>' +
        '<td><span class="status-badge ' + this.statusClass(w.status) + '">' + (w.statusText || w.status) + '</span></td>' +
        '<td>' + time + '</td>' +
        '<td><button class="btn btn-primary btn-sm" onclick="window.WithdrawalManagement.openDetail(' + w.id + ')">查看</button></td>' +
        '</tr>';
    }).join('');
  },

  renderPagination() {
    const p = document.getElementById('pagination');
    const cur = this.data.currentPage;
    const total = this.data.totalPages;
    p.innerHTML =
      '<button class="btn btn-secondary" ' + (cur <= 1 ? 'disabled' : '') + ' onclick="window.WithdrawalManagement.goPage(' + (cur - 1) + ')">上一页</button>' +
      '<span style="margin:0 12px;">第 ' + cur + ' / ' + (total || 1) + ' 页</span>' +
      '<button class="btn btn-secondary" ' + (cur >= total ? 'disabled' : '') + ' onclick="window.WithdrawalManagement.goPage(' + (cur + 1) + ')">下一页</button>';
  },

  goPage(page) {
    if (page < 1 || page > this.data.totalPages) return;
    this.data.currentPage = page;
    this.loadWithdrawals();
  },

  searchWithdrawals() {
    this.data.search = document.getElementById('searchInput').value.trim();
    this.data.statusFilter = document.getElementById('statusFilter').value;
    this.data.currentPage = 1;
    this.loadWithdrawals();
  },

  resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('statusFilter').value = '';
    this.data.search = '';
    this.data.statusFilter = '';
    this.data.currentPage = 1;
    this.loadWithdrawals();
  },

  async openDetail(id) {
    this.data.currentId = id;
    try {
      const res = await fetch('/api/withdrawals/' + id, { headers: this.getAuthHeaders() });
      const result = await res.json();
      if (result.code !== 0 || !result.data || !result.data.withdrawal) {
        alert(result.message || '获取详情失败');
        return;
      }
      const w = result.data.withdrawal;
      document.getElementById('dWithdrawalNo').textContent = w.withdrawalNo || '-';
      document.getElementById('dMember').textContent = (w.memberNickname || '-') + ' ' + (w.memberPhone || '');
      document.getElementById('dAmount').textContent = '¥' + (parseFloat(w.amount) || 0).toFixed(2);
      document.getElementById('dAccountType').textContent = w.accountTypeText || w.accountType || '-';
      document.getElementById('dAccountName').textContent = w.accountName || '-';
      document.getElementById('dAccountNumber').textContent = w.accountNumber || '-';
      const bankRow = document.getElementById('dBankRow');
      if (w.accountType === 'bank' && (w.bankName || w.bankBranch)) {
        bankRow.style.display = 'flex';
        document.getElementById('dBankName').textContent = (w.bankName || '') + ' ' + (w.bankBranch || '');
      } else {
        bankRow.style.display = 'none';
      }
      document.getElementById('dStatus').textContent = w.statusText || w.status || '-';
      document.getElementById('dCreatedAt').textContent = w.createdAt ? new Date(w.createdAt).toLocaleString() : '-';
      document.getElementById('dRemark').textContent = w.remark || '-';
      document.getElementById('dAdminRemark').textContent = w.adminRemark || '-';
      document.getElementById('adminRemarkInput').value = w.adminRemark || '';

      const actions = document.getElementById('actionButtons');
      const canApproveReject = w.status === 'pending';
      const canComplete = w.status === 'approved' || w.status === 'processing';
      document.getElementById('btnApprove').style.display = canApproveReject ? 'inline-block' : 'none';
      document.getElementById('btnReject').style.display = canApproveReject ? 'inline-block' : 'none';
      document.getElementById('btnComplete').style.display = canComplete ? 'inline-block' : 'none';

      document.getElementById('detailModal').classList.add('show');
    } catch (e) {
      console.error(e);
      alert('网络错误');
    }
  },

  closeDetailModal() {
    document.getElementById('detailModal').classList.remove('show');
    this.data.currentId = null;
  },

  async doApprove() {
    const id = this.data.currentId;
    if (!id) return;
    if (!confirm('确认通过该提现申请？')) return;
    try {
      const res = await fetch('/api/withdrawals/' + id + '/approve', {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({})
      });
      const result = await res.json();
      if (result.code === 0) {
        alert('已通过审核');
        this.closeDetailModal();
        this.loadWithdrawals();
      } else {
        alert(result.message || '操作失败');
      }
    } catch (e) {
      console.error(e);
      alert('网络错误');
    }
  },

  async doReject() {
    const id = this.data.currentId;
    if (!id) return;
    if (!confirm('确认拒绝该提现申请？佣金将退回用户可用余额。')) return;
    const adminRemark = document.getElementById('adminRemarkInput').value.trim();
    try {
      const res = await fetch('/api/withdrawals/' + id + '/reject', {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ adminRemark })
      });
      const result = await res.json();
      if (result.code === 0) {
        alert('已拒绝，佣金已退回');
        this.closeDetailModal();
        this.loadWithdrawals();
      } else {
        alert(result.message || '操作失败');
      }
    } catch (e) {
      console.error(e);
      alert('网络错误');
    }
  },

  async doComplete() {
    const id = this.data.currentId;
    if (!id) return;
    if (!confirm('确认已线下打款完成？将标记为已完成并扣减冻结佣金。')) return;
    try {
      const res = await fetch('/api/withdrawals/' + id + '/complete', {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({})
      });
      const result = await res.json();
      if (result.code === 0) {
        alert('已标记为已完成');
        this.closeDetailModal();
        this.loadWithdrawals();
      } else {
        alert(result.message || '操作失败');
      }
    } catch (e) {
      console.error(e);
      alert('网络错误');
    }
  }
};

function searchWithdrawals() {
  window.WithdrawalManagement.searchWithdrawals();
}
function resetFilters() {
  window.WithdrawalManagement.resetFilters();
}
function closeDetailModal() {
  window.WithdrawalManagement.closeDetailModal();
}
