// 弹窗管理
let popups = [];
let currentPage = 1;
let totalPages = 1;
let currentPopup = null;

// 页面初始化
document.addEventListener('DOMContentLoaded', function() {
    initPopupManagement();
});

// 初始化弹窗管理
function initPopupManagement() {
    loadStats();
    loadPopups();
    bindEventListeners();
}

// 绑定事件监听器
function bindEventListeners() {
    // 搜索功能
    document.getElementById('searchInput').addEventListener('input', function() {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            searchPopups();
        }, 500);
    });

    // 筛选条件变化
    document.getElementById('typeFilter').addEventListener('change', searchPopups);
    document.getElementById('statusFilter').addEventListener('change', searchPopups);

    // 图片上传
    document.getElementById('popupImage').addEventListener('change', handleImageSelect);
}

// 加载统计数据
async function loadStats() {
    try {
        const response = await fetch('/api/popups/stats', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            document.getElementById('totalPopups').textContent = result.data.total;
            document.getElementById('activePopups').textContent = result.data.active;
            document.getElementById('adPopups').textContent = result.data.ad;
            document.getElementById('noticePopups').textContent = result.data.notice;
        }
    } catch (error) {
        console.error('加载统计数据失败:', error);
    }
}

// 加载弹窗列表
async function loadPopups() {
    try {
        const search = document.getElementById('searchInput').value;
        const type = document.getElementById('typeFilter').value;
        const status = document.getElementById('statusFilter').value;
        
        const params = new URLSearchParams({
            page: currentPage,
            limit: 10,
            search: search,
            type: type,
            status: status
        });

        const response = await fetch(`/api/popups?${params}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            popups = result.data.popups;
            totalPages = result.data.totalPages;
            renderPopupsTable();
            renderPagination();
        }
    } catch (error) {
        console.error('加载弹窗列表失败:', error);
    }
}

// 渲染弹窗表格
function renderPopupsTable() {
    const tbody = document.getElementById('popupTableBody');
    tbody.innerHTML = '';

    popups.forEach(popup => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${popup.id}</td>
            <td>${popup.name}</td>
            <td><span class="type-badge">${getTypeText(popup.type)}</span></td>
            <td><span class="status-badge status-${popup.status}">${popup.status === 'active' ? '有效' : '无效'}</span></td>
            <td><img src="${popup.imageUrl || '/images/placeholder.png'}" class="popup-preview" alt="弹窗预览"></td>
            <td>${getFrequencyText(popup.frequency)}</td>
            <td>${popup.startTime ? formatDate(popup.startTime) : '-'}</td>
            <td>${popup.endTime ? formatDate(popup.endTime) : '-'}</td>
            <td>
                <button class="btn btn-primary" onclick="editPopup(${popup.id})">编辑</button>
                <button class="btn btn-danger" onclick="deletePopup(${popup.id})">删除</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 渲染分页
function renderPagination() {
    const pagination = document.getElementById('pagination');
    pagination.innerHTML = '';

    // 上一页按钮
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '上一页';
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            loadPopups();
        }
    };
    pagination.appendChild(prevBtn);

    // 页码按钮
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);

    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.textContent = i;
        pageBtn.className = i === currentPage ? 'active' : '';
        pageBtn.onclick = () => {
            currentPage = i;
            loadPopups();
        };
        pagination.appendChild(pageBtn);
    }

    // 下一页按钮
    const nextBtn = document.createElement('button');
    nextBtn.textContent = '下一页';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => {
        if (currentPage < totalPages) {
            currentPage++;
            loadPopups();
        }
    };
    pagination.appendChild(nextBtn);
}

// 搜索弹窗
function searchPopups() {
    currentPage = 1;
    loadPopups();
}

// 显示添加弹窗模态框
function showAddPopupModal() {
    currentPopup = null;
    document.getElementById('popupModalTitle').textContent = '添加弹窗';
    document.getElementById('popupForm').reset();
    document.getElementById('popupModal').classList.add('show');
    resetImagePreview();
}

// 编辑弹窗
async function editPopup(id) {
    try {
        const response = await fetch(`/api/popups/${id}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            currentPopup = result.data;
            document.getElementById('popupModalTitle').textContent = '编辑弹窗';
            document.getElementById('popupName').value = currentPopup.name;
            document.getElementById('popupType').value = currentPopup.type;
            document.getElementById('popupFrequency').value = currentPopup.frequency;
            document.getElementById('popupStartTime').value = currentPopup.startTime ? formatDateTimeLocal(currentPopup.startTime) : '';
            document.getElementById('popupEndTime').value = currentPopup.endTime ? formatDateTimeLocal(currentPopup.endTime) : '';
            document.getElementById('popupLink').value = currentPopup.link || '';
            document.getElementById('popupStatus').value = currentPopup.status;
            
            // 设置显示条件
            const conditions = currentPopup.conditions || {};
            document.getElementById('showToMembers').checked = conditions.showToMembers !== false;
            document.getElementById('showToGuests').checked = conditions.showToGuests !== false;
            document.getElementById('showOnMobile').checked = conditions.showOnMobile !== false;
            document.getElementById('showOnDesktop').checked = conditions.showOnDesktop !== false;
            
            // 显示现有图片
            if (currentPopup.imageUrl) {
                document.getElementById('imagePreview').src = currentPopup.imageUrl;
                document.getElementById('imagePreview').style.display = 'block';
                document.getElementById('popupPreview').src = currentPopup.imageUrl;
                document.getElementById('popupPreview').style.display = 'block';
                document.getElementById('noPreview').style.display = 'none';
            } else {
                resetImagePreview();
            }
            
            document.getElementById('popupModal').classList.add('show');
        }
    } catch (error) {
        console.error('获取弹窗详情失败:', error);
        alert('获取弹窗详情失败');
    }
}

// 保存弹窗
async function savePopup() {
    try {
        const formData = new FormData();
        formData.append('name', document.getElementById('popupName').value);
        formData.append('type', document.getElementById('popupType').value);
        formData.append('frequency', document.getElementById('popupFrequency').value);
        formData.append('startTime', document.getElementById('popupStartTime').value);
        formData.append('endTime', document.getElementById('popupEndTime').value);
        formData.append('link', document.getElementById('popupLink').value);
        formData.append('status', document.getElementById('popupStatus').value);

        // 处理显示条件
        const conditions = {
            showToMembers: document.getElementById('showToMembers').checked,
            showToGuests: document.getElementById('showToGuests').checked,
            showOnMobile: document.getElementById('showOnMobile').checked,
            showOnDesktop: document.getElementById('showOnDesktop').checked
        };
        formData.append('conditions', JSON.stringify(conditions));

        if (!formData.get('name') || !formData.get('type')) {
            alert('请填写所有必填字段');
            return;
        }

        // 处理图片上传
        const imageFile = document.getElementById('popupImage').files[0];
        if (imageFile) {
            formData.append('image', imageFile);
        }

        const url = currentPopup ? `/api/popups/${currentPopup.id}` : '/api/popups';
        const method = currentPopup ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
        });

        const result = await response.json();
        
        if (result.code === 0) {
            alert(currentPopup ? '更新成功' : '创建成功');
            closePopupModal();
            loadPopups();
            loadStats();
        } else {
            alert(result.message || '保存失败');
        }
    } catch (error) {
        console.error('保存弹窗失败:', error);
        alert('保存失败');
    }
}

// 删除弹窗
async function deletePopup(id) {
    if (!confirm('确定要删除这个弹窗吗？')) {
        return;
    }

    try {
        const response = await fetch(`/api/popups/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const result = await response.json();
        
        if (result.code === 0) {
            alert('删除成功');
            loadPopups();
            loadStats();
        } else {
            alert(result.message || '删除失败');
        }
    } catch (error) {
        console.error('删除弹窗失败:', error);
        alert('删除失败');
    }
}

// 处理图片选择
function handleImageSelect(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('imagePreview').src = e.target.result;
            document.getElementById('imagePreview').style.display = 'block';
            document.getElementById('popupPreview').src = e.target.result;
            document.getElementById('popupPreview').style.display = 'block';
            document.getElementById('noPreview').style.display = 'none';
        };
        reader.readAsDataURL(file);
    }
}

// 处理拖拽上传
function handleDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add('dragover');
}

function handleDragLeave(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('dragover');
}

function handleDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('dragover');
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('image/')) {
            document.getElementById('popupImage').files = files;
            handleImageSelect({ target: { files: [file] } });
        } else {
            alert('请选择图片文件');
        }
    }
}

// 重置图片预览
function resetImagePreview() {
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('popupPreview').style.display = 'none';
    document.getElementById('noPreview').style.display = 'block';
    document.getElementById('popupImage').value = '';
}

// 关闭弹窗模态框
function closePopupModal() {
    document.getElementById('popupModal').classList.remove('show');
    currentPopup = null;
    resetImagePreview();
}

// 获取类型文本
function getTypeText(type) {
    const typeMap = {
        'ad': '广告弹窗',
        'notice': '通知弹窗',
        'promotion': '促销弹窗'
    };
    return typeMap[type] || type;
}

// 获取频率文本
function getFrequencyText(frequency) {
    const frequencyMap = {
        'once': '仅一次',
        'daily': '每日一次',
        'session': '每次会话',
        'always': '总是显示'
    };
    return frequencyMap[frequency] || frequency;
}

// 格式化日期
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// 格式化日期为datetime-local格式
function formatDateTimeLocal(dateString) {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}