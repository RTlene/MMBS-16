/**
 * 用户管理模块
 * 负责用户管理页面的所有功能
 */

// 初始化全局数据存储
if (typeof window.userManagementData === 'undefined') {
    window.userManagementData = {
        users: [],
        currentPage: 1,
        pageSize: 10,
        totalCount: 0
    };
}

// 获取认证头
function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

/**
 * 初始化用户管理模块
 */
function initUserManagement() {
    console.log('用户管理模块初始化');
    loadUsers();
    bindEvents();
}

/**
 * 绑定事件
 */
function bindEvents() {
    // 搜索框回车事件
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchUsers();
            }
        });
    }
}

/**
 * 加载用户列表
 */
async function loadUsers() {
    try {
        showLoading();
        
        const response = await fetch('/api/users', {
            headers: getAuthHeaders()
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('API返回的数据:', data);
        
        // 根据实际API响应格式调整
        if (data.code === 0) {
            // 正确提取 users 数组
            window.userManagementData.users = data.data.users || [];
            window.userManagementData.totalCount = data.data.total || 0;
        } else {
            window.userManagementData.users = [];
            window.userManagementData.totalCount = 0;
        }
        
        console.log('处理后的用户数据:', window.userManagementData);
        
        renderUserTable();
        updatePagination();
        
    } catch (error) {
        console.error('加载用户列表失败:', error);
        showError('加载用户列表失败，请稍后重试');
    }
}

/**
 * 渲染用户表格
 */
function renderUserTable() {
    const tbody = document.getElementById('userTableBody');
    if (!tbody) return;
    
    if (window.userManagementData.users.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px; color: #6c757d;">
                    暂无数据
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = window.userManagementData.users.map(user => `
        <tr>
            <td>${user.id}</td>
            <td>${user.username}</td>
            <td>${user.email || '-'}</td>
            <td><span class="role-badge role-${user.role}">${getRoleText(user.role)}</span></td>
            <td><span class="status-badge status-${user.status}">${getStatusText(user.status)}</span></td>
            <td>${formatDate(user.createdAt)}</td>
            <td>
                <button class="btn btn-sm btn-warning" onclick="editUser(${user.id})">编辑</button>
                <button class="btn btn-sm btn-danger" onclick="deleteUser(${user.id})">删除</button>
            </td>
        </tr>
    `).join('');
}

/**
 * 更新分页信息
 */
function updatePagination() {
    const totalCountElement = document.getElementById('totalCount');
    if (totalCountElement) {
        totalCountElement.textContent = window.userManagementData.totalCount;
    }
    
    // 更新分页按钮状态
    const prevBtn = document.querySelector('.pagination-controls .btn:first-child');
    const nextBtn = document.querySelector('.pagination-controls .btn:last-child');
    
    if (prevBtn) {
        prevBtn.disabled = window.userManagementData.currentPage <= 1;
    }
    if (nextBtn) {
        nextBtn.disabled = window.userManagementData.currentPage * window.userManagementData.pageSize >= window.userManagementData.totalCount;
    }
}

/**
 * 搜索用户
 */
function searchUsers() {
    const searchInput = document.getElementById('searchInput');
    const keyword = searchInput ? searchInput.value.trim() : '';
    
    if (keyword) {
        // 这里应该调用搜索API，暂时使用前端过滤
        const filteredUsers = window.userManagementData.users.filter(user => 
            user.username.toLowerCase().includes(keyword.toLowerCase())
        );
        window.userManagementData.users = filteredUsers;
        renderUserTable();
    } else {
        loadUsers();
    }
}

/**
 * 打开新增用户模态框
 */
function openAddUserModal() {
    const modal = document.getElementById('addUserModal');
    if (modal) {
        modal.style.display = 'flex';
        // 清空表单
        const form = document.getElementById('addUserForm');
        if (form) {
            form.reset();
        }
    }
}

/**
 * 关闭新增用户模态框
 */
function closeAddUserModal() {
    const modal = document.getElementById('addUserModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * 提交新增用户
 */
async function submitAddUser() {
    const form = document.getElementById('addUserForm');
    if (!form) return;
    
    const formData = new FormData(form);
    const userData = {
        username: formData.get('username'),
        password: formData.get('password'),
        email: formData.get('email'),
        role: formData.get('role')
    };
    
    try {
        const response = await fetch('/api/users', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(userData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('API响应:', result);
        
        // 修改判断条件，使用 code 字段
        if (result.code === 0) {
            closeAddUserModal();
            loadUsers();
            alert('用户创建成功！');
        } else {
            alert('创建失败：' + (result.message || '未知错误'));
        }
        
    } catch (error) {
        console.error('创建用户失败:', error);
        alert('创建用户失败，请稍后重试');
    }
}

/**
 * 编辑用户
 */
function editUser(userId) {
    const user = window.userManagementData.users.find(u => u.id === userId);
    if (!user) return;
    
    // 打开编辑模态框
    const modal = document.getElementById('editUserModal');
    if (modal) {
        modal.style.display = 'flex';
        
        // 填充表单数据
        document.getElementById('editUserId').value = user.id;
        document.getElementById('editUsername').value = user.username;
        document.getElementById('editEmail').value = user.email || '';
        document.getElementById('editRole').value = user.role;
        document.getElementById('editStatus').value = user.status;
        document.getElementById('editPassword').value = ''; // 密码留空
    }
}

/**
 * 关闭编辑用户模态框
 */
function closeEditUserModal() {
    const modal = document.getElementById('editUserModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * 提交编辑用户
 */
async function submitEditUser() {
    const form = document.getElementById('editUserForm');
    if (!form) return;
    
    const formData = new FormData(form);
    const userId = formData.get('id');
    const userData = {
        username: formData.get('username'),
        email: formData.get('email'),
        role: formData.get('role'),
        status: formData.get('status')
    };
    
    // 如果密码不为空，则包含密码
    const password = formData.get('password');
    if (password && password.trim() !== '') {
        userData.password = password;
    }
    
    try {
        const response = await fetch(`/api/users/${userId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(userData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('编辑用户API响应:', result);
        
        if (result.code === 0) {
            closeEditUserModal();
            loadUsers();
            alert('用户更新成功！');
        } else {
            alert('更新失败：' + (result.message || '未知错误'));
        }
        
    } catch (error) {
        console.error('编辑用户失败:', error);
        alert('编辑用户失败，请稍后重试');
    }
}

/**
 * 删除用户
 */
async function deleteUser(userId) {
    const user = window.userManagementData.users.find(u => u.id === userId);
    if (!user) return;
    
    if (!confirm(`确定要删除用户 "${user.username}" 吗？`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/users/${userId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.code === 0) {
            loadUsers();
            alert('用户删除成功！');
        } else {
            alert('删除失败：' + (result.message || '未知错误'));
        }
        
    } catch (error) {
        console.error('删除用户失败:', error);
        alert('删除用户失败，请稍后重试');
    }
}

/**
 * 上一页
 */
function previousPage() {
    if (window.userManagementData.currentPage > 1) {
        window.userManagementData.currentPage--;
        loadUsers();
    }
}

/**
 * 下一页
 */
function nextPage() {
    if (window.userManagementData.currentPage * window.userManagementData.pageSize < window.userManagementData.totalCount) {
        window.userManagementData.currentPage++;
        loadUsers();
    }
}

/**
 * 显示加载状态
 */
function showLoading() {
    const tbody = document.getElementById('userTableBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px; color: #6c757d;">
                    加载中...
                </td>
            </tr>
        `;
    }
}

/**
 * 显示错误信息
 */
function showError(message) {
    const tbody = document.getElementById('userTableBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px; color: #dc3545;">
                    ${message}
                </td>
            </tr>
        `;
    }
}

/**
 * 获取角色文本
 */
function getRoleText(role) {
    const roleMap = {
        'admin': '管理员',
        'user': '普通用户'
    };
    return roleMap[role] || role;
}

/**
 * 获取状态文本
 */
function getStatusText(status) {
    const statusMap = {
        'active': '正常',
        'inactive': '禁用',
        'banned': '封禁'
    };
    return statusMap[status] || status;
}

/**
 * 格式化日期
 */
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN');
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    // 延迟初始化，确保页面内容已加载
    setTimeout(initUserManagement, 100);
});

// 导出函数供全局使用
window.UserManagement = {
    loadUsers,
    searchUsers,
    openAddUserModal,
    closeAddUserModal,
    submitAddUser,
    editUser,
    deleteUser,
    previousPage,
    nextPage,
    init: initUserManagement,
    closeEditUserModal,    // 添加这行
    submitEditUser,        // 添加这行
};

// 同时直接挂载到全局，方便HTML中的onclick调用
window.openAddUserModal = openAddUserModal;
window.closeAddUserModal = closeAddUserModal;
window.submitAddUser = submitAddUser;
window.searchUsers = searchUsers;
window.editUser = editUser;
window.deleteUser = deleteUser;
window.previousPage = previousPage;
window.nextPage = nextPage;
window.closeEditUserModal = closeEditUserModal;  // 添加这行
window.submitEditUser = submitEditUser;          // 添加这行