// 全局数据存储
window.returnManagementData = {
    returns: [],
    currentPage: 1,
    totalPages: 1,
    pageSize: 10,
    searchKeyword: '',
    statusFilter: '',
    reasonFilter: '',
    startDate: '',
    endDate: '',
    currentReturn: null
};

// 页面初始化
function initReturnManagement() {
    console.log('初始化退货管理页面');
    loadStats();
    loadReturns();
    bindEvents();
}

// 绑定事件
function bindEvents() {
    // 搜索输入框回车事件
    document.getElementById('searchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchReturns();
        }
    });

    // 筛选器变化事件
    document.getElementById('statusFilter').addEventListener('change', function() {
        searchReturns();
    });

    document.getElementById('reasonFilter').addEventListener('change', function() {
        searchReturns();
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
        const response = await fetch('/api/return-requests/stats/overview', {
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
            <div class="stat-value">${data.totalReturns}</div>
            <div class="stat-label">总退货申请</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${data.pendingReturns}</div>
            <div class="stat-label">待处理</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${data.completedReturns}</div>
            <div class="stat-label">已完成</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">¥${data.totalRefundAmount}</div>
            <div class="stat-label">总退款金额</div>
        </div>
    `;
}

// 加载退货申请列表
async function loadReturns() {
    try {
        const params = new URLSearchParams({
            page: window.returnManagementData.currentPage,
            limit: window.returnManagementData.pageSize,
            search: window.returnManagementData.searchKeyword,
            status: window.returnManagementData.statusFilter,
            reason: window.returnManagementData.reasonFilter,
            startDate: window.returnManagementData.startDate,
            endDate: window.returnManagementData.endDate
        });

        const response = await fetch(`/api/return-requests?${params}`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.code === 0) {
            window.returnManagementData.returns = result.data.returns || [];
            window.returnManagementData.totalPages = result.data.totalPages || 1;
            renderReturns();
            renderPagination();
        } else {
            console.error('加载退货申请列表失败:', result.message);
            alert('加载退货申请列表失败: ' + result.message);
        }
    } catch (error) {
        console.error('加载退货申请列表失败:', error);
        alert('加载退货申请列表失败: ' + error.message);
    }
}

// 渲染退货申请列表
function renderReturns() {
    const tbody = document.getElementById('returnTableBody');
    
    if (window.returnManagementData.returns.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 40px; color: #999;">
                    暂无数据
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = window.returnManagementData.returns.map(returnRequest => {
        const statusMap = {
            'pending': { text: '待审核', class: 'status-pending' },
            'approved': { text: '已通过', class: 'status-approved' },
            'rejected': { text: '已拒绝', class: 'status-rejected' },
            'processing': { text: '处理中', class: 'status-processing' },
            'completed': { text: '已完成', class: 'status-completed' },
            'cancelled': { text: '已取消', class: 'status-cancelled' }
        };

        const reasonMap = {
            'quality': '质量问题',
            'damage': '商品损坏',
            'wrong_item': '发错商品',
            'not_satisfied': '不满意',
            'other': '其他'
        };

        const status = statusMap[returnRequest.status] || { text: returnRequest.status, class: 'status-pending' };
        const reason = reasonMap[returnRequest.reason] || returnRequest.reason;

        return `
            <tr>
                <td>${returnRequest.returnNo}</td>
                <td>
                    <div>
                        <div style="font-weight: 500;">${returnRequest.order?.orderNo || '-'}</div>
                        <div style="font-size: 12px; color: #666;">${returnRequest.order?.createdAt ? new Date(returnRequest.order.createdAt).toLocaleDateString() : '-'}</div>
                    </div>
                </td>
                <td>
                    <div>
                        <div style="font-weight: 500;">${returnRequest.member?.nickname || '-'}</div>
                        <div style="font-size: 12px; color: #666;">${returnRequest.member?.phone || '-'}</div>
                    </div>
                </td>
                <td>
                    <div>
                        <div style="font-weight: 500;">${returnRequest.product?.name || '-'}</div>
                        <div style="font-size: 12px; color: #666;">SKU: ${returnRequest.product?.sku || '-'}</div>
                    </div>
                </td>
                <td>${returnRequest.quantity}</td>
                <td>
                    <span class="reason-badge">${reason}</span>
                </td>
                <td>
                    <span class="status-badge ${status.class}">${status.text}</span>
                </td>
                <td>${returnRequest.createdAt ? new Date(returnRequest.createdAt).toLocaleString() : '-'}</td>
                <td>
                    <div style="display: flex; gap: 5px;">
                        <button class="btn btn-sm btn-primary" onclick="viewReturnDetail(${returnRequest.id})" title="查看详情">
                            👁️
                        </button>
                        ${returnRequest.status === 'pending' ? `
                            <button class="btn btn-sm btn-success" onclick="processReturn(${returnRequest.id}, 'approved')" title="通过">
                                ✓
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="processReturn(${returnRequest.id}, 'rejected')" title="拒绝">
                                ✗
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
    const { currentPage, totalPages } = window.returnManagementData;
    
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

// 搜索退货申请
function searchReturns() {
    window.returnManagementData.searchKeyword = document.getElementById('searchInput').value;
    window.returnManagementData.statusFilter = document.getElementById('statusFilter').value;
    window.returnManagementData.reasonFilter = document.getElementById('reasonFilter').value;
    window.returnManagementData.startDate = document.getElementById('startDate').value;
    window.returnManagementData.endDate = document.getElementById('endDate').value;
    window.returnManagementData.currentPage = 1;
    loadReturns();
}

// 重置筛选器
function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('statusFilter').value = '';
    document.getElementById('reasonFilter').value = '';
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
    searchReturns();
}

// 跳转页面
function goToPage(page) {
    if (page >= 1 && page <= window.returnManagementData.totalPages) {
        window.returnManagementData.currentPage = page;
        loadReturns();
    }
}

// 查看退货详情
async function viewReturnDetail(id) {
    try {
        const response = await fetch(`/api/return-requests/${id}`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.code === 0) {
            window.returnManagementData.currentReturn = result.data.returnRequest;
            fillReturnDetail(result.data.returnRequest);
            document.getElementById('returnDetailModal').style.display = 'flex';
        } else {
            alert('获取退货详情失败: ' + result.message);
        }
    } catch (error) {
        console.error('获取退货详情失败:', error);
        alert('获取退货详情失败: ' + error.message);
    }
}

// 填充退货详情
function fillReturnDetail(returnRequest) {
    document.getElementById('detailReturnNo').textContent = returnRequest.returnNo || '-';
    document.getElementById('detailOrderNo').textContent = returnRequest.order?.orderNo || '-';
    document.getElementById('detailMemberName').textContent = returnRequest.member?.nickname || '-';
    document.getElementById('detailMemberPhone').textContent = returnRequest.member?.phone || '-';
    
    const statusMap = {
        'pending': '待审核',
        'approved': '已通过',
        'rejected': '已拒绝',
        'processing': '处理中',
        'completed': '已完成',
        'cancelled': '已取消'
    };
    document.getElementById('detailReturnStatus').textContent = statusMap[returnRequest.status] || returnRequest.status;
    document.getElementById('detailCreatedAt').textContent = returnRequest.createdAt ? new Date(returnRequest.createdAt).toLocaleString() : '-';
    
    document.getElementById('detailProductName').textContent = returnRequest.product?.name || '-';
    document.getElementById('detailQuantity').textContent = returnRequest.quantity || '-';
    document.getElementById('detailUnitPrice').textContent = returnRequest.order?.unitPrice ? `¥${returnRequest.order.unitPrice}` : '-';
    document.getElementById('detailRefundAmount').textContent = returnRequest.refundAmount ? `¥${returnRequest.refundAmount}` : '-';
    
    const reasonMap = {
        'quality': '质量问题',
        'damage': '商品损坏',
        'wrong_item': '发错商品',
        'not_satisfied': '不满意',
        'other': '其他'
    };
    document.getElementById('detailReason').textContent = reasonMap[returnRequest.reason] || returnRequest.reason;
    document.getElementById('detailReasonDetail').textContent = returnRequest.reasonDetail || '-';
    
    // 显示退货凭证图片
    const imagesContainer = document.getElementById('detailImages');
    if (returnRequest.images && returnRequest.images.length > 0) {
        imagesContainer.innerHTML = returnRequest.images.map(image => `
            <div class="image-item">
                <img src="${image}" alt="退货凭证" onclick="window.open('${image}', '_blank')">
            </div>
        `).join('');
    } else {
        imagesContainer.innerHTML = '<div style="color: #999;">暂无图片</div>';
    }
    
    document.getElementById('detailProcessor').textContent = returnRequest.processor?.username || '-';
    document.getElementById('detailProcessedAt').textContent = returnRequest.processedAt ? new Date(returnRequest.processedAt).toLocaleString() : '-';
    document.getElementById('detailCompletedAt').textContent = returnRequest.completedAt ? new Date(returnRequest.completedAt).toLocaleString() : '-';
    document.getElementById('detailAdminRemark').textContent = returnRequest.adminRemark || '-';
}

// 关闭退货详情模态框
function closeReturnDetailModal() {
    document.getElementById('returnDetailModal').style.display = 'none';
    window.returnManagementData.currentReturn = null;
}

// 显示处理模态框
function showProcessModal() {
    if (!window.returnManagementData.currentReturn) return;
    
    const returnRequest = window.returnManagementData.currentReturn;
    document.getElementById('refundAmount').value = returnRequest.refundAmount || '';
    document.getElementById('refundMethod').value = returnRequest.refundMethod || 'original';
    document.getElementById('adminRemark').value = '';
    
    document.getElementById('processModal').style.display = 'flex';
}

// 关闭处理模态框
function closeProcessModal() {
    document.getElementById('processModal').style.display = 'none';
}

// 提交处理
async function submitProcess() {
    if (!window.returnManagementData.currentReturn) return;
    
    const processStatus = document.getElementById('processStatus').value;
    const refundAmount = document.getElementById('refundAmount').value;
    const refundMethod = document.getElementById('refundMethod').value;
    const adminRemark = document.getElementById('adminRemark').value;
    
    if (!processStatus) {
        alert('请选择处理结果');
        return;
    }
    
    try {
        const response = await fetch(`/api/return-requests/${window.returnManagementData.currentReturn.id}/process`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                status: processStatus,
                refundAmount: refundAmount ? parseFloat(refundAmount) : null,
                refundMethod: refundMethod,
                adminRemark: adminRemark
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.code === 0) {
            alert('处理成功');
            closeProcessModal();
            closeReturnDetailModal();
            loadReturns();
            loadStats();
        } else {
            alert('处理失败: ' + result.message);
        }
    } catch (error) {
        console.error('处理退货申请失败:', error);
        alert('处理失败: ' + error.message);
    }
}

// 快速处理退货申请
async function processReturn(id, status) {
    if (!confirm(`确定要${status === 'approved' ? '通过' : '拒绝'}这个退货申请吗？`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/return-requests/${id}/process`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                status: status,
                adminRemark: `快速${status === 'approved' ? '通过' : '拒绝'}`
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.code === 0) {
            alert('处理成功');
            loadReturns();
            loadStats();
        } else {
            alert('处理失败: ' + result.message);
        }
    } catch (error) {
        console.error('处理退货申请失败:', error);
        alert('处理失败: ' + error.message);
    }
}

// 将函数暴露到全局作用域
window.initReturnManagement = initReturnManagement;
window.searchReturns = searchReturns;
window.resetFilters = resetFilters;
window.goToPage = goToPage;
window.viewReturnDetail = viewReturnDetail;
window.closeReturnDetailModal = closeReturnDetailModal;
window.showProcessModal = showProcessModal;
window.closeProcessModal = closeProcessModal;
window.submitProcess = submitProcess;
window.processReturn = processReturn;

// 页面加载完成后自动初始化
document.addEventListener('DOMContentLoaded', function() {
    initReturnManagement();
});