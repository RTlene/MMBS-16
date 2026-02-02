// 推荐奖励管理数据
window.referralManagementData = {
    rewards: [],
    currentPage: 1,
    totalPages: 1,
    pageSize: 10,
    searchKeyword: '',
    typeFilter: '',
    statusFilter: '',
    rewardConfig: null
};

// 页面初始化
function initReferralManagement() {
    console.log('初始化推荐奖励管理页面');
    loadStats();
    loadRewards();
    loadRewardConfig();
    bindEvents();
}

// 绑定事件
function bindEvents() {
    // 搜索输入框回车事件
    document.getElementById('searchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchRewards();
        }
    });

    // 筛选条件变化事件
    document.getElementById('typeFilter').addEventListener('change', searchRewards);
    document.getElementById('statusFilter').addEventListener('change', searchRewards);
}

// 加载统计数据
async function loadStats() {
    try {
        const response = await fetch('/api/referral-rewards/stats', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            document.getElementById('totalRewards').textContent = result.data.total || 0;
            document.getElementById('pendingRewards').textContent = result.data.pending || 0;
            document.getElementById('paidRewards').textContent = result.data.paid || 0;
            document.getElementById('totalAmount').textContent = result.data.totalAmount || 0;
        }
    } catch (error) {
        console.error('加载统计数据失败:', error);
    }
}

// 加载推荐奖励列表
async function loadRewards() {
    try {
        const params = new URLSearchParams({
            page: window.referralManagementData.currentPage,
            limit: window.referralManagementData.pageSize,
            search: window.referralManagementData.searchKeyword,
            type: window.referralManagementData.typeFilter,
            status: window.referralManagementData.statusFilter
        });

        const response = await fetch(`/api/referral-rewards?${params}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            window.referralManagementData.rewards = result.data.rewards || [];
            window.referralManagementData.totalPages = result.data.totalPages || 1;
            renderRewardTable();
            renderPagination();
        } else {
            alert('加载推荐奖励列表失败: ' + result.message);
        }
    } catch (error) {
        console.error('加载推荐奖励列表失败:', error);
        alert('加载推荐奖励列表失败');
    }
}

// 加载奖励配置
async function loadRewardConfig() {
    try {
        const response = await fetch('/api/referral-rewards/config', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            window.referralManagementData.rewardConfig = result.data;
        }
    } catch (error) {
        console.error('加载奖励配置失败:', error);
    }
}

// 渲染推荐奖励表格
function renderRewardTable() {
    const tbody = document.getElementById('rewardTableBody');
    tbody.innerHTML = '';

    window.referralManagementData.rewards.forEach(reward => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${reward.id}</td>
            <td>${reward.referrer ? reward.referrer.nickname : '未知'}</td>
            <td>${reward.referee ? reward.referee.nickname : '未知'}</td>
            <td><span class="reward-type-badge">${getRewardTypeText(reward.rewardType)}</span></td>
            <td>${reward.rewardValue}</td>
            <td><span class="status-badge status-${reward.status}">${getStatusText(reward.status)}</span></td>
            <td>${reward.paidAt ? formatDate(reward.paidAt) : '-'}</td>
            <td>${formatDate(reward.createdAt)}</td>
            <td>
                ${reward.status === 'pending' ? 
                    `<button class="btn btn-success" onclick="payReward(${reward.id})">发放</button>` : 
                    ''
                }
                <button class="btn btn-primary" onclick="viewRewardDetail(${reward.id})">详情</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 渲染分页
function renderPagination() {
    const pagination = document.getElementById('pagination');
    pagination.innerHTML = '';

    const { currentPage, totalPages } = window.referralManagementData;

    // 上一页按钮
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '上一页';
    prevBtn.disabled = currentPage <= 1;
    prevBtn.onclick = () => {
        if (currentPage > 1) {
            window.referralManagementData.currentPage = currentPage - 1;
            loadRewards();
        }
    };
    pagination.appendChild(prevBtn);

    // 页码按钮
    for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.textContent = i;
        pageBtn.className = i === currentPage ? 'active' : '';
        pageBtn.onclick = () => {
            window.referralManagementData.currentPage = i;
            loadRewards();
        };
        pagination.appendChild(pageBtn);
    }

    // 下一页按钮
    const nextBtn = document.createElement('button');
    nextBtn.textContent = '下一页';
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.onclick = () => {
        if (currentPage < totalPages) {
            window.referralManagementData.currentPage = currentPage + 1;
            loadRewards();
        }
    };
    pagination.appendChild(nextBtn);
}

// 搜索推荐奖励
function searchRewards() {
    window.referralManagementData.searchKeyword = document.getElementById('searchInput').value;
    window.referralManagementData.typeFilter = document.getElementById('typeFilter').value;
    window.referralManagementData.statusFilter = document.getElementById('statusFilter').value;
    window.referralManagementData.currentPage = 1;
    loadRewards();
}

// 显示奖励配置模态框
function showRewardConfigModal() {
    document.getElementById('rewardConfigModal').classList.add('show');
    updateRewardConfig();
    
    // 如果有配置，填充表单
    if (window.referralManagementData.rewardConfig) {
        fillRewardConfig();
    }
}

// 更新奖励配置界面
function updateRewardConfig() {
    const type = document.getElementById('rewardType').value;
    const configDiv = document.getElementById('rewardConfig');
    
    let configHTML = '';
    
    switch (type) {
        case 'points':
            configHTML = `
                <div class="config-item">
                    <label>推荐奖励积分:</label>
                    <input type="number" id="referrerPoints" min="0" placeholder="例如: 100">
                </div>
                <div class="config-item">
                    <label>被推荐人奖励积分:</label>
                    <input type="number" id="refereePoints" min="0" placeholder="例如: 50">
                </div>
            `;
            break;
        case 'cash':
            configHTML = `
                <div class="config-item">
                    <label>推荐奖励金额:</label>
                    <input type="number" id="referrerAmount" min="0" step="0.01" placeholder="例如: 10.00">
                </div>
                <div class="config-item">
                    <label>被推荐人奖励金额:</label>
                    <input type="number" id="refereeAmount" min="0" step="0.01" placeholder="例如: 5.00">
                </div>
            `;
            break;
        case 'coupon':
            configHTML = `
                <div class="config-item">
                    <label>推荐人优惠券ID:</label>
                    <input type="number" id="referrerCouponId" min="1" placeholder="例如: 1">
                </div>
                <div class="config-item">
                    <label>被推荐人优惠券ID:</label>
                    <input type="number" id="refereeCouponId" min="1" placeholder="例如: 2">
                </div>
            `;
            break;
    }
    
    configDiv.innerHTML = configHTML;
}

// 填充奖励配置
function fillRewardConfig() {
    const config = window.referralManagementData.rewardConfig;
    if (!config) return;
    
    document.getElementById('rewardType').value = config.type || 'points';
    document.getElementById('expireDays').value = config.expireDays || 30;
    document.getElementById('isEnabled').value = config.isEnabled ? 'true' : 'false';
    
    updateRewardConfig();
    
    // 填充具体配置值
    if (config.type === 'points') {
        if (config.referrerPoints) document.getElementById('referrerPoints').value = config.referrerPoints;
        if (config.refereePoints) document.getElementById('refereePoints').value = config.refereePoints;
    } else if (config.type === 'cash') {
        if (config.referrerAmount) document.getElementById('referrerAmount').value = config.referrerAmount;
        if (config.refereeAmount) document.getElementById('refereeAmount').value = config.refereeAmount;
    } else if (config.type === 'coupon') {
        if (config.referrerCouponId) document.getElementById('referrerCouponId').value = config.referrerCouponId;
        if (config.refereeCouponId) document.getElementById('refereeCouponId').value = config.refereeCouponId;
    }
}

// 保存奖励配置
async function saveRewardConfig() {
    const type = document.getElementById('rewardType').value;
    const expireDays = parseInt(document.getElementById('expireDays').value);
    const isEnabled = document.getElementById('isEnabled').value === 'true';
    
    const config = {
        type: type,
        expireDays: expireDays,
        isEnabled: isEnabled
    };
    
    // 根据类型添加具体配置
    switch (type) {
        case 'points':
            const referrerPoints = document.getElementById('referrerPoints').value;
            const refereePoints = document.getElementById('refereePoints').value;
            if (referrerPoints) config.referrerPoints = parseInt(referrerPoints);
            if (refereePoints) config.refereePoints = parseInt(refereePoints);
            break;
        case 'cash':
            const referrerAmount = document.getElementById('referrerAmount').value;
            const refereeAmount = document.getElementById('refereeAmount').value;
            if (referrerAmount) config.referrerAmount = parseFloat(referrerAmount);
            if (refereeAmount) config.refereeAmount = parseFloat(refereeAmount);
            break;
        case 'coupon':
            const referrerCouponId = document.getElementById('referrerCouponId').value;
            const refereeCouponId = document.getElementById('refereeCouponId').value;
            if (referrerCouponId) config.referrerCouponId = parseInt(referrerCouponId);
            if (refereeCouponId) config.refereeCouponId = parseInt(refereeCouponId);
            break;
    }

    try {
        const response = await fetch('/api/referral-rewards/config', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(config)
        });
        
        const result = await response.json();
        
        if (result.code === 0) {
            alert('配置保存成功');
            closeRewardConfigModal();
            loadRewardConfig();
        } else {
            alert('配置保存失败: ' + result.message);
        }
    } catch (error) {
        console.error('保存奖励配置失败:', error);
        alert('配置保存失败');
    }
}

// 发放奖励
async function payReward(rewardId) {
    if (!confirm('确定要发放这个奖励吗？')) return;

    try {
        const response = await fetch(`/api/referral-rewards/${rewardId}/pay`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const result = await response.json();
        
        if (result.code === 0) {
            alert('奖励发放成功');
            loadRewards();
            loadStats();
        } else {
            alert('奖励发放失败: ' + result.message);
        }
    } catch (error) {
        console.error('发放奖励失败:', error);
        alert('奖励发放失败');
    }
}

// 查看奖励详情
function viewRewardDetail(rewardId) {
    const reward = window.referralManagementData.rewards.find(r => r.id === rewardId);
    if (!reward) return;

    let detailInfo = `奖励ID: ${reward.id}\n`;
    detailInfo += `推荐人: ${reward.referrer ? reward.referrer.nickname : '未知'}\n`;
    detailInfo += `被推荐人: ${reward.referee ? reward.referee.nickname : '未知'}\n`;
    detailInfo += `奖励类型: ${getRewardTypeText(reward.rewardType)}\n`;
    detailInfo += `奖励值: ${reward.rewardValue}\n`;
    detailInfo += `状态: ${getStatusText(reward.status)}\n`;
    detailInfo += `创建时间: ${formatDate(reward.createdAt)}\n`;
    if (reward.paidAt) {
        detailInfo += `发放时间: ${formatDate(reward.paidAt)}\n`;
    }

    alert(detailInfo);
}

// 关闭奖励配置模态框
function closeRewardConfigModal() {
    document.getElementById('rewardConfigModal').classList.remove('show');
}

// 工具函数
function getRewardTypeText(type) {
    const typeMap = {
        'points': '积分',
        'cash': '现金',
        'coupon': '优惠券'
    };
    return typeMap[type] || type;
}

function getStatusText(status) {
    const statusMap = {
        'pending': '待发放',
        'paid': '已发放',
        'expired': '已过期'
    };
    return statusMap[status] || status;
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN', { hour12: false });
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initReferralManagement();
});