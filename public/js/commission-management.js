/**
 * 佣金管理 - 概览、佣金记录、提现申请（合并）
 */
window.CommissionManagement = {
  data: {
    calcPage: 1,
    calcTotalPages: 1,
    calcPageSize: 10,
    calcType: '',
    calcStatus: '',
    calculations: [],
    withdrawals: [],
    withdrawalPage: 1,
    withdrawalTotalPages: 1,
    withdrawalPageSize: 10,
    withdrawalSearch: '',
    withdrawalStatus: '',
    withdrawalCurrentId: null
  },

  init() {
    this.bindTabs();
    this.loadStats();
    this.bindCalcEvents();
    this.bindWithdrawalEvents();
    const linkTestOrder = document.getElementById('linkTestOrder');
    if (linkTestOrder) {
      linkTestOrder.href = 'javascript:void(0)';
      linkTestOrder.onclick = () => { if (window.PageLoader) window.PageLoader.loadSubPage('test-order'); };
    }
  },

  getAuthHeaders() {
    const token = localStorage.getItem('token');
    return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
  },

  bindTabs() {
    const self = this;
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', function () {
        const t = this.getAttribute('data-tab');
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(x => x.classList.remove('active'));
        this.classList.add('active');
        const panel = document.getElementById('panel-' + t);
        if (panel) panel.classList.add('active');
        if (t === 'overview') self.loadStats();
        if (t === 'calculations') self.loadCalculations();
        if (t === 'withdrawals') { self.loadWithdrawalConfig(); self.loadWithdrawals(); }
      });
    });
  },

  // ---------- 概览 ----------
  async loadStats() {
    try {
      const res = await fetch('/api/commission/stats', { headers: this.getAuthHeaders() });
      const result = await res.json();
      if (result.code === 0 && result.data) {
        const d = result.data;
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set('statPending', d.pendingCalculations != null ? d.pendingCalculations : '-');
        set('statConfirmedAmount', d.totalCommissionAmount != null ? Number(d.totalCommissionAmount).toFixed(2) : '-');
        set('statTotal', d.totalCalculations != null ? d.totalCalculations : '-');
        set('statConfirmed', d.confirmedCalculations != null ? d.confirmedCalculations : '-');
      }
    } catch (e) {
      console.error('加载佣金统计失败', e);
    }
  },

  // ---------- 佣金记录 ----------
  bindCalcEvents() {
    const self = this;
    const q = document.getElementById('btnSearchCalc');
    if (q) q.addEventListener('click', () => { self.data.calcPage = 1; self.loadCalculations(); });
    document.getElementById('calcTypeFilter')?.addEventListener('change', () => { self.data.calcPage = 1; self.loadCalculations(); });
    document.getElementById('calcStatusFilter')?.addEventListener('change', () => { self.data.calcPage = 1; self.loadCalculations(); });
  },

  async loadCalculations() {
    const d = this.data;
    d.calcType = document.getElementById('calcTypeFilter')?.value || '';
    d.calcStatus = document.getElementById('calcStatusFilter')?.value || '';
    const params = new URLSearchParams({
      page: d.calcPage,
      limit: d.calcPageSize,
      type: d.calcType,
      status: d.calcStatus
    });
    try {
      const res = await fetch('/api/commission/calculations?' + params, { headers: this.getAuthHeaders() });
      const result = await res.json();
      if (result.code === 0) {
        d.calculations = result.data.calculations || [];
        d.calcTotalPages = result.data.totalPages || 1;
        this.renderCalcTable();
        this.renderCalcPagination();
      } else {
        alert(result.message || '加载失败');
      }
    } catch (e) {
      console.error(e);
      alert('网络错误');
    }
  },

  typeText(type) {
    const m = { direct: '直接', indirect: '间接', distributor: '分销商', network_distributor: '网络分销' };
    return m[type] || type;
  },

  renderCalcTable() {
    const tbody = document.getElementById('calcTableBody');
    const list = this.data.calculations;
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:32px;color:#999;">暂无记录</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(c => {
      const orderNo = c.order ? c.order.orderNo : '-';
      const memberName = c.member ? c.member.nickname : '-';
      const recipientName = c.recipient ? c.recipient.nickname : '-';
      const statusClass = c.status === 'pending' ? 'badge-pending' : c.status === 'confirmed' ? 'badge-confirmed' : 'badge-cancelled';
      const statusText = c.status === 'pending' ? '待确认' : c.status === 'confirmed' ? '已确认' : '已取消';
      const date = c.calculationDate ? new Date(c.calculationDate).toLocaleString() : '-';
      const actions = c.status === 'pending'
        ? '<button class="btn btn-success btn-sm" onclick="window.CommissionManagement.confirmCalc(' + c.id + ')">确认</button>' +
          ' <button class="btn btn-secondary btn-sm" onclick="window.CommissionManagement.cancelCalc(' + c.id + ')">取消</button>'
        : '-';
      return '<tr>' +
        '<td>' + orderNo + '</td>' +
        '<td>' + memberName + '</td>' +
        '<td>' + recipientName + '</td>' +
        '<td>' + this.typeText(c.commissionType) + '</td>' +
        '<td>¥' + (parseFloat(c.orderAmount) || 0).toFixed(2) + '</td>' +
        '<td>' + (parseFloat(c.commissionRate) || 0) + '%</td>' +
        '<td>¥' + (parseFloat(c.commissionAmount) || 0).toFixed(2) + '</td>' +
        '<td><span class="badge ' + statusClass + '">' + statusText + '</span></td>' +
        '<td>' + date + '</td>' +
        '<td>' + actions + '</td></tr>';
    }).join('');
  },

  renderCalcPagination() {
    const p = document.getElementById('calcPagination');
    const cur = this.data.calcPage;
    const total = this.data.calcTotalPages;
    p.innerHTML = '<button class="btn btn-secondary" ' + (cur <= 1 ? 'disabled' : '') + ' onclick="window.CommissionManagement.calcGoPage(' + (cur - 1) + ')">上一页</button>' +
      '<span style="margin:0 12px;">第 ' + cur + ' / ' + (total || 1) + ' 页</span>' +
      '<button class="btn btn-secondary" ' + (cur >= total ? 'disabled' : '') + ' onclick="window.CommissionManagement.calcGoPage(' + (cur + 1) + ')">下一页</button>';
  },

  calcGoPage(page) {
    if (page < 1 || page > this.data.calcTotalPages) return;
    this.data.calcPage = page;
    this.loadCalculations();
  },

  async confirmCalc(id) {
    if (!confirm('确认后将佣金加入该会员可用余额，确定？')) return;
    try {
      const res = await fetch('/api/commission/confirm/' + id, { method: 'PUT', headers: this.getAuthHeaders(), body: '{}' });
      const result = await res.json();
      if (result.code === 0) {
        alert('已确认');
        this.loadStats();
        this.loadCalculations();
      } else {
        alert(result.message || '操作失败');
      }
    } catch (e) {
      console.error(e);
      alert('网络错误');
    }
  },

  async cancelCalc(id) {
    if (!confirm('确定取消该条计算记录？')) return;
    try {
      const res = await fetch('/api/commission/cancel/' + id, { method: 'PUT', headers: this.getAuthHeaders(), body: '{}' });
      const result = await res.json();
      if (result.code === 0) {
        alert('已取消');
        this.loadCalculations();
      } else {
        alert(result.message || '操作失败');
      }
    } catch (e) {
      console.error(e);
      alert('网络错误');
    }
  },

  // ---------- 提现申请 ----------
  bindWithdrawalEvents() {
    const self = this;
    document.getElementById('btnSearchWithdrawal')?.addEventListener('click', () => self.searchWithdrawals());
    document.getElementById('btnResetWithdrawal')?.addEventListener('click', () => self.resetWithdrawalFilters());
    document.getElementById('searchInput')?.addEventListener('keypress', function (e) { if (e.key === 'Enter') self.searchWithdrawals(); });
    document.getElementById('statusFilter')?.addEventListener('change', () => self.searchWithdrawals());
    document.getElementById('btnSaveWithdrawalConfig')?.addEventListener('click', () => self.saveWithdrawalConfig());
    document.getElementById('btnApprove')?.addEventListener('click', () => self.doApprove());
    document.getElementById('btnReject')?.addEventListener('click', () => self.doReject());
    document.getElementById('btnComplete')?.addEventListener('click', () => self.doComplete());
    document.getElementById('btnCancelTransfer')?.addEventListener('click', () => self.doCancelTransfer());
  },

  async loadWithdrawalConfig() {
    try {
      const res = await fetch('/api/withdrawals/config', { headers: this.getAuthHeaders() });
      const result = await res.json();
      if (result.code === 0 && result.data) {
        const a = result.data.autoApprove || {};
        const cb = document.getElementById('autoApproveEnabled');
        const inp = document.getElementById('autoApproveMaxAmount');
        if (cb) cb.checked = !!a.enabled;
        if (inp) inp.value = a.maxAmount != null ? a.maxAmount : '';
      }
    } catch (e) {
      console.error('加载提现配置失败', e);
    }
  },

  async saveWithdrawalConfig() {
    const enabled = document.getElementById('autoApproveEnabled')?.checked ?? false;
    const maxAmount = parseFloat(document.getElementById('autoApproveMaxAmount')?.value) || 0;
    try {
      const res = await fetch('/api/withdrawals/config', {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ autoApprove: { enabled, maxAmount } })
      });
      const result = await res.json();
      if (result.code === 0) alert('配置已保存');
      else alert(result.message || '保存失败');
    } catch (e) {
      console.error(e);
      alert('网络错误');
    }
  },

  async loadWithdrawals() {
    const d = this.data;
    const params = new URLSearchParams({ page: d.withdrawalPage, limit: d.withdrawalPageSize, status: d.withdrawalStatus, search: d.withdrawalSearch });
    try {
      const res = await fetch('/api/withdrawals?' + params, { headers: this.getAuthHeaders() });
      const result = await res.json();
      if (result.code === 0) {
        d.withdrawals = result.data.withdrawals || [];
        d.withdrawalTotalPages = result.data.totalPages || 1;
        this.renderWithdrawalTable();
        this.renderWithdrawalPagination();
      } else {
        alert(result.message || '加载失败');
      }
    } catch (e) {
      console.error(e);
      alert('网络错误');
    }
  },

  withdrawalStatusClass(s) {
    const map = { pending: 'status-pending', approved: 'status-approved', rejected: 'status-rejected', processing: 'status-processing', completed: 'status-completed', cancelled: 'status-cancelled' };
    return map[s] || '';
  },

  withdrawalStatusText(s) {
    const map = { pending: '待审核', approved: '已通过', rejected: '已拒绝', processing: '处理中', completed: '已完成', cancelled: '已取消' };
    return map[s] || s;
  },

  renderWithdrawalTable() {
    const tbody = document.getElementById('withdrawalTableBody');
    const list = this.data.withdrawals;
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:#999;">暂无提现申请</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(w => {
      const statusCell = '<span class="badge ' + this.withdrawalStatusClass(w.status) + '">' + (w.statusText || this.withdrawalStatusText(w.status)) + '</span>';
      const time = w.createdAt ? new Date(w.createdAt).toLocaleString() : '-';
      return '<tr><td>' + (w.withdrawalNo || '-') + '</td><td>' + (w.memberNickname || '-') + '<br><small>' + (w.memberPhone || '') + '</small></td>' +
        '<td>¥' + (parseFloat(w.amount) || 0).toFixed(2) + '</td><td>' + (w.accountTypeText || w.accountType || '-') + '</td>' +
        '<td>' + statusCell + '</td><td>' + time + '</td>' +
        '<td><button class="btn btn-primary btn-sm" onclick="window.CommissionManagement.openWithdrawalDetail(' + w.id + ')">查看</button></td></tr>';
    }).join('');
  },

  renderWithdrawalPagination() {
    const p = document.getElementById('pagination');
    const cur = this.data.withdrawalPage;
    const total = this.data.withdrawalTotalPages;
    p.innerHTML = '<button class="btn btn-secondary" ' + (cur <= 1 ? 'disabled' : '') + ' onclick="window.CommissionManagement.withdrawalGoPage(' + (cur - 1) + ')">上一页</button>' +
      '<span style="margin:0 12px;">第 ' + cur + ' / ' + (total || 1) + ' 页</span>' +
      '<button class="btn btn-secondary" ' + (cur >= total ? 'disabled' : '') + ' onclick="window.CommissionManagement.withdrawalGoPage(' + (cur + 1) + ')">下一页</button>';
  },

  withdrawalGoPage(page) {
    if (page < 1 || page > this.data.withdrawalTotalPages) return;
    this.data.withdrawalPage = page;
    this.loadWithdrawals();
  },

  searchWithdrawals() {
    this.data.withdrawalSearch = document.getElementById('searchInput')?.value?.trim() || '';
    this.data.withdrawalStatus = document.getElementById('statusFilter')?.value || '';
    this.data.withdrawalPage = 1;
    this.loadWithdrawals();
  },

  resetWithdrawalFilters() {
    const si = document.getElementById('searchInput');
    const sf = document.getElementById('statusFilter');
    if (si) si.value = '';
    if (sf) sf.value = '';
    this.data.withdrawalSearch = '';
    this.data.withdrawalStatus = '';
    this.data.withdrawalPage = 1;
    this.loadWithdrawals();
  },

  async openWithdrawalDetail(id) {
    this.data.withdrawalCurrentId = id;
    try {
      const res = await fetch('/api/withdrawals/' + id, { headers: this.getAuthHeaders() });
      const result = await res.json();
      if (result.code !== 0 || !result.data?.withdrawal) {
        alert(result.message || '获取详情失败');
        return;
      }
      const w = result.data.withdrawal;
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      set('dWithdrawalNo', w.withdrawalNo || '-');
      set('dMember', (w.memberNickname || '-') + ' ' + (w.memberPhone || ''));
      set('dAmount', '¥' + (parseFloat(w.amount) || 0).toFixed(2));
      set('dAccountType', w.accountTypeText || w.accountType || '-');
      set('dAccountName', w.accountName || '-');
      set('dAccountNumber', w.accountNumber || '-');
      set('dStatus', w.statusText || w.status || '-');
      set('dCreatedAt', w.createdAt ? new Date(w.createdAt).toLocaleString() : '-');
      set('dRemark', w.remark || '-');
      set('dAdminRemark', w.adminRemark || '-');
      const bankRow = document.getElementById('dBankRow');
      if (bankRow) {
        bankRow.style.display = w.accountType === 'bank' && (w.bankName || w.bankBranch) ? 'flex' : 'none';
        const bn = document.getElementById('dBankName');
        if (bn) bn.textContent = (w.bankName || '') + ' ' + (w.bankBranch || '');
      }
      const autoFailPrefix = '[自动通过失败] ';
      const isAutoFail = (w.adminRemark || '').indexOf(autoFailPrefix) === 0;
      const autoFailRow = document.getElementById('dAutoFailReasonRow');
      const autoFailVal = document.getElementById('dAutoFailReason');
      if (autoFailRow) autoFailRow.style.display = isAutoFail ? 'flex' : 'none';
      if (autoFailVal) autoFailVal.textContent = isAutoFail ? (w.adminRemark.slice(autoFailPrefix.length) || '未知') : '';
      const remarkInput = document.getElementById('adminRemarkInput');
      if (remarkInput) remarkInput.value = w.adminRemark || '';
      const canApproveReject = w.status === 'pending';
      const canComplete = w.status === 'approved' || w.status === 'processing';
      const canCancel = w.accountType === 'wechat' && (w.status === 'approved' || w.status === 'completed');
      const btn = (id, show) => { const b = document.getElementById(id); if (b) b.style.display = show ? 'inline-block' : 'none'; };
      btn('btnApprove', canApproveReject);
      btn('btnReject', canApproveReject);
      btn('btnComplete', canComplete);
      btn('btnCancelTransfer', canCancel);
      document.getElementById('detailModal')?.classList.add('show');
    } catch (e) {
      console.error(e);
      alert('网络错误');
    }
  },

  closeWithdrawalDetail() {
    document.getElementById('detailModal')?.classList.remove('show');
    this.data.withdrawalCurrentId = null;
  },

  async doApprove() {
    const id = this.data.withdrawalCurrentId;
    if (!id || !confirm('确认通过该提现申请？')) return;
    try {
      const res = await fetch('/api/withdrawals/' + id + '/approve', { method: 'PUT', headers: this.getAuthHeaders(), body: '{}' });
      const result = await res.json();
      if (result.code === 0) { alert('已通过'); this.closeWithdrawalDetail(); this.loadWithdrawals(); }
      else alert(result.message || '失败');
    } catch (e) { console.error(e); alert('网络错误'); }
  },

  async doReject() {
    const id = this.data.withdrawalCurrentId;
    if (!id || !confirm('确认拒绝？佣金将退回用户可用余额。')) return;
    const adminRemark = document.getElementById('adminRemarkInput')?.value?.trim() || '';
    try {
      const res = await fetch('/api/withdrawals/' + id + '/reject', { method: 'PUT', headers: this.getAuthHeaders(), body: JSON.stringify({ adminRemark }) });
      const result = await res.json();
      if (result.code === 0) { alert('已拒绝'); this.closeWithdrawalDetail(); this.loadWithdrawals(); }
      else alert(result.message || '失败');
    } catch (e) { console.error(e); alert('网络错误'); }
  },

  async doComplete() {
    const id = this.data.withdrawalCurrentId;
    if (!id || !confirm('确认已线下打款完成？')) return;
    try {
      const res = await fetch('/api/withdrawals/' + id + '/complete', { method: 'PUT', headers: this.getAuthHeaders(), body: '{}' });
      const result = await res.json();
      if (result.code === 0) { alert('已标记完成'); this.closeWithdrawalDetail(); this.loadWithdrawals(); }
      else alert(result.message || '失败');
    } catch (e) { console.error(e); alert('网络错误'); }
  },

  async doCancelTransfer() {
    const id = this.data.withdrawalCurrentId;
    if (!id || !confirm('确认撤销该笔转账？撤销后资金退回商户，用户佣金退回可用。')) return;
    try {
      const res = await fetch('/api/withdrawals/' + id + '/cancel-transfer', { method: 'POST', headers: this.getAuthHeaders(), body: '{}' });
      const result = await res.json();
      if (result.code === 0) { alert(result.message || '已提交撤销'); this.closeWithdrawalDetail(); this.loadWithdrawals(); }
      else alert(result.message || '失败');
    } catch (e) { console.error(e); alert('网络错误'); }
  }
};
