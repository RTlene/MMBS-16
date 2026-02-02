/**
 * 页面加载器模块
 * 负责子页面的动态加载和导航管理
 */

// 当前激活的页面
let currentActivePage = 'dashboard';

// 页面初始化函数映射
const pageInitFunctions = {
    'user-management': () => {
        if (window.UserManagement && window.UserManagement.loadUsers) {
            window.UserManagement.loadUsers();
        }
    },
    'category-management': () => {
        if (window.CategoryManagement && window.CategoryManagement.loadCategories) {
            window.CategoryManagement.loadCategories();
        }
    },
    'dashboard': () => {
        if (window.Dashboard && window.Dashboard.init) {
            window.Dashboard.init();
        }
    },
    'members': () => {
        if (window.Members && window.Members.loadMembers) {
            window.Members.loadMembers();
        }
    },
    'products': () => {
        if (window.Products && window.Products.loadProducts) {
            window.Products.loadProducts();
        }
    },
    'orders': () => {
        console.log('[PageLoader] 初始化订单页面...');
        if (window.orderManagement && window.orderManagement.loadOrders) {
            console.log('[PageLoader] 调用 orderManagement.loadOrders()');
            window.orderManagement.loadOrders();
        } else if (window.orderManagement && window.orderManagement.init) {
            console.log('[PageLoader] 调用 orderManagement.init()');
            window.orderManagement.init();
        } else {
            console.warn('[PageLoader] orderManagement 未找到或方法不存在');
        }
    },
    'banner-management': () => {
        if (window.BannerManagement && window.BannerManagement.init) {
            window.BannerManagement.init();
        }
    },
    'member-levels': () => {
        if (window.MemberLevels && window.MemberLevels.init) {
            window.MemberLevels.init();
        }
    },
    'distributor-levels': () => {
        if (window.DistributorLevels && window.DistributorLevels.init) {
            window.DistributorLevels.init();
        }
    },
    'team-expansion-levels': () => {
        if (window.TeamExpansionLevels && window.TeamExpansionLevels.init) {
            window.TeamExpansionLevels.init();
        }
    },
    'member-management': () => {
        if (window.MemberManagement && window.MemberManagement.init) {
            window.MemberManagement.init();
        }
    },
    'wechat-payment-config': () => {
        if (typeof loadConfig === 'function') loadConfig();
    }
};

/**
 * 初始化页面加载器
 */
function initPageLoader() {
    // 绑定导航点击事件
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            const pageName = this.getAttribute('data-page');
            if (pageName) {
                loadSubPage(pageName);
                updateActiveNav(this);
            }
        });
    });
    
    // 默认加载用户管理页面
    loadSubPage(currentPage);
}

/**
 * 加载子页面
 */
async function loadSubPage(pageName) {
    try {
        const container = document.getElementById('sub-page-container');
        
        // 显示加载状态
        container.innerHTML = '<div class="loading">加载中...</div>';
        
        // 加载子页面内容
        const response = await fetch(`sub-pages/${pageName}.html`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const html = await response.text();
        
        // 插入页面内容
        container.innerHTML = html;
        
        // 更新当前页面
        currentPage = pageName;
        
        // 加载对应的JavaScript模块
        loadPageScript(pageName);
        
    } catch (error) {
        console.error('加载页面失败:', error);
        document.getElementById('sub-page-container').innerHTML = 
            '<div class="error">页面加载失败，请稍后重试</div>';
    }
}

/**
 * 页面名称到脚本文件名的映射
 * 用于处理页面名称和脚本文件名不一致的情况
 */
const pageScriptMap = {
    'orders': 'order.js',  // orders 页面使用 order.js
    // 可以在这里添加其他映射
};

/**
 * 加载页面对应的JavaScript模块
 */
function loadPageScript(pageName) {
    // 移除之前加载的脚本
    const existingScript = document.getElementById(`script-${pageName}`);
    if (existingScript) {
        existingScript.remove();
    }
    
    // 获取脚本文件名（优先使用映射表，否则使用页面名称）
    const scriptFileName = pageScriptMap[pageName] || `${pageName}.js`;
    const scriptPath = `js/${scriptFileName}`;
    
    console.log(`[PageLoader] 加载脚本: ${scriptPath} (页面: ${pageName})`);
    
    // 创建新的脚本标签
    const script = document.createElement('script');
    script.id = `script-${pageName}`;
    script.src = scriptPath;
    script.onload = function() {
        console.log(`[PageLoader] 脚本加载成功: ${scriptPath}`);
        // 脚本加载完成后，调用页面初始化函数
        setTimeout(() => {
            if (pageInitFunctions[pageName]) {
                console.log(`[PageLoader] 调用页面初始化函数: ${pageName}`);
                pageInitFunctions[pageName]();
            } else {
                console.warn(`[PageLoader] 页面 ${pageName} 没有初始化函数`);
            }
        }, 100);
    };
    script.onerror = function() {
        console.error(`[PageLoader] 加载脚本失败: ${scriptPath}`);
    };
    
    document.head.appendChild(script);
}

/**
 * 更新激活的导航项
 */
function updateActiveNav(activeItem) {
    // 移除所有激活状态
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // 添加激活状态到当前项
    activeItem.classList.add('active');
}

/**
 * 显示加载状态
 */
function showLoading() {
    const container = document.getElementById('sub-page-container');
    container.innerHTML = '<div class="loading">加载中...</div>';
}

/**
 * 显示错误信息
 */
function showError(message) {
    const container = document.getElementById('sub-page-container');
    container.innerHTML = `<div class="error">${message}</div>`;
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initPageLoader);

// 导出函数供其他模块使用
window.PageLoader = {
    loadSubPage,
    showLoading,
    showError,
    getCurrentPage: () => currentPage,
    // 添加页面初始化函数注册方法
    registerPageInit: (pageName, initFunction) => {
        pageInitFunctions[pageName] = initFunction;
    }
};