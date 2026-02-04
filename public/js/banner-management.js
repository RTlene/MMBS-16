// 横幅管理
let banners = [];
let currentPage = 1;
let totalPages = 1;
let currentBanner = null;

// 页面初始化
document.addEventListener('DOMContentLoaded', function() {
    initBannerManagement();
});

// 初始化横幅管理
function initBannerManagement() {
    loadStats();
    loadBanners();
    bindEventListeners();
}

// 绑定事件监听器
function bindEventListeners() {
    // 搜索功能
    document.getElementById('searchInput').addEventListener('input', function() {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            searchBanners();
        }, 500);
    });

    // 筛选条件变化
    document.getElementById('positionFilter').addEventListener('change', searchBanners);
    document.getElementById('statusFilter').addEventListener('change', searchBanners);

    // 图片上传
    document.getElementById('bannerImage').addEventListener('change', handleImageSelect);
}

// 加载统计数据
async function loadStats() {
    try {
        const response = await fetch('/api/banners/stats', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            document.getElementById('totalBanners').textContent = result.data.total;
            document.getElementById('activeBanners').textContent = result.data.active;
            document.getElementById('homepageBanners').textContent = result.data.homepage;
            document.getElementById('productBanners').textContent = result.data.product;
        }
    } catch (error) {
        console.error('加载统计数据失败:', error);
    }
}

// 加载横幅列表
async function loadBanners() {
    try {
        const search = document.getElementById('searchInput')?.value || '';
        const position = document.getElementById('positionFilter')?.value || '';
        const status = document.getElementById('statusFilter')?.value || '';
        
        const params = new URLSearchParams({
            page: currentPage,
            limit: 10
        });
        
        // 只在有值时才添加筛选参数
        if (search) params.append('search', search);
        if (position) params.append('position', position);
        if (status) params.append('status', status);

        console.log('[BannerManagement] 加载轮播图列表，参数:', params.toString());

        const response = await fetch(`/api/banners?${params}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        console.log('[BannerManagement] API响应:', result);
        
        if (result.code === 0) {
            banners = result.data.banners || [];
            totalPages = result.data.totalPages || 1;
            console.log(`[BannerManagement] 加载到 ${banners.length} 条轮播图记录，共 ${result.data.total || 0} 条`);
            renderBannersTable();
            renderPagination();
        } else {
            console.error('[BannerManagement] 加载失败:', result.message);
            alert('加载轮播图列表失败: ' + (result.message || '未知错误'));
        }
    } catch (error) {
        console.error('[BannerManagement] 加载横幅列表失败:', error);
        alert('加载轮播图列表失败: ' + error.message);
    }
}

// 渲染横幅表格
function renderBannersTable() {
    const tbody = document.getElementById('bannerTableBody');
    if (!tbody) {
        console.error('[BannerManagement] 找不到表格tbody元素');
        return;
    }
    
    tbody.innerHTML = '';

    if (!banners || banners.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 40px; color: #999;">暂无轮播图记录</td></tr>';
        return;
    }

    banners.forEach(banner => {
        const row = document.createElement('tr');
        // 使用 title 或 name 字段，兼容不同的返回格式
        const bannerName = banner.title || banner.name || '未命名';
        const bannerImageUrl = banner.imageUrl || '/images/placeholder.png';
        
        row.innerHTML = `
            <td>${banner.id}</td>
            <td>${bannerName}</td>
            <td><span class="position-badge">${getPositionText(banner.position)}</span></td>
            <td><span class="status-badge status-${banner.status}">${banner.status === 'active' ? '有效' : '无效'}</span></td>
            <td><img src="${bannerImageUrl}" class="banner-preview" alt="横幅预览" onerror="this.src='/images/placeholder.png'"></td>
            <td>${banner.sort || 0}</td>
            <td>${banner.startTime ? formatDate(banner.startTime) : '-'}</td>
            <td>${banner.endTime ? formatDate(banner.endTime) : '-'}</td>
            <td>
                <button class="btn btn-primary" onclick="editBanner(${banner.id})">编辑</button>
                <button class="btn btn-danger" onclick="deleteBanner(${banner.id})">删除</button>
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
            loadBanners();
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
            loadBanners();
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
            loadBanners();
        }
    };
    pagination.appendChild(nextBtn);
}

// 搜索横幅
function searchBanners() {
    currentPage = 1;
    loadBanners();
}

// 显示添加横幅模态框
function showAddBannerModal() {
    currentBanner = null;
    selectedProduct = null;
    document.getElementById('bannerModalTitle').textContent = '添加横幅';
    document.getElementById('bannerForm').reset();
    document.getElementById('bannerLinkType').value = 'external';
    document.getElementById('bannerExternalLink').value = '';
    document.getElementById('bannerProductId').value = '';
    document.getElementById('bannerProductSearch').value = '';
    document.getElementById('bannerCustomPath').value = '';
    hideProductDropdown();
    handleLinkTypeChange('external');
    document.getElementById('bannerModal').classList.add('show');
    resetImagePreview();
}

// 编辑横幅
async function editBanner(id) {
    try {
        const response = await fetch(`/api/banners/${id}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            currentBanner = result.data;
            document.getElementById('bannerModalTitle').textContent = '编辑横幅';
            document.getElementById('bannerName').value = currentBanner.name;
            document.getElementById('bannerPosition').value = currentBanner.position;
            document.getElementById('bannerSort').value = currentBanner.sort || 0;
            document.getElementById('bannerStartTime').value = currentBanner.startTime ? formatDateTimeLocal(currentBanner.startTime) : '';
            document.getElementById('bannerEndTime').value = currentBanner.endTime ? formatDateTimeLocal(currentBanner.endTime) : '';
            document.getElementById('bannerStatus').value = currentBanner.status;
            const linkType = currentBanner.linkType || (currentBanner.link ? 'external' : 'custom');
            document.getElementById('bannerLinkType').value = linkType;
            document.getElementById('bannerExternalLink').value = linkType === 'external' ? (currentBanner.linkTarget || currentBanner.link || '') : '';
            const productId = linkType === 'product' ? (currentBanner.linkTarget || '') : '';
            document.getElementById('bannerProductId').value = productId;
            document.getElementById('bannerCustomPath').value = linkType === 'custom' ? (currentBanner.linkTarget || '') : '';
            handleLinkTypeChange(linkType);
            
            // 如果是商品类型且有商品ID，加载商品信息
            if (linkType === 'product' && productId) {
                loadProductById(productId);
            } else {
                document.getElementById('bannerProductSearch').value = '';
            }
            
            // 显示现有图片
            if (currentBanner.imageUrl) {
                document.getElementById('imagePreview').src = currentBanner.imageUrl;
                document.getElementById('imagePreview').style.display = 'block';
                document.getElementById('bannerPreview').src = currentBanner.imageUrl;
                document.getElementById('bannerPreview').style.display = 'block';
                document.getElementById('noPreview').style.display = 'none';
            } else {
                resetImagePreview();
            }
            
            document.getElementById('bannerModal').classList.add('show');
        }
    } catch (error) {
        console.error('获取横幅详情失败:', error);
        alert('获取横幅详情失败');
    }
}

// 保存横幅
async function saveBanner() {
    try {
        const formData = new FormData();
        formData.append('name', document.getElementById('bannerName').value);
        formData.append('position', document.getElementById('bannerPosition').value);
        formData.append('sort', document.getElementById('bannerSort').value);
        formData.append('startTime', document.getElementById('bannerStartTime').value);
        formData.append('endTime', document.getElementById('bannerEndTime').value);
        formData.append('status', document.getElementById('bannerStatus').value);
        const linkType = document.getElementById('bannerLinkType').value;
        let linkTarget = '';
        if (linkType === 'external') {
            linkTarget = document.getElementById('bannerExternalLink').value.trim();
        } else if (linkType === 'product') {
            linkTarget = document.getElementById('bannerProductId').value.trim();
        } else if (linkType === 'custom') {
            linkTarget = document.getElementById('bannerCustomPath').value.trim();
        }
        if (linkType === 'external' && !linkTarget) {
            alert('请输入外部链接地址');
            return;
        }
        if (linkType === 'product' && !linkTarget) {
            alert('请选择商品');
            return;
        }
        if (linkType === 'custom' && !linkTarget) {
            alert('请输入自定义页面路径');
            return;
        }
        formData.append('linkType', linkType);
        formData.append('linkTarget', linkTarget);
        if (linkType === 'external') {
            formData.append('link', linkTarget);
        }

        if (!formData.get('name') || !formData.get('position')) {
            alert('请填写所有必填字段');
            return;
        }

        // 处理图片上传
        const imageFile = document.getElementById('bannerImage').files[0];
        if (imageFile) {
            // 再次检查文件类型
            if (!imageFile.type.startsWith('image/')) {
                alert('请选择图片文件（JPG、PNG、GIF等格式）');
                return;
            }
            
            // 再次检查文件大小
            if (imageFile.size > MAX_FILE_SIZE) {
                alert(`图片文件过大！\n当前大小: ${formatFileSize(imageFile.size)}\n最大允许: ${formatFileSize(MAX_FILE_SIZE)}\n\n请压缩图片后重新上传。`);
                return;
            }
            
            formData.append('image', imageFile);
        }

        const url = currentBanner ? `/api/banners/${currentBanner.id}` : '/api/banners';
        const method = currentBanner ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
        });

        const result = await response.json();
        
        if (result.code === 0) {
            alert(currentBanner ? '更新成功' : '创建成功');
            closeBannerModal();
            loadBanners();
            loadStats();
        } else {
            // 显示详细的错误信息
            const errorMsg = result.message || '保存失败';
            alert(errorMsg);
            console.error('保存横幅失败:', result);
        }
    } catch (error) {
        console.error('保存横幅失败:', error);
        // 检查是否是网络错误或文件大小错误
        if (error.message && error.message.includes('File too large')) {
            alert(`文件上传失败：文件过大，最大允许 ${formatFileSize(MAX_FILE_SIZE)}`);
        } else {
            alert('保存失败，请检查网络连接或稍后重试');
        }
    }
}

// 删除横幅
async function deleteBanner(id) {
    if (!confirm('确定要删除这个横幅吗？')) {
        return;
    }

    try {
        const response = await fetch(`/api/banners/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const result = await response.json();
        
        if (result.code === 0) {
            alert('删除成功');
            loadBanners();
            loadStats();
        } else {
            alert(result.message || '删除失败');
        }
    } catch (error) {
        console.error('删除横幅失败:', error);
        alert('删除失败');
    }
}

// 文件大小限制：10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// 处理图片选择
function handleImageSelect(event) {
    const file = event.target.files[0];
    if (file) {
        // 检查文件类型
        if (!file.type.startsWith('image/')) {
            alert('请选择图片文件（JPG、PNG、GIF等格式）');
            event.target.value = '';
            return;
        }
        
        // 检查文件大小
        if (file.size > MAX_FILE_SIZE) {
            alert(`图片文件过大！\n当前大小: ${formatFileSize(file.size)}\n最大允许: ${formatFileSize(MAX_FILE_SIZE)}\n\n请压缩图片后重新上传。`);
            event.target.value = '';
            return;
        }
        
        // 显示文件大小提示
        const sizeInfo = formatFileSize(file.size);
        console.log(`[Banner] 选择的图片: ${file.name}, 大小: ${sizeInfo}`);
        
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('imagePreview').src = e.target.result;
            document.getElementById('imagePreview').style.display = 'block';
            document.getElementById('bannerPreview').src = e.target.result;
            document.getElementById('bannerPreview').style.display = 'block';
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
        if (!file.type.startsWith('image/')) {
            alert('请选择图片文件（JPG、PNG、GIF等格式）');
            return;
        }
        
        // 检查文件大小
        if (file.size > MAX_FILE_SIZE) {
            alert(`图片文件过大！\n当前大小: ${formatFileSize(file.size)}\n最大允许: ${formatFileSize(MAX_FILE_SIZE)}\n\n请压缩图片后重新上传。`);
            return;
        }
        
        // 创建 FileList 对象
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        document.getElementById('bannerImage').files = dataTransfer.files;
        handleImageSelect({ target: { files: [file] } });
    }
}

// 重置图片预览
function resetImagePreview() {
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('bannerPreview').style.display = 'none';
    document.getElementById('noPreview').style.display = 'block';
    document.getElementById('bannerImage').value = '';
}

// 关闭横幅模态框
function closeBannerModal() {
    document.getElementById('bannerModal').classList.remove('show');
    currentBanner = null;
    selectedProduct = null;
    document.getElementById('bannerProductSearch').value = '';
    document.getElementById('bannerProductId').value = '';
    hideProductDropdown();
    resetImagePreview();
}

function handleLinkTypeChange(type) {
    const externalGroup = document.getElementById('externalLinkGroup');
    const productGroup = document.getElementById('productLinkGroup');
    const customGroup = document.getElementById('customLinkGroup');
    externalGroup.style.display = type === 'external' ? 'block' : 'none';
    productGroup.style.display = type === 'product' ? 'block' : 'none';
    customGroup.style.display = type === 'custom' ? 'block' : 'none';
    
    // 如果切换到商品类型，初始化商品选择器
    if (type === 'product') {
        initProductSelector();
    } else {
        hideProductDropdown();
    }
}

// 商品选择器相关变量
let productSearchTimeout = null;
let allProducts = [];
let selectedProduct = null;

// 初始化商品选择器
async function initProductSelector() {
    const productId = document.getElementById('bannerProductId').value;
    if (productId) {
        // 如果有已选中的商品ID，加载商品信息并显示
        await loadProductById(productId);
    }
}

// 根据ID加载商品信息
async function loadProductById(productId) {
    try {
        const response = await fetch(`/api/products/${productId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0 && result.data) {
            const product = result.data;
            selectedProduct = product;
            document.getElementById('bannerProductSearch').value = `${product.name} (ID: ${product.id})`;
            document.getElementById('bannerProductId').value = product.id;
        }
    } catch (error) {
        console.error('加载商品信息失败:', error);
    }
}

// 搜索商品
async function searchProductsForBanner(keyword) {
    const searchInput = document.getElementById('bannerProductSearch');
    const dropdown = document.getElementById('productDropdown');
    const loading = document.getElementById('productDropdownLoading');
    const list = document.getElementById('productDropdownList');
    
    // 清除之前的搜索定时器
    if (productSearchTimeout) {
        clearTimeout(productSearchTimeout);
    }
    
    // 如果关键词为空，显示下拉框但不加载
    if (!keyword || keyword.trim() === '') {
        showProductDropdown();
        list.innerHTML = '<div class="product-dropdown-item" style="color: #999; text-align: center;">请输入商品名称或ID进行搜索</div>';
        return;
    }
    
    // 延迟搜索，避免频繁请求
    productSearchTimeout = setTimeout(async () => {
        try {
            loading.style.display = 'block';
            list.style.display = 'none';
            showProductDropdown();
            
            const response = await fetch(`/api/products?page=1&limit=20&search=${encodeURIComponent(keyword)}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            
            const result = await response.json();
            
            loading.style.display = 'none';
            list.style.display = 'block';
            
            if (result.code === 0 && result.data && result.data.products) {
                const products = result.data.products;
                
                if (products.length === 0) {
                    list.innerHTML = '<div class="product-dropdown-item" style="color: #999; text-align: center;">未找到相关商品</div>';
                } else {
                    list.innerHTML = products.map(product => `
                        <div class="product-dropdown-item" onclick="selectProduct(${product.id}, '${product.name.replace(/'/g, "\\'")}', '${(product.category && product.category.name) || '未分类'}')">
                            <div class="product-item-name">${product.name}</div>
                            <div class="product-item-info">
                                <span class="product-item-id">ID: ${product.id}</span>
                                <span class="product-item-category">分类: ${(product.category && product.category.name) || '未分类'}</span>
                            </div>
                        </div>
                    `).join('');
                }
            } else {
                list.innerHTML = '<div class="product-dropdown-item" style="color: #ff4d4f; text-align: center;">加载失败，请重试</div>';
            }
        } catch (error) {
            console.error('搜索商品失败:', error);
            loading.style.display = 'none';
            list.style.display = 'block';
            list.innerHTML = '<div class="product-dropdown-item" style="color: #ff4d4f; text-align: center;">搜索失败，请重试</div>';
        }
    }, 300);
}

// 显示商品下拉框
function showProductDropdown() {
    const dropdown = document.getElementById('productDropdown');
    if (dropdown) {
        dropdown.style.display = 'block';
    }
}

// 隐藏商品下拉框
function hideProductDropdown() {
    const dropdown = document.getElementById('productDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
}

// 选择商品
function selectProduct(productId, productName, categoryName) {
    selectedProduct = { id: productId, name: productName, category: categoryName };
    document.getElementById('bannerProductSearch').value = `${productName} (ID: ${productId})`;
    document.getElementById('bannerProductId').value = productId;
    hideProductDropdown();
}

// 点击页面其他地方时隐藏下拉框
document.addEventListener('click', function(event) {
    const productGroup = document.getElementById('productLinkGroup');
    const searchInput = document.getElementById('bannerProductSearch');
    const dropdown = document.getElementById('productDropdown');
    
    if (productGroup && productGroup.style.display !== 'none') {
        if (!productGroup.contains(event.target)) {
            hideProductDropdown();
        }
    }
});

// 对外暴露方法，便于页面加载器调用
window.BannerManagement = {
    init: initBannerManagement,
    loadStats,
    loadBanners,
    showAddBannerModal,
    editBanner,
    deleteBanner,
    handleLinkTypeChange
};

// 暴露商品选择相关函数到全局，供HTML调用
window.searchProductsForBanner = searchProductsForBanner;
window.selectProduct = selectProduct;
window.showProductDropdown = showProductDropdown;

// 获取位置文本
function getPositionText(position) {
    const positionMap = {
        'homepage': '首页首图',
        'activity': '活动横幅',
        'product': '商品页',
        'category': '分类页',
        'member': '会员页'
    };
    return positionMap[position] || position;
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