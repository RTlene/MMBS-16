// 全局数据存储
window.refundManagementData = {
    refunds: [],
    currentPage: 1,
    totalPages: 1,
    pageSize: 10,
    searchKeyword: '',
    statusFilter: '',
    methodFilter: '',
    startDate: '',
    endDate: '',
    currentRefund: null
};

// 页面初始化
function initRefundManagement() {
    console.log('初始化退款管理页面');
    loadStats();
    loadRefunds();
    bindEvents();
}

// 绑定事件
function bindEvents() {
    // 搜索输入框回车事件
    document.getElementById('searchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchRefunds();
        }
    });

    // 筛选器变化事件
    document.getElementById('statusFilter').addEventListener('change', function() {
        searchRefunds();
    });

    document.getElementById('methodFilter').addEventListener('change', function() {
        searchRefunds();
    });
}

// 获取认证头
function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
}

// 加载统计信息
async function loadStats() {
    try {
        const response = await fetch('/api/refund-records/stats/overview', {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.code === 0) {
            renderStats(result.data);
        } else {
            console.error('加载统计信息失败:', result.message);
        }
    } catch (error) {
        console.error('加载统计信息失败:', error);
    }
}

// 渲染统计信息
function renderStats(data) {
    const statsGrid = document.getElementById('statsGrid');
    statsGrid.innerHTML = `
        <div class="stat-card">
            <div class="stat-value">${data.totalRefunds}</div>
            <div class="stat-label">总退款记录</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${data.pendingRefunds}</div>
            <div class="stat-label">待处理</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${data.completedRefunds}</div>
            <div class="stat-label">已完成</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">¥${data.totalRefundAmount}</div>
            <div class="stat-label">总退款金额</div>
        </div>
    `;
}

// 加载退款记录列表
async function loadRefunds() {
    try {
        const params = new URLSearchParams({
            page: window.refundManagementData.currentPage,
            limit: window.refundManagementData.pageSize,
            search: window.refundManagementData.searchKeyword,
            status: window.refundManagementData.statusFilter,
            method: window.refundManagementData.methodFilter,
            startDate: window.refundManagementData.startDate,
            endDate: window.refundManagementData.endDate
        });

        const response = await fetch(`/api/refund-records?${params}`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.code === 0) {
            window.refundManagementData.refunds = result.data.refunds || [];
            window.refundManagementData.totalPages = result.data.totalPages || 1;
            renderRefunds();
            renderPagination();
        } else {
            console.error('加载退款记录列表失败:', result.message);
            alert('加载退款记录列表失败: ' + result.message);
        }
    } catch (error) {
        console.error('加载退款记录列表失败:', error);
        alert('加载退款记录列表失败: ' + error.message);
    }
}

// 渲染退款记录列表
function renderRefunds() {
    const tbody = document.getElementById('refundTableBody');
    
    if (window.refundManagementData.refunds.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 40px; color: #999;">
                    暂无数据
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = window.refundManagementData.refunds.map(refund => {
        const statusMap = {
            'pending': { text: '待处理', class: 'status-pending' },
            'processing': { text: '处理中', class: 'status-processing' },
            'completed': { text: '已完成', class: 'status-completed' },
            'failed': { text: '失败', class: 'status-failed' },
            'cancelled': { text: '已取消', class: 'status-cancelled' }
        };

        const methodMap = {
            'original': '原路返回',
            'points': '积分退款',
            'commission': '佣金退款'
        };

        const status = statusMap[refund.status] || { text: refund.status, class: 'status-pending' };
        const method = methodMap[refund.method] || refund.method;

        return `
            <tr>
                <td>${refund.refundNo}</td>
                <td>
                    <div>
                        <div style="font-weight: 500;">${refund.order?.orderNo || '-'}</div>
                        <div style="font-size: 12px; color: #666;">${refund.order?.createdAt ? new Date(refund.order.createdAt).toLocaleDateString() : '-'}</div>
                    </div>
                </td>
                <td>
                    <div>
                        <div style="font-weight: 500;">${refund.member?.nickname || '-'}</div>
                        <div style="font-size: 12px; color: #666;">${refund.member?.phone || '-'}</div>
                    </div>
                </td>
                <td style="font-weight: 500; color: #ff4d4f;">¥${refund.amount}</td>
                <td>
                    <span class="method-badge">${method}</span>
                </td>
                <td>
                    <span class="status-badge ${status.class}">${status.text}</span>
                </td>
                <td>${refund.createdAt ? new Date(refund.createdAt).toLocaleString() : '-'}</td>
                <td>${refund.completedAt ? new Date(refund.completedAt).toLocaleString() : '-'}</td>
                <td>
                    <div style="display: flex; gap: 5px;">
                        <button class="btn btn-sm btn-primary" onclick="viewRefundDetail(${refund.id})" title="查看详情">
                            👁️
                        </button>
                        ${refund.status === 'pending' ? `
                            <button class="btn btn-sm btn-success" onclick="processRefund(${refund.id})" title="处理">
                                ⚙️
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// 渲染分页
function renderPagination() {
    const pagination = document.getElementById('pagination');
    const { currentPage, totalPages } = window.refundManagementData;
    
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    const pageButtons = [];
    for (let i = startPage; i <= endPage; i++) {
        pageButtons.push(`
            <button class="btn ${i === currentPage ? 'btn-primary' : 'btn-outline-primary'}" 
                    onclick="goToPage(${i})" ${i === currentPage ? 'disabled' : ''}>
                ${i}
            </button>
        `);
    }
    
    pagination.innerHTML = `
        <div style="display: flex; gap: 5px; align-items: center;">
            <button class="btn btn-outline-primary" onclick="goToPage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>
                上一页
            </button>
            ${pageButtons.join('')}
            <button class="btn btn-outline-primary" onclick="goToPage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>
                下一页
            </button>
        </div>
    `;
}

// 搜索退款记录
function searchRefunds() {
    window.refundManagementData.searchKeyword = document.getElementById('searchInput').value;
    window.refundManagementData.statusFilter = document.getElementById('statusFilter').value;
    window.refundManagementData.methodFilter = document.getElementById('methodFilter').value;
    window.refundManagementData.startDate = document.getElementById('startDate').value;
    window.refundManagementData.endDate = document.getElementById('endDate').value;
    window.refundManagementData.currentPage = 1;
    loadRefunds();
}

// 重置筛选器
function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('statusFilter').value = '';
    document.getElementById('methodFilter').value = '';
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
    searchRefunds();
}

// 跳转页面
function goToPage(page) {
    if (page >= 1 && page <= window.refundManagementData.totalPages) {
        window.refundManagementData.currentPage = page;
        loadRefunds();
    }
}

// 查看退款详情
async function viewRefundDetail(id) {
    try {
        const response = await fetch(`/api/refund-records/${id}`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.code === 0) {
            window.refundManagementData.currentRefund = result.data.refundRecord;
            fillRefundDetail(result.data.refundRecord);
            document.getElementById('refundDetailModal').style.display = 'flex';
        } else {
            alert('获取退款详情失败: ' + result.message);
        }
    } catch (error) {
        console.error('获取退款详情失败:', error);
        alert('获取退款详情失败: ' + error.message);
    }
}

// 填充退款详情
function fillRefundDetail(refund) {
    document.getElementById('detailRefundNo').textContent = refund.refundNo || '-';
    document.getElementById('detailOrderNo').textContent = refund.order?.orderNo || '-';
    document.getElementById('detailMemberName').textContent = refund.member?.nickname || '-';
    document.getElementById('detailMemberPhone').textContent = refund.member?.phone || '-';
    
    const statusMap = {
        'pending': '待处理',
        'processing': '处理中',
        'completed': '已完成',
        'failed': '失败',
        'cancelled': '已取消'
    };
    document.getElementById('detailRefundStatus').textContent = statusMap[refund.status] || refund.status;
    document.getElementById('detailCreatedAt').textContent = refund.createdAt ? new Date(refund.createdAt).toLocaleString() : '-';
    
    document.getElementById('detailAmount').textContent = refund.amount ? `¥${refund.amount}` : '-';
    
    const methodMap = {
        'original': '原路返回',
        'points': '积分退款',
        'commission': '佣金退款'
    };
    document.getElementById('detailMethod').textContent = methodMap[refund.method] || refund.method;
    document.getElementById('detailThirdPartyRefundNo').textContent = refund.thirdPartyRefundNo || '-';
    document.getElementById('detailReason').textContent = refund.reason || '-';
    
    document.getElementById('detailProcessor').textContent = refund.processor?.username || '-';
    document.getElementById('detailProcessedAt').textContent = refund.processedAt ? new Date(refund.processedAt).toLocaleString() : '-';
    document.getElementById('detailCompletedAt').textContent = refund.completedAt ? new Date(refund.completedAt).toLocaleString() : '-';
    document.getElementById('detailRemark').textContent = refund.remark || '-';
}

// 关闭退款详情模态框
function closeRefundDetailModal() {
    document.getElementById('refundDetailModal').style.display = 'none';
    window.refundManagementData.currentRefund = null;
}

// 显示处理退款模态框
function showProcessRefundModal() {
    if (!window.refundManagementData.currentRefund) return;
    
    const refund = window.refundManagementData.currentRefund;
    document.getElementById('processStatus').value = '';
    document.getElementById('thirdPartyRefundNo').value = refund.thirdPartyRefundNo || '';
    document.getElementById('processRemark').value = '';
    
    document.getElementById('processRefundModal').style.display = 'flex';
}

// 关闭处理退款模态框
function closeProcessRefundModal() {
    document.getElementById('processRefundModal').style.display = 'none';
}

// 提交处理退款
async function submitProcessRefund() {
    if (!window.refundManagementData.currentRefund) return;
    
    const processStatus = document.getElementById('processStatus').value;
    const thirdPartyRefundNo = document.getElementById('thirdPartyRefundNo').value;
    const processRemark = document.getElementById('processRemark').value;
    
    if (!processStatus) {
        alert('请选择处理结果');
        return;
    }
    
    try {
        const response = await fetch(`/api/refund-records/${window.refundManagementData.currentRefund.id}/process`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                status: processStatus,
                thirdPartyRefundNo: thirdPartyRefundNo,
                remark: processRemark
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.code === 0) {
            alert('处理成功');
            closeProcessRefundModal();
            closeRefundDetailModal();
            loadRefunds();
            loadStats();
        } else {
            alert('处理失败: ' + result.message);
        }
    } catch (error) {
        console.error('处理退款失败:', error);
        alert('处理失败: ' + error.message);
    }
}

// 处理退款
async function processRefund(id) {
    try {
        const response = await fetch(`/api/refund-records/${id}`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.code === 0) {
            window.refundManagementData.currentRefund = result.data.refundRecord;
            showProcessRefundModal();
        } else {
            alert('获取退款信息失败: ' + result.message);
        }
    } catch (error) {
        console.error('获取退款信息失败:', error);
        alert('获取退款信息失败: ' + error.message);
    }
}

// 将函数暴露到全局作用域
window.initRefundManagement = initRefundManagement;
window.searchRefunds = searchRefunds;
window.resetFilters = resetFilters;
window.goToPage = goToPage;
window.viewRefundDetail = viewRefundDetail;
window.closeRefundDetailModal = closeRefundDetailModal;
window.showProcessRefundModal = showProcessRefundModal;
window.closeProcessRefundModal = closeProcessRefundModal;
window.submitProcessRefund = submitProcessRefund;
window.processRefund = processRefund;

// 页面加载完成后自动初始化
document.addEventListener('DOMContentLoaded', function() {
    initRefundManagement();
});