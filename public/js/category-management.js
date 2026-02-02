/**
 * 商品分类管理模块
 */

// 初始化全局数据存储
if (typeof window.categoryManagementData === 'undefined') {
    window.categoryManagementData = {
        categories: [],
        currentPage: 1,
        pageSize: 10,
        totalCount: 0,
        searchKeyword: ''
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
 * 初始化商品分类管理模块
 */
function initCategoryManagement() {
    console.log('商品分类管理模块初始化');
    loadCategories();
}

/**
 * 加载分类列表
 */
async function loadCategories() {
    try {
        showLoading();
        
        const response = await fetch(`/api/categories?page=${window.categoryManagementData.currentPage}&limit=${window.categoryManagementData.pageSize}&search=${window.categoryManagementData.searchKeyword}`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('API返回的数据:', data);
        
        if (data.code === 0) {
            window.categoryManagementData.categories = data.data.categories || [];
            window.categoryManagementData.totalCount = data.data.total || 0;
            renderCategoryTable();
            updatePagination();
        } else {
            showError('加载分类列表失败: ' + data.message);
        }
    } catch (error) {
        console.error('加载分类列表失败:', error);
        showError('加载分类列表失败: ' + error.message);
    }
}

/**
 * 渲染分类表格
 */
function renderCategoryTable() {
    const tbody = document.getElementById('categoryTableBody');
    if (!tbody) return;
    
    if (window.categoryManagementData.categories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #6c757d;">暂无数据</td></tr>';
        return;
    }
    
    tbody.innerHTML = window.categoryManagementData.categories.map(category => `
        <tr>
            <td>${category.id}</td>
            <td>${category.name}</td>
            <td>${category.description || '-'}</td>
            <td>${category.parentId ? `父分类ID: ${category.parentId}` : '顶级分类'}</td>
            <td>${category.sortOrder}</td>
            <td><span class="status-badge status-${category.status}">${getStatusText(category.status)}</span></td>
            <td>${formatDate(category.createdAt)}</td>
            <td>
                <button onclick="editCategory(${category.id})" class="btn btn-primary" style="margin-right: 5px;">编辑</button>
                <button onclick="deleteCategory(${category.id}, '${category.name}')" class="btn btn-danger">删除</button>
            </td>
        </tr>
    `).join('');
}

/**
 * 更新分页信息
 */
function updatePagination() {
    const totalPages = Math.ceil(window.categoryManagementData.totalCount / window.categoryManagementData.pageSize);
    const pageInfo = document.getElementById('pageInfo');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    if (pageInfo) {
        pageInfo.textContent = `第 ${window.categoryManagementData.currentPage} 页，共 ${totalPages} 页`;
    }
    
    if (prevBtn) {
        prevBtn.disabled = window.categoryManagementData.currentPage <= 1;
    }
    
    if (nextBtn) {
        nextBtn.disabled = window.categoryManagementData.currentPage >= totalPages;
    }
}

/**
 * 搜索分类
 */
function searchCategories() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        window.categoryManagementData.searchKeyword = searchInput.value.trim();
        window.categoryManagementData.currentPage = 1;
        loadCategories();
    }
}

/**
 * 打开新增分类模态框
 */
function openAddCategoryModal() {
    const modal = document.getElementById('addCategoryModal');
    if (modal) {
        modal.style.display = 'block';
        loadParentCategories('addParentId');
    }
}

/**
 * 关闭新增分类模态框
 */
function closeAddCategoryModal() {
    const modal = document.getElementById('addCategoryModal');
    if (modal) {
        modal.style.display = 'none';
        document.getElementById('addCategoryForm').reset();
    }
}

/**
 * 提交新增分类
 */
async function submitAddCategory() {
    const form = document.getElementById('addCategoryForm');
    if (!form) return;
    
    const formData = new FormData(form);
    const categoryData = {
        name: formData.get('name'),
        description: formData.get('description'),
        parentId: formData.get('parentId') || null,
        sortOrder: parseInt(formData.get('sortOrder')) || 0,
        status: formData.get('status')
    };
    
    try {
        const response = await fetch('/api/categories', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(categoryData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.code === 0) {
            closeAddCategoryModal();
            loadCategories();
            showSuccess('分类创建成功');
        } else {
            showError('创建分类失败: ' + result.message);
        }
    } catch (error) {
        console.error('创建分类失败:', error);
        showError('创建分类失败: ' + error.message);
    }
}

/**
 * 编辑分类
 */
async function editCategory(categoryId) {
    try {
        const response = await fetch(`/api/categories/${categoryId}`, {
            method: 'GET',
            headers: getAuthHeaders()
          });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.code === 0) {
            const category = result.data;
            document.getElementById('editId').value = category.id;
            document.getElementById('editName').value = category.name;
            document.getElementById('editDescription').value = category.description || '';
            document.getElementById('editSortOrder').value = category.sortOrder;
            document.getElementById('editStatus').value = category.status;
            
            loadParentCategories('editParentId', category.id);
            
            const modal = document.getElementById('editCategoryModal');
            if (modal) {
                modal.style.display = 'block';
            }
        } else {
            showError('获取分类信息失败: ' + result.message);
        }
    } catch (error) {
        console.error('获取分类信息失败:', error);
        showError('获取分类信息失败: ' + error.message);
    }
}

/**
 * 关闭编辑分类模态框
 */
function closeEditCategoryModal() {
    const modal = document.getElementById('editCategoryModal');
    if (modal) {
        modal.style.display = 'none';
        document.getElementById('editCategoryForm').reset();
    }
}

/**
 * 提交编辑分类
 */
async function submitEditCategory() {
    const form = document.getElementById('editCategoryForm');
    if (!form) return;
    
    const categoryId = document.getElementById('editId').value;
    const formData = new FormData(form);
    const categoryData = {
        name: formData.get('name'),
        description: formData.get('description'),
        parentId: formData.get('parentId') || null,
        sortOrder: parseInt(formData.get('sortOrder')) || 0,
        status: formData.get('status')
    };
    
    try {
        const response = await fetch(`/api/categories/${categoryId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(categoryData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.code === 0) {
            closeEditCategoryModal();
            loadCategories();
            showSuccess('分类更新成功');
        } else {
            showError('更新分类失败: ' + result.message);
        }
    } catch (error) {
        console.error('更新分类失败:', error);
        showError('更新分类失败: ' + error.message);
    }
}

/**
 * 删除分类
 */
async function deleteCategory(categoryId, categoryName) {
    if (!confirm(`确定要删除分类 "${categoryName}" 吗？`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/categories/${categoryId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.code === 0) {
            loadCategories();
            showSuccess('分类删除成功');
        } else {
            showError('删除分类失败: ' + result.message);
        }
    } catch (error) {
        console.error('删除分类失败:', error);
        showError('删除分类失败: ' + error.message);
    }
}

/**
 * 加载父分类选项
 */
async function loadParentCategories(selectId, excludeId = null) {
    try {
        const response = await fetch('/api/categories?limit=1000', {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.code === 0) {
            const select = document.getElementById(selectId);
            if (select) {
                select.innerHTML = '<option value="">无（顶级分类）</option>';
                result.data.categories.forEach(category => {
                    if (category.id !== excludeId) {
                        select.innerHTML += `<option value="${category.id}">${category.name}</option>`;
                    }
                });
            }
        }
    } catch (error) {
        console.error('加载父分类失败:', error);
    }
}

/**
 * 上一页
 */
function previousPage() {
    if (window.categoryManagementData.currentPage > 1) {
        window.categoryManagementData.currentPage--;
        loadCategories();
    }
}

/**
 * 下一页
 */
function nextPage() {
    const totalPages = Math.ceil(window.categoryManagementData.totalCount / window.categoryManagementData.pageSize);
    if (window.categoryManagementData.currentPage < totalPages) {
        window.categoryManagementData.currentPage++;
        loadCategories();
    }
}

/**
 * 获取状态文本
 */
function getStatusText(status) {
    return status === 'active' ? '启用' : '禁用';
}

/**
 * 格式化日期
 */
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN');
}

/**
 * 显示加载状态
 */
function showLoading() {
    // 可以在这里添加加载动画
}

/**
 * 显示成功消息
 */
function showSuccess(message) {
    alert('成功: ' + message);
}

/**
 * 显示错误消息
 */
function showError(message) {
    alert('错误: ' + message);
}

// 导出全局函数
window.initCategoryManagement = initCategoryManagement;
window.searchCategories = searchCategories;
window.openAddCategoryModal = openAddCategoryModal;
window.closeAddCategoryModal = closeAddCategoryModal;
window.submitAddCategory = submitAddCategory;
window.editCategory = editCategory;
window.closeEditCategoryModal = closeEditCategoryModal;
window.submitEditCategory = submitEditCategory;
window.deleteCategory = deleteCategory;
window.previousPage = previousPage;
window.nextPage = nextPage;

window.CategoryManagement = {
    init: initCategoryManagement,
    loadCategories,
    searchCategories,
    openAddCategoryModal,
    closeAddCategoryModal,
    submitAddCategory,
    editCategory,
    closeEditCategoryModal,
    submitEditCategory,
    deleteCategory,
    previousPage,
    nextPage
};