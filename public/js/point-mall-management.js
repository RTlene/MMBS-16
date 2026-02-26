// 积分商城管理数据
window.pointMallData = {
    products: [],
    exchanges: [],
    currentPage: 1,
    totalPages: 1,
    pageSize: 10,
    searchKeyword: '',
    categoryFilter: '',
    statusFilter: '',
    currentProduct: null,
    currentExchange: null,
    activeTab: 'products'
};

// 页面初始化
function initPointMallManagement() {
    console.log('初始化积分商城管理页面');
    loadStats();
    loadProducts();
    bindEvents();
}

// 绑定事件
function bindEvents() {
    // 商品搜索输入框回车事件
    document.getElementById('productSearchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchProducts();
        }
    });

    // 兑换记录搜索输入框回车事件
    document.getElementById('exchangeSearchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchExchanges();
        }
    });

    // 筛选条件变化事件
    document.getElementById('categoryFilter').addEventListener('change', searchProducts);
    document.getElementById('productStatusFilter').addEventListener('change', searchProducts);
    document.getElementById('exchangeStatusFilter').addEventListener('change', searchExchanges);
}

// 标签页切换
function switchTab(tabName) {
    console.log('切换到标签页:', tabName);
    
    // 隐藏所有标签页内容
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // 移除所有标签按钮的active类
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // 显示选中的标签页
    document.getElementById(tabName + '-tab').classList.add('active');
    event.target.classList.add('active');
    
    // 更新当前活动标签页
    window.pointMallData.activeTab = tabName;
    
    // 根据标签页加载相应数据
    if (tabName === 'products') {
        loadProducts();
    } else if (tabName === 'exchanges') {
        loadExchanges();
    }
}

// 加载统计数据
async function loadStats() {
    try {
        const response = await fetch('/api/point-mall/stats', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            document.getElementById('totalProducts').textContent = result.data.totalProducts || 0;
            document.getElementById('totalExchanges').textContent = result.data.totalExchanges || 0;
            document.getElementById('pendingExchanges').textContent = result.data.pendingExchanges || 0;
            document.getElementById('totalPoints').textContent = result.data.totalPoints || 0;
        }
    } catch (error) {
        console.error('加载统计数据失败:', error);
    }
}

// 加载商品列表
async function loadProducts() {
    try {
        const params = new URLSearchParams({
            page: window.pointMallData.currentPage,
            limit: window.pointMallData.pageSize,
            search: window.pointMallData.searchKeyword,
            category: window.pointMallData.categoryFilter,
            status: window.pointMallData.statusFilter
        });

        const response = await fetch(`/api/point-mall/products?${params}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            window.pointMallData.products = result.data.products || [];
            window.pointMallData.totalPages = result.data.totalPages || 1;
            renderProductTable();
            renderProductPagination();
        } else {
            alert('加载商品列表失败: ' + result.message);
        }
    } catch (error) {
        console.error('加载商品列表失败:', error);
        alert('加载商品列表失败');
    }
}

// 加载兑换记录列表
async function loadExchanges() {
    try {
        const params = new URLSearchParams({
            page: window.pointMallData.currentPage,
            limit: window.pointMallData.pageSize,
            search: window.pointMallData.searchKeyword,
            status: window.pointMallData.statusFilter
        });

        const response = await fetch(`/api/point-mall/exchanges?${params}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            window.pointMallData.exchanges = result.data.exchanges || [];
            window.pointMallData.totalPages = result.data.totalPages || 1;
            renderExchangeTable();
            renderExchangePagination();
        } else {
            alert('加载兑换记录失败: ' + result.message);
        }
    } catch (error) {
        console.error('加载兑换记录失败:', error);
        alert('加载兑换记录失败');
    }
}

// 渲染商品表格
function renderProductTable() {
    const tbody = document.getElementById('productTableBody');
    tbody.innerHTML = '';

    window.pointMallData.products.forEach(product => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${product.id}</td>
            <td>
                <div class="product-info">
                    ${product.imageUrl ? `<img src="${product.imageUrl}" alt="${product.name}" class="product-image">` : ''}
                    <div class="product-details">
                        <h4>${product.name}</h4>
                        <p>${product.description || ''}</p>
                    </div>
                </div>
            </td>
            <td>${product.points}</td>
            <td>${product.stock}</td>
            <td>${product.sold}</td>
            <td>${getCategoryText(product.category)}</td>
            <td><span class="status-badge status-${product.status}">${getProductStatusText(product.status)}</span></td>
            <td>${product.sortOrder}</td>
            <td>
                <button class="btn btn-primary" onclick="editProduct(${product.id})">编辑</button>
                <button class="btn btn-danger" onclick="deleteProduct(${product.id})">删除</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 渲染兑换记录表格
function renderExchangeTable() {
    const tbody = document.getElementById('exchangeTableBody');
    tbody.innerHTML = '';

    window.pointMallData.exchanges.forEach(exchange => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${exchange.id}</td>
            <td>${exchange.memberId}</td>
            <td>
                <div class="product-info">
                    ${exchange.product && exchange.product.imageUrl ? `<img src="${exchange.product.imageUrl}" alt="${exchange.product.name}" class="product-image">` : ''}
                    <div class="product-details">
                        <h4>${exchange.product ? exchange.product.name : '商品已删除'}</h4>
                        <p>${exchange.product ? exchange.product.description : ''}</p>
                    </div>
                </div>
            </td>
            <td>${exchange.quantity}</td>
            <td>${exchange.points}</td>
            <td><span class="status-badge status-${exchange.status}">${getExchangeStatusText(exchange.status)}</span></td>
            <td>${exchange.shippingAddress || '-'}</td>
            <td>${exchange.trackingNumber || '-'}</td>
            <td>${formatDate(exchange.createdAt)}</td>
            <td>
                <button class="btn btn-warning" onclick="processExchange(${exchange.id})">处理</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 渲染商品分页
function renderProductPagination() {
    const pagination = document.getElementById('productPagination');
    pagination.innerHTML = '';

    const { currentPage, totalPages } = window.pointMallData;

    // 上一页按钮
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '上一页';
    prevBtn.disabled = currentPage <= 1;
    prevBtn.onclick = () => {
        if (currentPage > 1) {
            window.pointMallData.currentPage = currentPage - 1;
            loadProducts();
        }
    };
    pagination.appendChild(prevBtn);

    // 页码按钮
    for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.textContent = i;
        pageBtn.className = i === currentPage ? 'active' : '';
        pageBtn.onclick = () => {
            window.pointMallData.currentPage = i;
            loadProducts();
        };
        pagination.appendChild(pageBtn);
    }

    // 下一页按钮
    const nextBtn = document.createElement('button');
    nextBtn.textContent = '下一页';
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.onclick = () => {
        if (currentPage < totalPages) {
            window.pointMallData.currentPage = currentPage + 1;
            loadProducts();
        }
    };
    pagination.appendChild(nextBtn);
}

// 渲染兑换记录分页
function renderExchangePagination() {
    const pagination = document.getElementById('exchangePagination');
    pagination.innerHTML = '';

    const { currentPage, totalPages } = window.pointMallData;

    // 上一页按钮
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '上一页';
    prevBtn.disabled = currentPage <= 1;
    prevBtn.onclick = () => {
        if (currentPage > 1) {
            window.pointMallData.currentPage = currentPage - 1;
            loadExchanges();
        }
    };
    pagination.appendChild(prevBtn);

    // 页码按钮
    for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.textContent = i;
        pageBtn.className = i === currentPage ? 'active' : '';
        pageBtn.onclick = () => {
            window.pointMallData.currentPage = i;
            loadExchanges();
        };
        pagination.appendChild(pageBtn);
    }

    // 下一页按钮
    const nextBtn = document.createElement('button');
    nextBtn.textContent = '下一页';
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.onclick = () => {
        if (currentPage < totalPages) {
            window.pointMallData.currentPage = currentPage + 1;
            loadExchanges();
        }
    };
    pagination.appendChild(nextBtn);
}

// 搜索商品
function searchProducts() {
    window.pointMallData.searchKeyword = document.getElementById('productSearchInput').value;
    window.pointMallData.categoryFilter = document.getElementById('categoryFilter').value;
    window.pointMallData.statusFilter = document.getElementById('productStatusFilter').value;
    window.pointMallData.currentPage = 1;
    loadProducts();
}

// 搜索兑换记录
function searchExchanges() {
    window.pointMallData.searchKeyword = document.getElementById('exchangeSearchInput').value;
    window.pointMallData.statusFilter = document.getElementById('exchangeStatusFilter').value;
    window.pointMallData.currentPage = 1;
    loadExchanges();
}

// 显示添加商品模态框
function showAddProductModal() {
    window.pointMallData.currentProduct = null;
    document.getElementById('productModalTitle').textContent = '添加商品';
    document.getElementById('productForm').reset();
    document.getElementById('productModal').classList.add('show');
}

// 编辑商品
function editProduct(productId) {
    const product = window.pointMallData.products.find(p => p.id === productId);
    if (!product) return;

    window.pointMallData.currentProduct = product;
    document.getElementById('productModalTitle').textContent = '编辑商品';
    
    // 填充表单数据
    document.getElementById('productName').value = product.name;
    document.getElementById('productDescription').value = product.description || '';
    document.getElementById('productImageUrl').value = product.imageUrl || '';
    document.getElementById('productPoints').value = product.points;
    document.getElementById('productStock').value = product.stock;
    document.getElementById('productCategory').value = product.category || 'digital';
    document.getElementById('productSortOrder').value = product.sortOrder || 0;
    document.getElementById('productStatus').value = product.status;
    
    document.getElementById('productModal').classList.add('show');
}

// 保存商品
async function saveProduct() {
    const formData = {
        name: document.getElementById('productName').value,
        description: document.getElementById('productDescription').value,
        imageUrl: document.getElementById('productImageUrl').value,
        points: parseInt(document.getElementById('productPoints').value),
        stock: parseInt(document.getElementById('productStock').value),
        category: document.getElementById('productCategory').value,
        sortOrder: parseInt(document.getElementById('productSortOrder').value) || 0,
        status: document.getElementById('productStatus').value
    };

    try {
        const url = window.pointMallData.currentProduct 
            ? `/api/point-mall/products/${window.pointMallData.currentProduct.id}`
            : '/api/point-mall/products';
        
        const method = window.pointMallData.currentProduct ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (result.code === 0) {
            alert('保存成功');
            closeProductModal();
            loadProducts();
            loadStats();
        } else {
            alert('保存失败: ' + result.message);
        }
    } catch (error) {
        console.error('保存商品失败:', error);
        alert('保存失败');
    }
}

// 删除商品
async function deleteProduct(productId) {
    if (!confirm('确定要删除这个商品吗？')) return;

    try {
        const response = await fetch(`/api/point-mall/products/${productId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const result = await response.json();
        
        if (result.code === 0) {
            alert('删除成功');
            loadProducts();
            loadStats();
        } else {
            alert('删除失败: ' + result.message);
        }
    } catch (error) {
        console.error('删除商品失败:', error);
        alert('删除失败');
    }
}

// 处理兑换
function processExchange(exchangeId) {
    const exchange = window.pointMallData.exchanges.find(e => e.id === exchangeId);
    if (!exchange) return;

    window.pointMallData.currentExchange = exchange;
    
    // 填充表单数据
    document.getElementById('exchangeStatus').value = exchange.status;
    document.getElementById('trackingNumber').value = exchange.trackingNumber || '';
    document.getElementById('shippingAddress').value = exchange.shippingAddress || '';
    
    document.getElementById('exchangeModal').classList.add('show');
}

// 保存兑换处理
async function saveExchange() {
    const formData = {
        status: document.getElementById('exchangeStatus').value,
        trackingNumber: document.getElementById('trackingNumber').value,
        shippingAddress: document.getElementById('shippingAddress').value
    };

    try {
        const response = await fetch(`/api/point-mall/exchanges/${window.pointMallData.currentExchange.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (result.code === 0) {
            alert('保存成功');
            closeExchangeModal();
            loadExchanges();
            loadStats();
        } else {
            alert('保存失败: ' + result.message);
        }
    } catch (error) {
        console.error('保存兑换处理失败:', error);
        alert('保存失败');
    }
}

// 关闭商品模态框
function closeProductModal() {
    document.getElementById('productModal').classList.remove('show');
}

// 关闭兑换模态框
function closeExchangeModal() {
    document.getElementById('exchangeModal').classList.remove('show');
}

// 工具函数
function getCategoryText(category) {
    const categoryMap = {
        'digital': '数码产品',
        'lifestyle': '生活用品',
        'gift': '礼品',
        'coupon': '优惠券'
    };
    return categoryMap[category] || category;
}

function getProductStatusText(status) {
    const statusMap = {
        'active': '上架',
        'inactive': '下架',
        'sold_out': '售罄'
    };
    return statusMap[status] || status;
}

function getExchangeStatusText(status) {
    const statusMap = {
        'pending': '待处理',
        'shipped': '已发货',
        'delivered': '已收货',
        'cancelled': '已取消'
    };
    return statusMap[status] || status;
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN', { hour12: false });
}

// 供 PageLoader 调用；直接打开页面时也执行一次
window.PointMallManagement = { init: initPointMallManagement };
document.addEventListener('DOMContentLoaded', function() {
    initPointMallManagement();
});