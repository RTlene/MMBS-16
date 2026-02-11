/**
 * 商品管理模块
 */

// 全局数据存储
window.productManagementData = window.productManagementData || {
    products: [],
    categories: [],
    currentPage: 1,
    totalPages: 1,
    total: 0,
    limit: 10,
    search: '',
    categoryId: '',
    status: '',
    attributes: [],
    skus: [],
    mediaData: {
        mainImages: [],
        detailImages: [],
        videos: []
    },
    pendingUploads: {
        mainImages: [],
        detailImages: [],
        videos: []
    },
    pendingDeletes: {
        mainImages: [],
        detailImages: [],
        videos: []
    },
    previewState: {
        galleryIndex: 0,
        galleryTimer: null
    }
};

// 获取认证头
function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

// 后台编辑页媒体展示用：相对路径转绝对路径；cloud:// 走 temp-url；COS 直链走 cos-url 换签名（私有桶可读）
function getMediaDisplayUrl(url) {
    if (!url) return '';
    if (/^data:/.test(url)) return url;
    const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
    if (/^cloud:\/\//.test(url)) {
        return origin + '/api/storage/temp-url?fileId=' + encodeURIComponent(url);
    }
    // COS 默认域名（私有桶直链会 403），统一经后端换签名链接
    if (/^https:\/\/[^/]+\.cos\.[^/]+\.myqcloud\.com\//.test(url)) {
        return origin + '/api/storage/cos-url?url=' + encodeURIComponent(url);
    }
    if (/^https?:\/\//i.test(url)) return url;
    return origin + (url.startsWith('/') ? url : '/' + url);
}

// ==================== 报表导出/导入（CSV） ====================
window.exportProducts = async function exportProducts() {
    try {
        const { search, categoryId, status } = window.productManagementData;
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (categoryId) params.set('categoryId', categoryId);
        if (status) params.set('status', status);

        const token = localStorage.getItem('token');
        const url = `/api/products/export${params.toString() ? `?${params.toString()}` : ''}`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const a = document.createElement('a');
        const href = URL.createObjectURL(blob);
        a.href = href;
        a.download = `products_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(href);
        alert('商品报表导出成功');
    } catch (err) {
        console.error('导出商品失败:', err);
        alert('导出商品失败: ' + err.message);
    }
};

window.downloadProductsTemplate = async function downloadProductsTemplate() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/products/import-template', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const a = document.createElement('a');
        const href = URL.createObjectURL(blob);
        a.href = href;
        a.download = 'products_import_template.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(href);
    } catch (err) {
        console.error('下载商品模板失败:', err);
        alert('下载模板失败: ' + err.message);
    }
};

window.triggerImportProducts = function triggerImportProducts() {
    const input = document.getElementById('productsImportFile');
    if (input) input.click();
};

async function importProducts(file) {
    const token = localStorage.getItem('token');
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/products/import', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: form
    });
    const result = await res.json();
    if (!res.ok || result.code !== 0) throw new Error(result.message || `HTTP ${res.status}`);
    return result;
}

// 绑定导入 input（页面内嵌 input）
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('productsImportFile');
    if (!input) return;
    input.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!confirm(`确认导入商品报表？\n文件: ${file.name}\n注意：仅导入基础字段（不含SKU/属性）`)) {
            e.target.value = '';
            return;
        }
        try {
            const result = await importProducts(file);
            alert(`导入完成：\n总行数: ${result.data.total}\n新增: ${result.data.created}\n更新: ${result.data.updated}\n跳过: ${result.data.skipped}\n错误: ${result.data.errors.length}`);
            await loadProducts();
        } catch (err) {
            console.error('导入商品失败:', err);
            alert('导入商品失败: ' + err.message);
        } finally {
            e.target.value = '';
        }
    });
});

// 加载商品列表
async function loadProducts() {
    try {
        const { currentPage, limit, search, categoryId, status } = window.productManagementData;
        
        let url = `/api/products?page=${currentPage}&limit=${limit}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (categoryId) url += `&categoryId=${categoryId}`;
        if (status) url += `&status=${status}`;
        
        const response = await fetch(url, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.code === 0) {
            window.productManagementData.products = result.data.products;
            window.productManagementData.total = result.data.total;
            window.productManagementData.totalPages = result.data.totalPages;
            
            renderProducts();
            renderPagination();
        } else {
            console.error('加载商品失败:', result.message);
        }
    } catch (error) {
        console.error('加载商品失败:', error);
    }
}

// 渲染商品列表
function renderProducts() {
    const tbody = document.getElementById('productTableBody');
    const { products } = window.productManagementData;
    
    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #666;">暂无商品数据</td></tr>';
        return;
    }
    
    tbody.innerHTML = products.map(product => `
        <tr>
            <td>${product.id}</td>
            <td>${product.name}</td>
            <td>${product.category ? product.category.name : '未分类'}</td>
            <td>${product.brand || '-'}</td>
            <td>
                <span class="sku-info">${product.skuCount}个SKU</span>
            </td>
            <td>
                <span class="sku-info">库存：${product.totalStock}</span>
            </td>
            <td>${product.priceRange}</td>
            <td>${getHotBadge(product.isHot)}</td>
            <td>
                <span class="status-badge status-${product.status}">
                    ${getStatusText(product.status)}
                </span>
            </td>
            <td>
                ${product.status === 'active' ? `<button class="btn btn-secondary btn-sm" onclick="toggleProductStatus(${product.id}, 'inactive')" title="下架后小程序将不再展示">下架</button>` : ''}
                ${product.status === 'inactive' ? `<button class="btn btn-success btn-sm" onclick="toggleProductStatus(${product.id}, 'active')" title="上架">上架</button>` : ''}
                <button class="btn btn-warning btn-sm" onclick="editProduct(${product.id})">编辑</button>
                <button class="btn btn-danger btn-sm" onclick="deleteProduct(${product.id})">删除</button>
            </td>
        </tr>
    `).join('');
}

// 获取状态文本
function getStatusText(status) {
    const statusMap = {
        'active': '启用',
        'inactive': '禁用',
        'discontinued': '停产'
    };
    return statusMap[status] || status;
}

function getHotBadge(isHot) {
    return `<span class="hot-badge ${isHot ? 'hot' : 'normal'}">${isHot ? '热门' : '普通'}</span>`;
}

// 渲染分页
function renderPagination() {
    const pagination = document.getElementById('pagination');
    const { currentPage, totalPages } = window.productManagementData;
    
    let html = '';
    
    // 上一页按钮
    html += `<button ${currentPage <= 1 ? 'disabled' : ''} onclick="goToPage(${currentPage - 1})">上一页</button>`;
    
    // 页码按钮
    for (let i = 1; i <= totalPages; i++) {
        if (i === currentPage) {
            html += `<button class="active">${i}</button>`;
        } else {
            html += `<button onclick="goToPage(${i})">${i}</button>`;
        }
    }
    
    // 下一页按钮
    html += `<button ${currentPage >= totalPages ? 'disabled' : ''} onclick="goToPage(${currentPage + 1})">下一页</button>`;
    
    pagination.innerHTML = html;
}

// 跳转到指定页面
function goToPage(page) {
    if (page < 1 || page > window.productManagementData.totalPages) return;
    
    window.productManagementData.currentPage = page;
    loadProducts();
}

// 搜索商品
function searchProducts() {
    const searchInput = document.getElementById('searchInput');
    const categoryFilter = document.getElementById('categoryFilter');
    const statusFilter = document.getElementById('statusFilter');
    
    window.productManagementData.search = searchInput.value;
    window.productManagementData.categoryId = categoryFilter.value;
    window.productManagementData.status = statusFilter.value;
    window.productManagementData.currentPage = 1;
    
    loadProducts();
}

// 加载分类列表
async function loadCategories() {
    try {
        const response = await fetch('/api/categories?limit=1000', {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.code === 0) {
            window.productManagementData.categories = result.data.categories;
            renderCategoryOptions();
        }
    } catch (error) {
        console.error('加载分类失败:', error);
    }
}

// 渲染分类选项
function renderCategoryOptions() {
    const { categories } = window.productManagementData;
    
    // 搜索分类下拉框
    const categoryFilter = document.getElementById('categoryFilter');
    categoryFilter.innerHTML = '<option value="">所有分类</option>' + 
        categories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('');
    
    // 表单分类下拉框
    const productCategory = document.getElementById('productCategory');
    productCategory.innerHTML = '<option value="">请选择分类</option>' + 
        categories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('');
}

// 打开添加商品模态框
function openAddProductModal() {
    document.getElementById('modalTitle').textContent = '添加商品';
    document.getElementById('productForm').reset();
    document.getElementById('productIsHot').checked = false;
    
    // 清空数据
    window.productManagementData.attributes = [];
    window.productManagementData.skus = [];
    window.productManagementData.mediaData.mainImages = [];
    window.productManagementData.mediaData.detailImages = [];
    window.productManagementData.mediaData.videos = [];
    window.productManagementData.pendingUploads = { mainImages: [], detailImages: [], videos: [] };
    window.productManagementData.pendingDeletes = { mainImages: [], detailImages: [], videos: [] };
    
    // 渲染空表单
    renderAttributes();
    renderSKUs();
    renderMediaPreview('mainImages');
    renderMediaPreview('detailImages');
    renderMediaPreview('videos');
    
    // 清空富文本编辑器
    document.getElementById('detailContentEditor').innerHTML = '<p>请输入商品详情内容...</p>';
    document.getElementById('detailContent').value = '';
    
    document.getElementById('productModal').style.display = 'block';
}

// 关闭商品模态框
function closeProductModal() {
    document.getElementById('productModal').style.display = 'none';
}

// ==================== 小程序详情页预览（后台） ====================

function _formatPrice(n) {
    const num = Number(n);
    if (Number.isFinite(num)) return num.toFixed(2);
    return '0.00';
}

function _escapeText(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));
}

function _collectPreviewDataFromForm() {
    const name = document.getElementById('productName')?.value || '';
    const description = document.getElementById('productDescription')?.value || '';
    const productType = document.getElementById('productType')?.value || 'physical';

    const mainImages = (window.productManagementData.mediaData.mainImages || []).map(x => x.url).filter(Boolean);
    const detailImages = (window.productManagementData.mediaData.detailImages || []).map(x => x.url).filter(Boolean);
    const videos = (window.productManagementData.mediaData.videos || []).map(x => x.url).filter(Boolean);

    const skus = window.productManagementData.skus || [];
    const prices = skus.map(s => Number(s.price)).filter(p => Number.isFinite(p) && p > 0);
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const maxPrice = prices.length ? Math.max(...prices) : 0;
    const priceText = minPrice === maxPrice ? `¥${_formatPrice(minPrice)}` : `¥${_formatPrice(minPrice)} - ¥${_formatPrice(maxPrice)}`;

    const detailFallback = (document.getElementById('detailContentEditor')?.innerText || '').trim() || description || '暂无详情';

    return {
        name,
        description,
        productType,
        mainImages,
        detailImages,
        videos,
        priceText,
        detailFallback
    };
}

function _renderMiniappPreview(data) {
    const modal = document.getElementById('miniappPreviewModal');
    if (!modal) return;

    const titleEl = document.getElementById('mpPreviewTitle');
    const subEl = document.getElementById('mpPreviewSubtitle');
    const priceEl = document.getElementById('mpPreviewPrice');
    const imgEl = document.getElementById('mpPreviewMainImage');
    const badgeEl = document.getElementById('mpPreviewImageBadge');
    const detailEl = document.getElementById('mpPreviewDetailImages');
    const fallbackEl = document.getElementById('mpPreviewDetailFallback');
    const videoWrap = document.getElementById('mpPreviewVideoWrap');
    const videoEl = document.getElementById('mpPreviewVideo');

    if (titleEl) titleEl.textContent = data.name || '未命名商品';
    if (subEl) subEl.textContent = data.description || '';
    if (priceEl) priceEl.textContent = data.priceText || '¥0.00';

    // gallery
    const images = data.mainImages || [];
    const idx = window.productManagementData.previewState.galleryIndex || 0;
    const safeIdx = images.length ? Math.max(0, Math.min(idx, images.length - 1)) : 0;
    window.productManagementData.previewState.galleryIndex = safeIdx;
    if (imgEl) {
        const mainUrl = images[safeIdx] ? getMediaDisplayUrl(images[safeIdx]) : '';
        imgEl.src = mainUrl;
        imgEl.style.background = mainUrl ? '#fff' : '#f5f5f5';
    }
    if (badgeEl) badgeEl.textContent = `${images.length ? safeIdx + 1 : 0}/${images.length}`;

    // detail images
    const details = data.detailImages || [];
    if (detailEl) {
        detailEl.innerHTML = details.map((url) => `<img src="${_escapeText(getMediaDisplayUrl(url))}" alt="详情图">`).join('');
    }
    if (fallbackEl) {
        fallbackEl.style.display = details.length ? 'none' : 'block';
        fallbackEl.textContent = details.length ? '' : data.detailFallback;
    }

    // 视频预览（仅展示第一个）
    const videos = data.videos || [];
    if (videoWrap) videoWrap.style.display = videos.length ? 'block' : 'none';
    if (videoEl) {
        const videoUrl = videos[0] ? getMediaDisplayUrl(videos[0]) : '';
        videoEl.src = videoUrl;
        videoEl.style.display = videoUrl ? 'block' : 'none';
    }
}

function _startPreviewGalleryAutoplay() {
    _stopPreviewGalleryAutoplay();
    const state = window.productManagementData.previewState;
    state.galleryTimer = setInterval(() => {
        const images = (window.productManagementData.mediaData.mainImages || []).map(x => x.url).filter(Boolean);
        if (!images.length) return;
        state.galleryIndex = (state.galleryIndex + 1) % images.length;
        _renderMiniappPreview(_collectPreviewDataFromForm());
    }, 2500);
}

function _stopPreviewGalleryAutoplay() {
    const state = window.productManagementData.previewState;
    if (state.galleryTimer) {
        clearInterval(state.galleryTimer);
        state.galleryTimer = null;
    }
}

function openMiniappProductPreview() {
    const modal = document.getElementById('miniappPreviewModal');
    if (!modal) return;
    modal.style.display = 'block';
    _renderMiniappPreview(_collectPreviewDataFromForm());
    _startPreviewGalleryAutoplay();
}

function closeMiniappProductPreview() {
    const modal = document.getElementById('miniappPreviewModal');
    if (modal) modal.style.display = 'none';
    _stopPreviewGalleryAutoplay();
}

function refreshMiniappProductPreview() {
    _renderMiniappPreview(_collectPreviewDataFromForm());
}

// 编辑商品
async function editProduct(id) {
    try {
        const response = await fetch(`/api/products/${id}`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.code === 0) {
            const product = result.data;
            
            // 填充基本信息
            document.getElementById('productName').value = product.name || '';
            document.getElementById('productBrand').value = product.brand || '';
            document.getElementById('productCategory').value = product.categoryId || '';
            document.getElementById('productType').value = product.productType || 'physical';
            document.getElementById('productStatus').value = product.status || 'active';
            document.getElementById('productDescription').value = product.description || '';
            document.getElementById('productIsHot').checked = !!product.isHot;
            
            // 填充属性
            window.productManagementData.attributes = product.attributes || [];
            renderAttributes();
            
            // 填充SKU
            window.productManagementData.skus = product.skus || [];
            renderSKUs();
            
            // 填充媒体数据
            window.productManagementData.mediaData.mainImages = (product.images || []).map(url => ({ 
                url, 
                name: '图片',
                isNew: false 
            }));
            window.productManagementData.mediaData.detailImages = (product.detailImages || []).map(url => ({ 
                url, 
                name: '详情图',
                isNew: false 
            }));
            window.productManagementData.mediaData.videos = (product.videos || []).map(url => ({ 
                url, 
                name: '视频',
                isNew: false 
            }));
            
            // 渲染媒体预览
            renderMediaPreview('mainImages');
            renderMediaPreview('detailImages');
            renderMediaPreview('videos');
            
            // 填充富文本内容
            const editor = document.getElementById('detailContentEditor');
            editor.innerHTML = product.detailContent || '<p>请输入商品详情内容...</p>';
            document.getElementById('detailContent').value = product.detailContent || '';
            
            document.getElementById('modalTitle').textContent = '编辑商品';
            document.getElementById('productModal').style.display = 'block';
            
            // 存储当前编辑的商品ID
            window.productManagementData.editingProductId = id;
        } else {
            console.error('获取商品信息失败:', result.message);
        }
    } catch (error) {
        console.error('获取商品信息失败:', error);
    }
}

// 上架/下架商品
async function toggleProductStatus(id, status) {
    const action = status === 'active' ? '上架' : '下架';
    try {
        const response = await fetch(`/api/products/${id}/status`, {
            method: 'PUT',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        const result = await response.json();
        if (result.code === 0) {
            alert(result.message || action + '成功');
            loadProducts();
        } else {
            alert((result.message || action + '失败'));
        }
    } catch (error) {
        console.error('更新商品状态失败:', error);
        alert(action + '失败: ' + error.message);
    }
}

// 删除商品
async function deleteProduct(id) {
    if (!confirm('确定要删除这个商品吗？')) return;
    
    try {
        const response = await fetch(`/api/products/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.code === 0) {
            alert('商品删除成功');
            loadProducts();
        } else {
            alert('删除失败: ' + result.message);
        }
    } catch (error) {
        console.error('删除商品失败:', error);
        alert('删除失败: ' + error.message);
    }
}

// 初始化媒体管理
function initMediaManagement() {
    // 主图上传
    document.getElementById('mainImagesInput').addEventListener('change', function(e) {
        handleImageUpload(e, 'mainImages');
    });
    
    // 详情图上传
    document.getElementById('detailImagesInput').addEventListener('change', function(e) {
        handleImageUpload(e, 'detailImages');
    });
    
    // 视频上传
    document.getElementById('videosInput').addEventListener('change', function(e) {
        handleVideoUpload(e);
    });
    
    // 富文本编辑器
    initRichTextEditor();
}

// 处理图片上传（仅预览）
function handleImageUpload(event, type) {
    const files = Array.from(event.target.files);
    const mediaData = window.productManagementData.mediaData;
    const pendingUploads = window.productManagementData.pendingUploads;
    
    files.forEach(file => {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const mediaItem = {
                    url: e.target.result,
                    file: file,
                    name: file.name,
                    isNew: true // 标记为新文件
                };
                
                mediaData[type].push(mediaItem);
                pendingUploads[type].push(file); // 添加到待上传列表
                renderMediaPreview(type);
            };
            reader.readAsDataURL(file);
        }
    });
    
    // 清空input
    event.target.value = '';
}

// 处理视频上传（仅预览）
function handleVideoUpload(event) {
    const files = Array.from(event.target.files);
    const mediaData = window.productManagementData.mediaData;
    const pendingUploads = window.productManagementData.pendingUploads;
    
    files.forEach(file => {
        if (file.type.startsWith('video/')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const mediaItem = {
                    url: e.target.result,
                    file: file,
                    name: file.name,
                    isNew: true // 标记为新文件
                };
                
                mediaData.videos.push(mediaItem);
                pendingUploads.videos.push(file); // 添加到待上传列表
                renderMediaPreview('videos');
            };
            reader.readAsDataURL(file);
        }
    });
    
    // 清空input
    event.target.value = '';
}

// 渲染媒体预览
function renderMediaPreview(type) {
    const preview = document.getElementById(`${type}Preview`);
    const mediaData = window.productManagementData.mediaData[type];
    
    if (mediaData.length === 0) {
        preview.innerHTML = '<div class="empty">暂无媒体文件</div>';
        preview.classList.add('empty');
        return;
    }
    
    preview.classList.remove('empty');
    const placeholderImg = getMediaDisplayUrl('/images/default-product.svg') || '/images/default-product.svg';
    preview.innerHTML = mediaData.map((item, index) => {
        const displayUrl = getMediaDisplayUrl(item.url);
        const failTip = '当前节点暂无该文件，可重新上传或刷新';
        if (type === 'videos') {
            return `
        <div class="media-item">
            <video src="${_escapeText(displayUrl)}" controls
                onerror="this.style.display='none'; var n=this.nextElementSibling; if(n) n.style.display='block';"></video>
            <span class="media-load-fail" style="display:none;font-size:12px;color:#999;" title="${_escapeText(failTip)}">视频不可用</span>
            <button class="remove-btn" onclick="removeMediaItem('${type}', ${index})">&times;</button>
        </div>
    `;
        }
        return `
        <div class="media-item">
            <img src="${_escapeText(displayUrl)}" alt="${_escapeText(item.name || '')}"
                onerror="this.onerror=null; this.src='${_escapeText(placeholderImg)}'; this.alt='图片加载失败'; this.title='${_escapeText(failTip)}';">
            <button class="remove-btn" onclick="removeMediaItem('${type}', ${index})">&times;</button>
        </div>
    `;
    }).join('');
}

// 移除媒体项
function removeMediaItem(type, index) {
    const mediaData = window.productManagementData.mediaData[type];
    const pendingUploads = window.productManagementData.pendingUploads[type];
    const pendingDeletes = window.productManagementData.pendingDeletes[type];
    const item = mediaData[index];
    
    if (item.isNew) {
        // 如果是新文件，从待上传列表中移除
        const uploadIndex = pendingUploads.findIndex(f => f.name === item.name);
        if (uploadIndex > -1) {
            pendingUploads.splice(uploadIndex, 1);
        }
    } else {
        // 如果是已存在的文件，添加到待删除列表
        pendingDeletes.push(item.url);
    }
    
    // 从显示列表中移除
    mediaData.splice(index, 1);
    renderMediaPreview(type);
}

// 清空主图
function clearMainImages() {
    const mediaData = window.productManagementData.mediaData.mainImages;
    const pendingUploads = window.productManagementData.pendingUploads.mainImages;
    const pendingDeletes = window.productManagementData.pendingDeletes.mainImages;
    
    // 处理现有文件
    mediaData.forEach(item => {
        if (!item.isNew) {
            pendingDeletes.push(item.url);
        }
    });
    
    // 清空列表
    window.productManagementData.mediaData.mainImages = [];
    window.productManagementData.pendingUploads.mainImages = [];
    renderMediaPreview('mainImages');
}

// 清空详情图
function clearDetailImages() {
    const mediaData = window.productManagementData.mediaData.detailImages;
    const pendingUploads = window.productManagementData.pendingUploads.detailImages;
    const pendingDeletes = window.productManagementData.pendingDeletes.detailImages;
    
    // 处理现有文件
    mediaData.forEach(item => {
        if (!item.isNew) {
            pendingDeletes.push(item.url);
        }
    });
    
    // 清空列表
    window.productManagementData.mediaData.detailImages = [];
    window.productManagementData.pendingUploads.detailImages = [];
    renderMediaPreview('detailImages');
}

// 清空视频
function clearVideos() {
    const mediaData = window.productManagementData.mediaData.videos;
    const pendingUploads = window.productManagementData.pendingUploads.videos;
    const pendingDeletes = window.productManagementData.pendingDeletes.videos;
    
    // 处理现有文件
    mediaData.forEach(item => {
        if (!item.isNew) {
            pendingDeletes.push(item.url);
        }
    });
    
    // 清空列表
    window.productManagementData.mediaData.videos = [];
    window.productManagementData.pendingUploads.videos = [];
    renderMediaPreview('videos');
}

// 初始化富文本编辑器
function initRichTextEditor() {
    const editor = document.getElementById('detailContentEditor');
    const textarea = document.getElementById('detailContent');
    
    // 简单的富文本编辑器
    editor.contentEditable = true;
    editor.innerHTML = '<p>请输入商品详情内容...</p>';
    
    // 同步内容到textarea
    editor.addEventListener('input', function() {
        textarea.value = editor.innerHTML;
    });
}

// 格式化文本
function formatText(command) {
    document.execCommand(command, false, null);
    document.getElementById('detailContentEditor').focus();
}

// 插入图片
function insertImage() {
    const url = prompt('请输入图片URL:');
    if (url) {
        document.execCommand('insertImage', false, url);
    }
}

// 插入链接
function insertLink() {
    const url = prompt('请输入链接URL:');
    if (url) {
        document.execCommand('createLink', false, url);
    }
}

// 添加属性
function addAttribute() {
    const attributes = window.productManagementData.attributes;
    attributes.push({
        name: '',
        type: 'text',
        options: [],
        isRequired: false
    });
    renderAttributes();
}

// 删除属性
function removeAttribute(index) {
    console.log('removeAttribute 被调用，索引:', index);
    console.log('删除前的属性数量:', window.productManagementData.attributes.length);
    
    if (index >= 0 && index < window.productManagementData.attributes.length) {
        window.productManagementData.attributes.splice(index, 1);
        console.log('删除后的属性数量:', window.productManagementData.attributes.length);
        
        renderAttributes();
        
        // 删除属性后重新渲染SKU表格
        renderSKUs();
    } else {
        console.error('无效的索引:', index);
    }
}

// 渲染属性
function renderAttributes() {
    const container = document.getElementById('attributesContainer');
    const attributes = window.productManagementData.attributes;
    
    if (attributes.length === 0) {
        container.innerHTML = '<p style="color: #666; font-style: italic;">暂无属性</p>';
        return;
    }
    
    container.innerHTML = attributes.map((attr, index) => `
        <div class="attribute-item" data-index="${index}">
            <input type="text" placeholder="属性名称" value="${attr.name}" 
                   onchange="updateAttribute(${index}, 'name', this.value)">
            <select onchange="updateAttribute(${index}, 'type', this.value)">
                <option value="text" ${attr.type === 'text' ? 'selected' : ''}>文本</option>
                <option value="select" ${attr.type === 'select' ? 'selected' : ''}>选择</option>
                <option value="color" ${attr.type === 'color' ? 'selected' : ''}>颜色</option>
            </select>
            <div class="attribute-options">
                ${attr.type === 'select' ? `
                    <input type="text" placeholder="选项1" value="${attr.options[0] || ''}" 
                           onchange="updateAttributeOption(${index}, 0, this.value)">
                    <input type="text" placeholder="选项2" value="${attr.options[1] || ''}" 
                           onchange="updateAttributeOption(${index}, 1, this.value)">
                    <input type="text" placeholder="选项3" value="${attr.options[2] || ''}" 
                           onchange="updateAttributeOption(${index}, 2, this.value)">
                ` : ''}
            </div>
            <div class="attribute-actions">
                <input type="checkbox" ${attr.isRequired ? 'checked' : ''} 
                       onchange="updateAttribute(${index}, 'isRequired', this.checked)">
                <label>必填</label>
                <button type="button" class="btn btn-danger btn-sm remove-attribute-btn" 
                        data-index="${index}" style="margin-left: 10px;">删除</button>
            </div>
        </div>
    `).join('');
    
    // 使用事件委托绑定删除按钮事件
    bindAttributeDeleteEvents();
}

// 绑定属性删除事件
function bindAttributeDeleteEvents() {
    const container = document.getElementById('attributesContainer');
    
    // 移除之前的事件监听器（如果有的话）
    container.removeEventListener('click', handleAttributeDelete);
    
    // 添加新的事件监听器
    container.addEventListener('click', handleAttributeDelete);
}

// 处理属性删除事件
function handleAttributeDelete(event) {
    if (event.target.classList.contains('remove-attribute-btn')) {
        const index = parseInt(event.target.getAttribute('data-index'));
        console.log('删除属性，索引:', index); // 调试日志
        removeAttribute(index);
    }
}

// 更新属性
function updateAttribute(index, field, value) {
    window.productManagementData.attributes[index][field] = value;
    
    // 如果属性名称或类型发生变化，重新渲染SKU
    if (field === 'name' || field === 'type') {
        renderSKUs();
    }
}

// 更新属性选项
function updateAttributeOption(index, optionIndex, value) {
    if (!window.productManagementData.attributes[index].options) {
        window.productManagementData.attributes[index].options = [];
    }
    window.productManagementData.attributes[index].options[optionIndex] = value;
    
    // 重新渲染SKU以更新选择框选项
    renderSKUs();
}

// 添加SKU
function addSKU() {
    const skus = window.productManagementData.skus;
    skus.push({
        sku: '',
        name: '',
        price: 0,
        costPrice: 0,
        stock: 0,
        barcode: '',
        weight: 0,
        dimensions: '',
        attributes: {},
        status: 'active'
    });
    renderSKUs();
}

// 删除SKU
function removeSKU(index) {
    window.productManagementData.skus.splice(index, 1);
    renderSKUs();
}

// 渲染SKU
function renderSKUs() {
    const container = document.getElementById('skusContainer');
    const skus = window.productManagementData.skus;
    const attributes = window.productManagementData.attributes;
    
    if (skus.length === 0) {
        container.innerHTML = '<p style="color: #666; font-style: italic;">暂无SKU</p>';
        return;
    }
    
    // 生成属性列头
    const attributeHeaders = attributes.map(attr => 
        `<th>${attr.name}</th>`
    ).join('');
    
    // 生成属性输入框
    const generateAttributeInputs = (sku, index) => {
        return attributes.map(attr => {
            const value = sku.attributes && sku.attributes[attr.name] ? sku.attributes[attr.name] : '';
            
            if (attr.type === 'select' && attr.options && attr.options.length > 0) {
                const options = attr.options.filter(opt => opt.trim()).map(opt => 
                    `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt}</option>`
                ).join('');
                
                return `
                    <td>
                        <select onchange="updateSKUAttribute(${index}, '${attr.name}', this.value)">
                            <option value="">请选择</option>
                            ${options}
                        </select>
                    </td>
                `;
            } else if (attr.type === 'color') {
                return `
                    <td>
                        <input type="color" value="${value}" 
                               onchange="updateSKUAttribute(${index}, '${attr.name}', this.value)">
                    </td>
                `;
            } else {
                return `
                    <td>
                        <input type="text" value="${value}" 
                               onchange="updateSKUAttribute(${index}, '${attr.name}', this.value)">
                    </td>
                `;
            }
        }).join('');
    };
    
    container.innerHTML = `
        <table class="sku-table">
            <thead>
                <tr>
                    <th>SKU编码</th>
                    <th>名称</th>
                    <th>价格</th>
                    <th>成本价</th>
                    <th>库存</th>
                    <th>条形码</th>
                    <th>重量(kg)</th>
                    <th>尺寸</th>
                    ${attributeHeaders}
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
                ${skus.map((sku, index) => `
                    <tr>
                        <td><input type="text" value="${sku.sku}" onchange="updateSKU(${index}, 'sku', this.value)"></td>
                        <td><input type="text" value="${sku.name}" onchange="updateSKU(${index}, 'name', this.value)"></td>
                        <td><input type="number" step="0.01" value="${sku.price}" onchange="updateSKU(${index}, 'price', parseFloat(this.value))"></td>
                        <td><input type="number" step="0.01" value="${sku.costPrice || 0}" onchange="updateSKU(${index}, 'costPrice', parseFloat(this.value))"></td>
                        <td><input type="number" value="${sku.stock}" onchange="updateSKU(${index}, 'stock', parseInt(this.value))"></td>
                        <td><input type="text" value="${sku.barcode || ''}" onchange="updateSKU(${index}, 'barcode', this.value)"></td>
                        <td><input type="number" step="0.01" value="${sku.weight || 0}" onchange="updateSKU(${index}, 'weight', parseFloat(this.value))"></td>
                        <td><input type="text" value="${sku.dimensions || ''}" onchange="updateSKU(${index}, 'dimensions', this.value)"></td>
                        ${generateAttributeInputs(sku, index)}
                        <td>
                            <button type="button" class="btn btn-danger btn-sm" onclick="removeSKU(${index})">删除</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// 更新SKU
function updateSKU(index, field, value) {
    window.productManagementData.skus[index][field] = value;
}

// 更新SKU属性
function updateSKUAttribute(index, attributeName, value) {
    if (!window.productManagementData.skus[index].attributes) {
        window.productManagementData.skus[index].attributes = {};
    }
    window.productManagementData.skus[index].attributes[attributeName] = value;
}

// 处理商品文件
async function handleProductFiles(productId) {
    const { pendingUploads, pendingDeletes } = window.productManagementData;
    
    // 处理删除文件
    for (const type of ['mainImages', 'detailImages', 'videos']) {
        for (const url of pendingDeletes[type]) {
            try {
                const filename = url.split('/').pop();
                await fetch(`/api/product-files/${productId}/${filename}`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                        ...getAuthHeaders()
                    },
                    body: JSON.stringify({ type })
                });
            } catch (error) {
                console.warn('删除文件失败:', error);
            }
        }
        pendingDeletes[type] = []; // 清空待删除列表
    }
    
    // 处理上传文件：逐个上传，避免单次请求体过大导致 413（尤其视频）
    const token = localStorage.getItem('token');
    const headers = { 'Authorization': `Bearer ${token}` };

    for (const type of ['mainImages', 'detailImages', 'videos']) {
        const files = pendingUploads[type];
        if (!files || files.length === 0) continue;

        let failedCount = 0;
        for (const file of files) {
            try {
                const formData = new FormData();
                formData.append('type', type);
                formData.append('files', file);

                const response = await fetch(`/api/product-files/${productId}`, {
                    method: 'POST',
                    headers: headers,
                    body: formData
                });

                if (!response.ok) {
                    failedCount++;
                    console.warn('上传文件失败:', response.status, file.name);
                    continue;
                }

                const result = await response.json();
                if (result.code !== 0) {
                    failedCount++;
                    console.warn('上传文件失败:', result.message, file.name);
                    continue;
                }

                const updatedData = result.data && result.data.updatedData;
                if (Array.isArray(updatedData)) {
                    window.productManagementData.mediaData[type] = updatedData.map(url => ({
                        url,
                        name: type === 'videos' ? '视频' : '文件',
                        isNew: false
                    }));
                    renderMediaPreview(type);
                }
            } catch (error) {
                failedCount++;
                console.warn('上传文件失败:', file.name, error);
            }
        }
        pendingUploads[type] = [];

        if (failedCount > 0) {
            alert('有 ' + failedCount + ' 个文件上传失败（可能因体积或网关限制）。视频建议一次只选一个文件，已上传成功的已保存。');
        }
    }
}

// 提交商品表单
async function submitProductForm(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const productData = Object.fromEntries(formData.entries());
    productData.isHot = document.getElementById('productIsHot').checked;
    
    // 验证必填字段
    if (!productData.name) {
        alert('商品名称不能为空');
        return;
    }
    
    if (!productData.categoryId) {
        alert('请选择商品分类');
        return;
    }
    
    // 验证SKU
    const skus = window.productManagementData.skus;
    if (skus.length === 0) {
        alert('请至少添加一个SKU');
        return;
    }
    
    for (let i = 0; i < skus.length; i++) {
        const sku = skus[i];
        if (!sku.sku || !sku.name || !sku.price) {
            alert(`第${i + 1}个SKU信息不完整`);
            return;
        }
    }
    
    // 准备提交数据
    const submitData = {
        ...productData,
        // 注意：images/detailImages/videos 由 /api/product-files 维护
        // 这里不要在 PUT /api/products 时携带，否则可能覆盖刚上传的视频/图片
        detailContent: document.getElementById('detailContent').value,
        attributes: window.productManagementData.attributes.filter(attr => attr.name.trim()),
        skus: skus,
        isHot: productData.isHot
    };
    
    try {
        const { editingProductId } = window.productManagementData;
        const url = editingProductId ? `/api/products/${editingProductId}` : '/api/products';
        const method = editingProductId ? 'PUT' : 'POST';
        
        // 先提交商品基本信息
        const response = await fetch(url, {
            method: method,
            headers: getAuthHeaders(),
            body: JSON.stringify(submitData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.code === 0) {
            const productId = editingProductId || result.data.id;
            
            // 处理文件上传和删除（images/detailImages/videos 由 /api/product-files 维护）
            await handleProductFiles(productId);
            
            alert(editingProductId ? '商品更新成功' : '商品创建成功');
            closeProductModal();
            loadProducts();
        } else {
            alert((editingProductId ? '更新' : '创建') + '失败: ' + result.message);
        }
    } catch (error) {
        console.error('提交商品失败:', error);
        alert('提交失败: ' + error.message);
    }
}

// 初始化商品管理
function initProducts() {
    // 绑定表单提交事件
    document.getElementById('productForm').addEventListener('submit', submitProductForm);
    
    // 绑定搜索事件
    document.getElementById('searchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchProducts();
        }
    });
    
    // 初始化媒体管理
    initMediaManagement();
    
    // 绑定属性删除事件（使用事件委托）
    bindAttributeDeleteEvents();
    
    // 加载数据
    loadCategories();
    loadProducts();
}

// 导出全局函数
window.Products = {
    init: initProducts,
    loadProducts,
    searchProducts,
    openAddProductModal,
    closeProductModal,
    editProduct,
    deleteProduct,
    submitProductForm,
    goToPage,
    addAttribute,
    removeAttribute,
    updateAttribute,
    updateAttributeOption,
    addSKU,
    removeSKU,
    updateSKU,
    updateSKUAttribute,
    handleImageUpload,
    handleVideoUpload,
    removeMediaItem,
    clearMainImages,
    clearDetailImages,
    clearVideos,
    formatText,
    insertImage,
    insertLink
    ,openMiniappProductPreview
    ,closeMiniappProductPreview
    ,refreshMiniappProductPreview
};

window.addAttribute = addAttribute;
window.removeAttribute = removeAttribute;
window.updateAttribute = updateAttribute;
window.updateAttributeOption = updateAttributeOption;
window.addSKU = addSKU;
window.removeSKU = removeSKU;
window.updateSKU = updateSKU;
window.updateSKUAttribute = updateSKUAttribute;
window.openAddProductModal = openAddProductModal;
window.closeProductModal = closeProductModal;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.searchProducts = searchProducts;
window.goToPage = goToPage;
window.handleImageUpload = handleImageUpload;
window.handleVideoUpload = handleVideoUpload;
window.removeMediaItem = removeMediaItem;
window.clearMainImages = clearMainImages;
window.clearDetailImages = clearDetailImages;
window.clearVideos = clearVideos;
window.formatText = formatText;
window.insertImage = insertImage;
window.insertLink = insertLink;
window.openMiniappProductPreview = openMiniappProductPreview;
window.closeMiniappProductPreview = closeMiniappProductPreview;
window.refreshMiniappProductPreview = refreshMiniappProductPreview;

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProducts);
} else {
    initProducts();
}