/**
 * Dashboard: load real stats from /api/dashboard/stats and render.
 */
window.Dashboard = {
  async init() {
    const token = localStorage.getItem('token');
    if (!token) return;

    const summaryEl = document.getElementById('dashboard-summary');
    const todayOrdersEl = document.getElementById('dashboard-today-orders');
    const totalMembersEl = document.getElementById('dashboard-total-members');
    const totalProductsEl = document.getElementById('dashboard-total-products');
    const todaySalesEl = document.getElementById('dashboard-today-sales');
    const loadingEl = document.getElementById('dashboard-recent-loading');
    const tableEl = document.getElementById('dashboard-recent-table');
    const tbodyEl = document.getElementById('dashboard-recent-orders-body');
    const emptyEl = document.getElementById('dashboard-recent-empty');

    try {
      const res = await fetch('/api/dashboard/stats', {
        headers: { Authorization: 'Bearer ' + token }
      });
      const json = await res.json();

      if (json.code !== 0) {
        todayOrdersEl.textContent = '-';
        totalMembersEl.textContent = '-';
        totalProductsEl.textContent = '-';
        todaySalesEl.textContent = '-';
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'block';
        emptyEl.textContent = '获取数据失败';
        return;
      }

      const d = json.data;
      todayOrdersEl.textContent = d.todayOrders != null ? d.todayOrders : 0;
      totalMembersEl.textContent = d.totalMembers != null ? d.totalMembers : 0;
      totalProductsEl.textContent = d.totalProducts != null ? d.totalProducts : 0;
      todaySalesEl.textContent = d.todaySales != null ? '￥' + Number(d.todaySales).toFixed(2) : '￥0.00';

      loadingEl.style.display = 'none';
      if (d.recentOrders && d.recentOrders.length > 0) {
        tableEl.style.display = 'table';
        emptyEl.style.display = 'none';
        tbodyEl.innerHTML = d.recentOrders.map(o => {
          const time = o.createdAt ? new Date(o.createdAt).toLocaleString('zh-CN', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
          }) : '-';
          const amount = o.amount != null ? '￥' + Number(o.amount).toFixed(2) : '-';
          return '<tr><td>' + escapeHtml(o.orderNo || '-') + '</td><td>' + escapeHtml(o.user || '-') +
            '</td><td>' + amount + '</td><td>' + escapeHtml(o.status || '-') +
            '</td><td>' + time + '</td></tr>';
        }).join('');
      } else {
        tableEl.style.display = 'none';
        emptyEl.style.display = 'block';
        emptyEl.textContent = '暂无订单';
      }
    } catch (e) {
      console.error('[Dashboard] load error:', e);
      todayOrdersEl.textContent = '-';
      totalMembersEl.textContent = '-';
      totalProductsEl.textContent = '-';
      todaySalesEl.textContent = '-';
      loadingEl.style.display = 'none';
      emptyEl.style.display = 'block';
      emptyEl.textContent = '加载失败，请稍后重试';
    }
  }
};

function escapeHtml(s) {
  if (s == null) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
