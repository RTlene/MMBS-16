// 订单管理相关功能
class OrderManagement {
    constructor() {
        this.currentPage = 1;
        this.pageSize = 10;
        this.totalPages = 0;
        this.currentStatus = '';
        this.orders = [];
        this.currentOrder = null;
    }

    /**
     * 获取订单类型（优先读取变更类型日志，其次根据商品类型推断）
     * @returns {'service'|'physical'}
     */
    getOrderType(order) {
        if (!order) return 'physical';

        // 1) 优先读取操作日志里的 change_type（后端目前只记录日志，不会改商品productType）
        const logs = Array.isArray(order.operationLogs) ? order.operationLogs : [];
        const changeLogs = logs.filter(l => l && l.operation === 'change_type');
        if (changeLogs.length > 0) {
            const latest = changeLogs
                .slice()
                .sort((a, b) => {
                    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                    if (ta !== tb) return tb - ta;
                    return (b.id || 0) - (a.id || 0);
                })[0];

            const data = latest?.data;
            const newType = (data && typeof data === 'object') ? data.newType : null;
            if (newType === 'service' || newType === 'physical') return newType;
        }

        // 2) 回退：根据订单商品类型推断（兼容不同字段形态）
        const items = Array.isArray(order.items) ? order.items : [];
        const hasServiceProduct =
            items.some(it =>
                it?.productType === 'service' ||
                it?.product?.productType === 'service' ||
                it?.Product?.productType === 'service' ||
                it?.productSnapshot?.productType === 'service'
            ) ||
            order?.product?.productType === 'service' ||
            order?.productType === 'service';

        return hasServiceProduct ? 'service' : 'physical';
    }

    isServiceOrder(order) {
        return this.getOrderType(order) === 'service';
    }

    // 初始化
    async init() {
        console.log('[OrderManagement] init() 方法被调用');
        try {
            console.log('[OrderManagement] 开始加载订单...');
            await this.loadOrders();
            console.log('[OrderManagement] 订单加载完成，绑定事件监听器...');
            this.bindEventListeners();
            console.log('[OrderManagement] 事件监听器绑定完成');
        } catch (error) {
            console.error('[OrderManagement] init() 执行失败:', error);
            throw error;
        }
    }

    // 绑定事件监听器
    bindEventListeners() {
        // 状态筛选
        document.getElementById('statusFilter')?.addEventListener('change', (e) => {
            this.currentStatus = e.target.value;
            this.currentPage = 1;
            this.loadOrders();
        });

        // 退货处理单选框变化
        document.querySelectorAll('input[name="returnAction"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const returnAmountSection = document.getElementById('returnAmountSection');
                if (e.target.value === 'approve') {
                    returnAmountSection.style.display = 'block';
                } else {
                    returnAmountSection.style.display = 'none';
                }
            });
        });
    }

    // 加载订单列表
    async loadOrders() {
        try {
            console.log('[OrderManagement] 开始加载订单列表...');
            const params = new URLSearchParams({
                page: this.currentPage,
                limit: this.pageSize
            });
            
            if (this.currentStatus) {
                params.append('status', this.currentStatus);
            }

            const url = `/api/orders?${params}`;
            console.log('[OrderManagement] 请求URL:', url);
            console.log('[OrderManagement] 请求头:', getAuthHeaders());

            const response = await fetch(url, {
                headers: getAuthHeaders()
            });

            console.log('[OrderManagement] 响应状态:', response.status, response.statusText);

            const result = await response.json();
            console.log('[OrderManagement] API响应:', result);
            
            if (result.code === 0) {
                this.orders = result.data.orders || [];
                this.totalPages = result.data.totalPages || 0;
                console.log('[OrderManagement] 订单数量:', this.orders.length);
                console.log('[OrderManagement] 总页数:', this.totalPages);
                this.renderOrders();
                this.renderPagination();
            } else {
                console.error('[OrderManagement] API返回错误:', result.message);
                showAlert('加载订单失败: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('[OrderManagement] 加载订单失败:', error);
            console.error('[OrderManagement] 错误详情:', error.message, error.stack);
            showAlert('加载订单失败: ' + error.message, 'error');
        }
    }

    // 渲染订单列表
    renderOrders() {
        console.log('[OrderManagement] 开始渲染订单列表，订单数量:', this.orders.length);
        
        // 优先查找 orderTableBody（第一个表格，有完整的列结构）
        // 如果找不到，再查找 ordersTableBody（第二个表格）
        let tbody = document.getElementById('orderTableBody');
        if (!tbody) {
            console.warn('[OrderManagement] 找不到 orderTableBody，尝试查找 ordersTableBody');
            tbody = document.getElementById('ordersTableBody');
        }
        if (!tbody) {
            console.error('[OrderManagement] 找不到订单表格tbody元素');
            console.error('[OrderManagement] 尝试查找的元素: orderTableBody, ordersTableBody');
            // 尝试查找所有可能的表格
            const allTables = document.querySelectorAll('table tbody');
            console.log('[OrderManagement] 页面中所有tbody元素:', allTables.length);
            allTables.forEach((tb, idx) => {
                console.log(`[OrderManagement] tbody[${idx}]:`, tb.id, tb.className, tb.closest('.table-section') ? '在table-section中' : '不在table-section中');
            });
            return;
        }

        console.log('[OrderManagement] 找到表格tbody:', tbody.id);
        
        // 确保表格是可见的
        const table = tbody.closest('table');
        const tableSection = tbody.closest('.table-section');
        if (table) {
            table.style.display = '';
            table.style.visibility = 'visible';
        }
        if (tableSection) {
            tableSection.style.display = '';
            tableSection.style.visibility = 'visible';
        }
        
        tbody.innerHTML = '';

        if (this.orders.length === 0) {
            // 根据表格列数设置colspan
            const table = tbody.closest('table');
            const headerRow = table?.querySelector('thead tr');
            const colCount = headerRow?.querySelectorAll('th').length || 9;
            tbody.innerHTML = `<tr><td colspan="${colCount}" class="text-center">暂无订单数据</td></tr>`;
            console.log('[OrderManagement] 没有订单数据，显示空状态');
            return;
        }

        this.orders.forEach(order => {
            // 处理商品信息（支持多商品）
            let productInfo = '-';
            let totalQuantity = 0;
            
            if (order.items && order.items.length > 0) {
                // 多商品订单
                const itemNames = order.items.map(item => item.productName || '-').join('、');
                productInfo = order.items.length > 1 ? `${itemNames} (${order.items.length}件商品)` : itemNames;
                totalQuantity = order.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
            } else if (order.product) {
                // 单商品订单（兼容旧数据）
                productInfo = order.product.name || '-';
                totalQuantity = order.quantity || 0;
            } else {
                totalQuantity = order.quantity || 0;
            }

            const row = document.createElement('tr');
            
            // 检查表格是否有复选框列（通过检查表头）
            const table = tbody.closest('table');
            const headerRow = table?.querySelector('thead tr');
            const hasCheckbox = headerRow?.querySelector('th input[type="checkbox"]') !== null;
            const hasUnitPrice = headerRow?.textContent.includes('单价');
            
            // 构建行HTML
            let rowHtml = '';
            
            // 如果有复选框列，添加复选框
            if (hasCheckbox) {
                rowHtml += `<td><input type="checkbox" class="order-checkbox" value="${order.id}"></td>`;
            }
            
            // 订单号
            rowHtml += `<td>${order.orderNo || '-'}</td>`;
            
            // 会员信息
            rowHtml += `<td>${order.member?.nickname || '-'}</td>`;
            
            // 商品信息
            rowHtml += `<td>${productInfo}</td>`;
            
            // 数量
            rowHtml += `<td>${totalQuantity}</td>`;
            
            // 计算原始总价（从订单项中获取）
            let originalTotalAmount = 0;
            if (order.items && order.items.length > 0) {
                originalTotalAmount = order.items.reduce((sum, item) => {
                    // 使用订单项中的unitPrice和quantity计算原始总价
                    const itemTotal = parseFloat(item.unitPrice || 0) * parseInt(item.quantity || 0);
                    return sum + itemTotal;
                }, 0);
            } else {
                // 如果没有订单项，使用订单的unitPrice和quantity
                originalTotalAmount = parseFloat(order.unitPrice || 0) * parseInt(order.quantity || 0);
            }
            
            // 如果有单价列，计算单价（使用原始价格）
            if (hasUnitPrice) {
                const unitPrice = totalQuantity > 0 ? (originalTotalAmount / totalQuantity).toFixed(2) : '0.00';
                rowHtml += `<td>¥${unitPrice}</td>`;
            }
            
            // 总金额（显示原始总价，如果实际支付为0则显示原始价格）
            const displayAmount = originalTotalAmount > 0 ? originalTotalAmount : (order.totalAmount || 0);
            rowHtml += `<td>¥${displayAmount.toFixed(2)}`;
            // 如果使用佣金/积分支付且实际支付为0，显示实际支付信息
            if (order.totalAmount === 0 && (order.paymentMethod === 'commission' || order.paymentMethod === 'points' || order.paymentMethod === 'mixed')) {
                rowHtml += `<br><small class="text-muted">实付：¥0.00</small>`;
            }
            rowHtml += `</td>`;
            
            // 状态
            rowHtml += `<td>${this.getStatusBadge(order.status)}</td>`;
            
            // 支付方式
            rowHtml += `<td>${this.getPaymentMethodText(order.paymentMethod)}</td>`;
            
            // 支付时间（如果有这个列）
            if (headerRow?.textContent.includes('支付时间')) {
                rowHtml += `<td>${order.paymentTime ? this.formatDate(order.paymentTime) : '-'}</td>`;
            }
            
            // 创建时间
            rowHtml += `<td>${this.formatDate(order.createdAt)}</td>`;
            
            // 操作
            rowHtml += `<td>
                <div class="btn-group" role="group">
                    <button class="btn btn-sm btn-info" onclick="orderManagement.viewOrder(${order.id})" title="查看详情">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${this.getActionButtons(order)}
                </div>
            </td>`;
            
            row.innerHTML = rowHtml;
            tbody.appendChild(row);
        });
        
        console.log('[OrderManagement] 订单列表渲染完成，共渲染', this.orders.length, '条订单');
    }

    // 获取操作按钮
    getActionButtons(order) {
        let buttons = '';

        // 修改订单（仅待支付状态）
        if (order.status === 'pending') {
            buttons += `<button class="btn btn-sm btn-warning" onclick="orderManagement.editOrder(${order.id})" title="修改订单">
                <i class="fas fa-edit"></i>
            </button>`;
        }

        // 发货（已支付状态）- 检查是否为服务商品
        if (order.status === 'paid') {
            const isServiceOrder = this.isServiceOrder(order);
            if (isServiceOrder) {
                // 服务商品显示核销按钮
                buttons += `<button class="btn btn-sm btn-success" onclick="orderManagement.verifyOrder(${order.id})" title="核销">
                    <i class="fas fa-check-circle"></i>
                </button>`;
            } else {
                // 实物商品显示发货按钮
                buttons += `<button class="btn btn-sm btn-primary" onclick="orderManagement.shipOrder(${order.id})" title="发货">
                    <i class="fas fa-truck"></i>
                </button>`;
            }
        }

        // 确认收货（已发货状态）
        if (order.status === 'shipped') {
            buttons += `<button class="btn btn-sm btn-success" onclick="orderManagement.deliverOrder(${order.id})" title="确认收货">
                <i class="fas fa-check"></i>
            </button>`;
        }

        // 处理退货申请
        if (order.returnStatus === 'requested') {
            buttons += `<button class="btn btn-sm btn-warning" onclick="orderManagement.processReturn(${order.id})" title="处理退货">
                <i class="fas fa-undo"></i>
            </button>`;
        }

        // 处理退款申请
        if (order.refundStatus === 'requested') {
            buttons += `<button class="btn btn-sm btn-danger" onclick="orderManagement.processRefund(${order.id})" title="处理退款">
                <i class="fas fa-money-bill-wave"></i>
            </button>`;
        }

        // 完成退款
        if (order.refundStatus === 'processing') {
            buttons += `<button class="btn btn-sm btn-success" onclick="orderManagement.completeRefund(${order.id})" title="完成退款">
                <i class="fas fa-check-circle"></i>
            </button>`;
        }

        return buttons;
    }

    // 获取状态徽章
    getStatusBadge(status) {
        const statusMap = {
            'pending': { text: '待支付', class: 'bg-warning' },
            'paid': { text: '已支付', class: 'bg-primary' },
            'shipped': { text: '已发货', class: 'bg-info' },
            'delivered': { text: '已收货', class: 'bg-success' },
            'cancelled': { text: '已取消', class: 'bg-secondary' },
            'returned': { text: '已退货', class: 'bg-warning' },
            'refunded': { text: '已退款', class: 'bg-danger' }
        };
        
        const statusInfo = statusMap[status] || { text: status, class: 'bg-secondary' };
        return `<span class="badge ${statusInfo.class}">${statusInfo.text}</span>`;
    }

    // 获取支付方式文本
    getPaymentMethodText(method) {
        const methodMap = {
            'wechat': '微信支付',
            'alipay': '支付宝',
            'bank': '银行卡',
            'points': '积分支付',
            'commission': '佣金支付',
            'test': '测试支付'
        };
        return methodMap[method] || method || '-';
    }

    // 渲染分页
    renderPagination() {
        const pagination = document.getElementById('ordersPagination');
        if (!pagination) return;

        pagination.innerHTML = '';

        // 上一页
        const prevLi = document.createElement('li');
        prevLi.className = `page-item ${this.currentPage === 1 ? 'disabled' : ''}`;
        prevLi.innerHTML = `<a class="page-link" href="#" onclick="orderManagement.goToPage(${this.currentPage - 1})">上一页</a>`;
        pagination.appendChild(prevLi);

        // 页码
        for (let i = 1; i <= this.totalPages; i++) {
            const li = document.createElement('li');
            li.className = `page-item ${i === this.currentPage ? 'active' : ''}`;
            li.innerHTML = `<a class="page-link" href="#" onclick="orderManagement.goToPage(${i})">${i}</a>`;
            pagination.appendChild(li);
        }

        // 下一页
        const nextLi = document.createElement('li');
        nextLi.className = `page-item ${this.currentPage === this.totalPages ? 'disabled' : ''}`;
        nextLi.innerHTML = `<a class="page-link" href="#" onclick="orderManagement.goToPage(${this.currentPage + 1})">下一页</a>`;
        pagination.appendChild(nextLi);
    }

    // 跳转页面
    goToPage(page) {
        if (page < 1 || page > this.totalPages) return;
        this.currentPage = page;
        this.loadOrders();
    }

    // 查看订单详情
    async viewOrder(orderId) {
        try {
            const response = await fetch(`/api/orders/${orderId}`, {
                headers: getAuthHeaders()
            });

            const result = await response.json();
            
            if (result.code === 0) {
                this.currentOrder = result.data.order;
                console.log('[OrderManagement] 订单数据:', this.currentOrder);
                console.log('[OrderManagement] 订单项数量:', this.currentOrder.items?.length || 0);
                console.log('[OrderManagement] 订单项详情:', this.currentOrder.items);
                console.log('[OrderManagement] 佣金记录数量:', this.currentOrder.commissionRecords?.length || 0);
                console.log('[OrderManagement] 佣金记录详情:', this.currentOrder.commissionRecords);
                console.log('[OrderManagement] 金额计算信息:', this.currentOrder.amountCalculation);
                this.showOrderDetail();
            } else {
                showAlert('获取订单详情失败: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('获取订单详情失败:', error);
            showAlert('获取订单详情失败', 'error');
        }
    }

    // 显示订单详情
    showOrderDetail() {
        const order = this.currentOrder;
        if (!order) {
            console.error('[OrderManagement] showOrderDetail: 订单数据为空');
            return;
        }

        try {
            // 基本信息
            const detailOrderNo = document.getElementById('detailOrderNo');
            const detailOrderStatus = document.getElementById('detailOrderStatus');
            const detailPaymentMethod = document.getElementById('detailPaymentMethod');
            const detailPaymentTime = document.getElementById('detailPaymentTime');
            const detailCreatedAt = document.getElementById('detailCreatedAt');
            const detailOrderType = document.getElementById('detailOrderType');
            const changeOrderTypeBtn = document.getElementById('changeOrderTypeBtn');
            
            if (detailOrderNo) detailOrderNo.textContent = order.orderNo || '-';
            if (detailOrderStatus) detailOrderStatus.innerHTML = this.getStatusBadge(order.status);
            if (detailPaymentMethod) detailPaymentMethod.textContent = this.getPaymentMethodText(order.paymentMethod);
            if (detailPaymentTime) detailPaymentTime.textContent = order.paymentTime ? this.formatDate(order.paymentTime) : '-';
            if (detailCreatedAt) detailCreatedAt.textContent = this.formatDate(order.createdAt);
            
            // 订单类型显示和变更按钮（优先读取 change_type 日志）
            const orderType = this.getOrderType(order);
            const orderTypeText = orderType === 'service' ? '服务商品 / 核销' : '实物商品 / 发货';
            if (detailOrderType) {
                detailOrderType.textContent = orderTypeText;
            }
            if (changeOrderTypeBtn) {
                // 已支付状态的订单可以变更类型
                if (order.status === 'paid') {
                    changeOrderTypeBtn.style.display = 'inline-block';
                } else {
                    changeOrderTypeBtn.style.display = 'none';
                }
            }

            // 会员信息
            const detailMemberName = document.getElementById('detailMemberName');
            const detailMemberPhone = document.getElementById('detailMemberPhone');
            const detailReceiverName = document.getElementById('detailReceiverName');
            const detailReceiverPhone = document.getElementById('detailReceiverPhone');
            const detailShippingAddress = document.getElementById('detailShippingAddress');
            
            if (detailMemberName) detailMemberName.textContent = order.member?.nickname || '-';
            if (detailMemberPhone) detailMemberPhone.textContent = order.member?.phone || '-';
            if (detailReceiverName) detailReceiverName.textContent = order.receiverName || '-';
            if (detailReceiverPhone) detailReceiverPhone.textContent = order.receiverPhone || '-';
            if (detailShippingAddress) detailShippingAddress.textContent = order.shippingAddress || '-';

            // 商品信息（支持多商品）
            const detailProductList = document.getElementById('detailProductList');
            const detailProductName = document.getElementById('detailProductName');
            const detailUnitPrice = document.getElementById('detailUnitPrice');
            const detailQuantity = document.getElementById('detailQuantity');
            const detailTotalAmount = document.getElementById('detailTotalAmount');
            const detailProductImage = document.getElementById('detailProductImage');
            
            console.log('[OrderManagement] 商品信息 - detailProductList存在:', !!detailProductList);
            console.log('[OrderManagement] 商品信息 - order.items:', order.items);
            console.log('[OrderManagement] 商品信息 - order.product:', order.product);
            
            if (order.items && order.items.length > 0) {
                // 多商品订单 - 使用表格显示
                console.log('[OrderManagement] 显示多商品订单，商品数量:', order.items.length);
                let productHtml = '<div class="table-responsive"><table class="table table-sm table-bordered">';
                productHtml += '<thead><tr><th>商品图片</th><th>商品名称</th><th>规格</th><th>单价</th><th>数量</th><th>小计</th></tr></thead><tbody>';
                order.items.forEach((item) => {
                    console.log('[OrderManagement] 处理商品项:', item);
                    productHtml += `
                        <tr>
                            <td><img src="${item.productImage || '/images/default-product.svg'}" alt="${item.productName || '商品'}" class="img-fluid" style="max-height: 80px;" onerror="this.src='/images/default-product.svg'; this.onerror=null;"></td>
                            <td>${item.productName || '-'}</td>
                            <td>${item.skuName || '-'}</td>
                            <td>¥${parseFloat(item.unitPrice || 0).toFixed(2)}</td>
                            <td>${item.quantity || 0}</td>
                            <td>¥${parseFloat(item.totalAmount || 0).toFixed(2)}</td>
                        </tr>
                    `;
                });
                productHtml += '</tbody></table></div>';
                productHtml += `<p class="mt-2"><strong>商品总数：</strong>${order.items.reduce((sum, item) => sum + (item.quantity || 0), 0)} 件</p>`;
                
                if (detailProductList) {
                    detailProductList.innerHTML = productHtml;
                    console.log('[OrderManagement] 商品信息已更新到 detailProductList');
                } else {
                    console.error('[OrderManagement] detailProductList 元素不存在');
                }
            } else if (order.product && detailProductName) {
                // 单商品订单（兼容旧数据）
                console.log('[OrderManagement] 显示单商品订单');
                if (detailProductName) detailProductName.textContent = order.product.name || '-';
                if (detailUnitPrice) detailUnitPrice.textContent = `¥${parseFloat(order.unitPrice || 0).toFixed(2)}`;
                if (detailQuantity) detailQuantity.textContent = order.quantity || '-';
                if (detailTotalAmount) detailTotalAmount.textContent = `¥${parseFloat(order.totalAmount || 0).toFixed(2)}`;
                
                if (detailProductImage && order.product.images && order.product.images.length > 0) {
                    detailProductImage.src = order.product.images[0];
                }
            } else {
                // 既没有items也没有product，使用订单基本信息
                console.log('[OrderManagement] 没有商品信息，使用订单基本信息');
                console.log('[OrderManagement] order.unitPrice:', order.unitPrice, 'order.quantity:', order.quantity);
                
                if (detailProductList) {
                    // Bootstrap模态框结构
                    detailProductList.innerHTML = `
                        <div class="row">
                            <div class="col-md-12">
                                <p><strong>商品名称：</strong>${order.productId ? '商品ID: ' + order.productId : '-'}</p>
                                <p><strong>单价：</strong>¥${parseFloat(order.unitPrice || 0).toFixed(2)}</p>
                                <p><strong>数量：</strong>${order.quantity || '-'}</p>
                                <p><strong>总金额：</strong>¥${parseFloat(order.totalAmount || 0).toFixed(2)}</p>
                            </div>
                        </div>
                    `;
                } else if (detailProductName) {
                    // 兼容旧结构
                    if (detailProductName) detailProductName.textContent = order.productId ? '商品ID: ' + order.productId : '-';
                    if (detailUnitPrice) detailUnitPrice.textContent = `¥${parseFloat(order.unitPrice || 0).toFixed(2)}`;
                    if (detailQuantity) detailQuantity.textContent = order.quantity || '-';
                    if (detailTotalAmount) detailTotalAmount.textContent = `¥${parseFloat(order.totalAmount || 0).toFixed(2)}`;
                }
            }
            
            // 如果订单有items但detailProductList不存在，尝试更新detailProductName等元素
            if (order.items && order.items.length > 0 && !detailProductList && detailProductName) {
                console.log('[OrderManagement] 订单有items但detailProductList不存在，使用detailProductName等元素');
                const firstItem = order.items[0];
                if (detailProductName) detailProductName.textContent = firstItem.productName || '-';
                if (detailUnitPrice) detailUnitPrice.textContent = `¥${parseFloat(firstItem.unitPrice || 0).toFixed(2)}`;
                if (detailQuantity) detailQuantity.textContent = order.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
                if (detailTotalAmount) detailTotalAmount.textContent = `¥${parseFloat(order.totalAmount || 0).toFixed(2)}`;
                
                if (detailProductImage && firstItem.productImage) {
                    detailProductImage.src = firstItem.productImage;
                }
            }

            // 物流信息
            const shippingSection = document.getElementById('shippingInfoSection');
            if (shippingSection) {
                if (order.shippingCompany || order.trackingNumber) {
                    shippingSection.style.display = 'block';
                    const detailShippingCompany = document.getElementById('detailShippingCompany');
                    const detailTrackingNumber = document.getElementById('detailTrackingNumber');
                    const detailShippedAt = document.getElementById('detailShippedAt');
                    const detailDeliveredAt = document.getElementById('detailDeliveredAt');
                    
                    if (detailShippingCompany) detailShippingCompany.textContent = order.shippingCompany || '-';
                    if (detailTrackingNumber) detailTrackingNumber.textContent = order.trackingNumber || '-';
                    if (detailShippedAt) detailShippedAt.textContent = order.shippedAt ? this.formatDate(order.shippedAt) : '-';
                    if (detailDeliveredAt) detailDeliveredAt.textContent = order.deliveredAt ? this.formatDate(order.deliveredAt) : '-';
                } else {
                    shippingSection.style.display = 'none';
                }
            }

            // 退货退款信息
            const returnRefundSection = document.getElementById('returnRefundSection');
            if (returnRefundSection) {
                if (order.returnStatus !== 'none' || order.refundStatus !== 'none') {
                    returnRefundSection.style.display = 'block';
                    
                    // 退货信息
                    const detailReturnStatus = document.getElementById('detailReturnStatus');
                    const detailReturnReason = document.getElementById('detailReturnReason');
                    const detailReturnAmount = document.getElementById('detailReturnAmount');
                    
                    if (detailReturnStatus) detailReturnStatus.innerHTML = this.getReturnStatusBadge(order.returnStatus);
                    if (detailReturnReason) detailReturnReason.textContent = order.returnReason || '-';
                    if (detailReturnAmount) detailReturnAmount.textContent = order.returnAmount ? `¥${order.returnAmount}` : '-';
                    
                    // 退款信息
                    const detailRefundStatus = document.getElementById('detailRefundStatus');
                    const detailRefundAmount = document.getElementById('detailRefundAmount');
                    const detailRefundMethod = document.getElementById('detailRefundMethod');
                    const detailRefundedAt = document.getElementById('detailRefundedAt');
                    
                    if (detailRefundStatus) detailRefundStatus.innerHTML = this.getRefundStatusBadge(order.refundStatus);
                    if (detailRefundAmount) detailRefundAmount.textContent = order.refundAmount ? `¥${order.refundAmount}` : '-';
                    if (detailRefundMethod) detailRefundMethod.textContent = this.getRefundMethodText(order.refundMethod);
                    if (detailRefundedAt) detailRefundedAt.textContent = order.refundedAt ? this.formatDate(order.refundedAt) : '-';
                } else {
                    returnRefundSection.style.display = 'none';
                }
            }

            // 备注信息
            const detailRemark = document.getElementById('detailRemark');
            if (detailRemark) {
                detailRemark.textContent = order.remark || '-';
            }

            // 金额计算流程
            this.renderAmountCalculation(order);

            // 佣金记录
            this.renderCommissionRecords(order.commissionRecords || []);

            // 操作日志
            this.renderOperationLogs(order.operationLogs || []);

            // 显示/隐藏核销按钮（服务商品订单）
            const verifyOrderBtn = document.getElementById('verifyOrderBtn');
            if (verifyOrderBtn) {
                const isServiceOrder = this.isServiceOrder(order);
                if (isServiceOrder && order.status === 'paid') {
                    verifyOrderBtn.style.display = 'inline-block';
                    this.currentOrderId = order.id; // 保存订单ID用于核销
                } else {
                    verifyOrderBtn.style.display = 'none';
                }
            }

            // 保存当前订单ID用于核销
            this.currentOrderId = order.id;

            // 显示模态框 - 尝试使用Bootstrap模态框
            const modalElement = document.getElementById('orderDetailModal');
            if (modalElement) {
                // 检查是否有Bootstrap
                if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
                    const modal = new bootstrap.Modal(modalElement);
                    modal.show();
                    // 保存modal实例以便关闭
                    this.orderDetailModal = modal;
                } else {
                    // 如果没有Bootstrap，使用简单的显示方式
                    modalElement.style.display = 'flex';
                    modalElement.classList.add('show');
                }
            } else {
                console.error('[OrderManagement] 找不到订单详情模态框元素');
                showAlert('无法显示订单详情：模态框元素不存在', 'error');
            }
        } catch (error) {
            console.error('[OrderManagement] 显示订单详情失败:', error);
            showAlert('显示订单详情失败: ' + error.message, 'error');
        }
    }

    // 显示金额计算流程
    renderAmountCalculation(order) {
        console.log('[OrderManagement] 渲染金额计算流程，订单数据:', order);
        const calc = order.amountCalculation || {};
        // 如果没有amountCalculation，尝试从订单项计算原价
        let originalAmount = calc.originalAmount;
        if (!originalAmount) {
            if (order.itemsOriginalTotal) {
                originalAmount = order.itemsOriginalTotal;
            } else if (order.items && order.items.length > 0) {
                originalAmount = order.items.reduce((sum, item) => {
                    return sum + (parseFloat(item.unitPrice || 0) * parseInt(item.quantity || 0));
                }, 0);
            } else {
                originalAmount = parseFloat(order.unitPrice || 0) * parseInt(order.quantity || 0);
            }
        }
        const commissionDeduction = calc.commissionDeduction || 0;
        const pointsDeduction = calc.pointsDeduction || 0;
        const finalAmount = calc.finalAmount || order.totalAmount || 0;
        console.log('[OrderManagement] 金额计算 - 原价:', originalAmount, '佣金抵扣:', commissionDeduction, '积分抵扣:', pointsDeduction, '最终金额:', finalAmount);
        
        // 计算总优惠（从订单项中获取）
        let totalCouponDiscount = 0;
        let totalPromotionDiscount = 0;
        if (order.items && order.items.length > 0) {
            order.items.forEach(item => {
                if (item.appliedCoupons && Array.isArray(item.appliedCoupons)) {
                    item.appliedCoupons.forEach(coupon => {
                        totalCouponDiscount += parseFloat(coupon.discountAmount || 0);
                    });
                }
                if (item.discounts && Array.isArray(item.discounts)) {
                    item.discounts.forEach(discount => {
                        if (discount.type === 'promotion') {
                            totalPromotionDiscount += parseFloat(discount.amount || 0);
                        }
                    });
                }
            });
        }
        
        const afterDiscount = originalAmount - totalCouponDiscount - totalPromotionDiscount;
        
        // 更新显示
        const detailOriginalAmount = document.getElementById('detailOriginalAmount');
        const detailCouponRow = document.getElementById('detailCouponRow');
        const detailCouponDiscount = document.getElementById('detailCouponDiscount');
        const detailPromotionRow = document.getElementById('detailPromotionRow');
        const detailPromotionDiscount = document.getElementById('detailPromotionDiscount');
        const detailAfterDiscount = document.getElementById('detailAfterDiscount');
        const detailCommissionDeductionRow = document.getElementById('detailCommissionDeductionRow');
        const detailCommissionDeduction = document.getElementById('detailCommissionDeduction');
        const detailPointsDeductionRow = document.getElementById('detailPointsDeductionRow');
        const detailPointsDeduction = document.getElementById('detailPointsDeduction');
        const detailFinalAmount = document.getElementById('detailFinalAmount');
        
        if (detailOriginalAmount) detailOriginalAmount.textContent = `¥${parseFloat(originalAmount).toFixed(2)}`;
        
        if (totalCouponDiscount > 0) {
            if (detailCouponRow) detailCouponRow.style.display = '';
            if (detailCouponDiscount) detailCouponDiscount.textContent = `-¥${parseFloat(totalCouponDiscount).toFixed(2)}`;
        } else {
            if (detailCouponRow) detailCouponRow.style.display = 'none';
        }
        
        if (totalPromotionDiscount > 0) {
            if (detailPromotionRow) detailPromotionRow.style.display = '';
            if (detailPromotionDiscount) detailPromotionDiscount.textContent = `-¥${parseFloat(totalPromotionDiscount).toFixed(2)}`;
        } else {
            if (detailPromotionRow) detailPromotionRow.style.display = 'none';
        }
        
        if (detailAfterDiscount) detailAfterDiscount.textContent = `¥${parseFloat(afterDiscount).toFixed(2)}`;
        
        if (commissionDeduction > 0) {
            if (detailCommissionDeductionRow) detailCommissionDeductionRow.style.display = '';
            if (detailCommissionDeduction) detailCommissionDeduction.textContent = `-¥${parseFloat(commissionDeduction).toFixed(2)}`;
        } else {
            if (detailCommissionDeductionRow) detailCommissionDeductionRow.style.display = 'none';
        }
        
        if (pointsDeduction > 0) {
            if (detailPointsDeductionRow) detailPointsDeductionRow.style.display = '';
            if (detailPointsDeduction) detailPointsDeduction.textContent = `-¥${parseFloat(pointsDeduction).toFixed(2)}`;
        } else {
            if (detailPointsDeductionRow) detailPointsDeductionRow.style.display = 'none';
        }
        
        if (detailFinalAmount) detailFinalAmount.textContent = `¥${parseFloat(finalAmount).toFixed(2)}`;
    }

    // 显示佣金记录
    renderCommissionRecords(records) {
        console.log('[OrderManagement] 渲染佣金记录，记录数量:', records?.length || 0);
        console.log('[OrderManagement] 佣金记录数据:', records);
        
        // 尝试两个可能的元素ID（Bootstrap模态框和旧模态框）
        const section = document.getElementById('commissionRecordsSection');
        const tbody = document.getElementById('detailCommissionRecords');
        const oldTbody = document.getElementById('commissionRecordsBody');
        
        console.log('[OrderManagement] commissionRecordsSection存在:', !!section);
        console.log('[OrderManagement] detailCommissionRecords存在:', !!tbody);
        console.log('[OrderManagement] commissionRecordsBody存在:', !!oldTbody);
        
        // 使用Bootstrap模态框的佣金记录区域
        if (section && tbody) {
            if (records && records.length > 0) {
                console.log('[OrderManagement] 显示佣金记录，数量:', records.length);
                section.style.display = 'block';
                let html = '';
                records.forEach(record => {
                    console.log('[OrderManagement] 处理佣金记录:', record);
                    const typeText = {
                        'direct': '直接佣金',
                        'indirect': '间接佣金',
                        'differential': '级差佣金',
                        'team_expansion': '团队拓展佣金',
                        'admin_adjust': '管理员调整'
                    }[record.type] || record.type;
                    
                    html += `
                        <tr>
                            <td>${typeText}</td>
                            <td class="text-end">¥${parseFloat(record.amount || 0).toFixed(2)}</td>
                            <td>${record.description || '-'}</td>
                            <td>${this.formatDate(record.createdAt)}</td>
                        </tr>
                    `;
                });
                tbody.innerHTML = html;
            } else {
                console.log('[OrderManagement] 没有佣金记录，隐藏区域');
                section.style.display = 'none';
                tbody.innerHTML = '<tr><td colspan="4" class="text-center">暂无佣金记录</td></tr>';
            }
        }
        
        // 同时更新旧模态框的佣金记录（如果存在）
        if (oldTbody) {
            if (records && records.length > 0) {
                let html = '';
                records.forEach(record => {
                    const typeText = {
                        'direct': '直接佣金',
                        'indirect': '间接佣金',
                        'differential': '级差佣金',
                        'team_expansion': '团队拓展佣金',
                        'admin_adjust': '管理员调整'
                    }[record.type] || record.type;
                    
                    // 获取受益人信息（如果有member关联）
                    const beneficiary = record.member ? (record.member.nickname || record.member.phone || '-') : '-';
                    const status = record.status || '已完成';
                    
                    html += `
                        <tr>
                            <td>${typeText}</td>
                            <td>${beneficiary}</td>
                            <td>¥${parseFloat(record.amount || 0).toFixed(2)}</td>
                            <td>${status}</td>
                            <td>${this.formatDate(record.createdAt)}</td>
                        </tr>
                    `;
                });
                oldTbody.innerHTML = html;
            } else {
                oldTbody.innerHTML = '<tr><td colspan="5" class="text-center">暂无佣金记录</td></tr>';
            }
        }
    }

    // 关闭订单详情
    closeOrderDetail() {
        const modalElement = document.getElementById('orderDetailModal');
        if (modalElement) {
            if (this.orderDetailModal) {
                this.orderDetailModal.hide();
            } else if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
                const modal = bootstrap.Modal.getInstance(modalElement);
                if (modal) {
                    modal.hide();
                }
            } else {
                modalElement.style.display = 'none';
                modalElement.classList.remove('show');
            }
        }
        // 清除当前订单ID
        this.currentOrderId = null;
    }

    // 获取退货状态徽章
    getReturnStatusBadge(status) {
        const statusMap = {
            'none': { text: '无', class: 'bg-secondary' },
            'requested': { text: '申请中', class: 'bg-warning' },
            'approved': { text: '已通过', class: 'bg-success' },
            'rejected': { text: '已拒绝', class: 'bg-danger' },
            'returned': { text: '已退货', class: 'bg-info' },
            'refunded': { text: '已退款', class: 'bg-primary' }
        };
        
        const statusInfo = statusMap[status] || { text: status, class: 'bg-secondary' };
        return `<span class="badge ${statusInfo.class}">${statusInfo.text}</span>`;
    }

    // 获取退款状态徽章
    getRefundStatusBadge(status) {
        const statusMap = {
            'none': { text: '无', class: 'bg-secondary' },
            'requested': { text: '申请中', class: 'bg-warning' },
            'processing': { text: '处理中', class: 'bg-info' },
            'completed': { text: '已完成', class: 'bg-success' },
            'failed': { text: '失败', class: 'bg-danger' }
        };
        
        const statusInfo = statusMap[status] || { text: status, class: 'bg-secondary' };
        return `<span class="badge ${statusInfo.class}">${statusInfo.text}</span>`;
    }

    // 获取退款方式文本
    getRefundMethodText(method) {
        const methodMap = {
            'original': '原路返回',
            'points': '积分返还',
            'commission': '佣金返还'
        };
        return methodMap[method] || method || '-';
    }

    // 渲染操作日志
    renderOperationLogs(logs) {
        const container = document.getElementById('operationLogs');
        if (!container) return;

        container.innerHTML = '';

        if (logs.length === 0) {
            container.innerHTML = '<p class="text-muted">暂无操作记录</p>';
            return;
        }

        logs.forEach(log => {
            const logItem = document.createElement('div');
            logItem.className = 'border-bottom py-2';
            logItem.innerHTML = `
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <strong>${this.getOperationText(log.operation)}</strong>
                        <span class="text-muted">- ${log.description || ''}</span>
                    </div>
                    <div class="text-end">
                        <small class="text-muted">${this.formatDate(log.createdAt)}</small>
                        <br>
                        <small class="text-muted">${log.operator?.username || '系统'}</small>
                    </div>
                </div>
            `;
            container.appendChild(logItem);
        });
    }

    // 获取操作文本
    getOperationText(operation) {
        const operationMap = {
            'create': '创建订单',
            'pay': '支付',
            'ship': '发货',
            'deliver': '确认收货',
            'cancel': '取消订单',
            'return': '退货',
            'refund': '退款',
            'modify': '修改订单'
        };
        return operationMap[operation] || operation;
    }

    // 修改订单
    async editOrder(orderId) {
        try {
            const response = await fetch(`/api/orders/${orderId}`, {
                headers: getAuthHeaders()
            });

            const result = await response.json();
            
            if (result.code === 0) {
                this.currentOrder = result.data.order;
                this.showEditOrderModal();
            } else {
                showAlert('获取订单信息失败: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('获取订单信息失败:', error);
            showAlert('获取订单信息失败', 'error');
        }
    }

    // 显示修改订单模态框
    showEditOrderModal() {
        const order = this.currentOrder;
        if (!order) return;

        // 这里可以创建一个修改订单的模态框
        // 由于HTML中没有定义，这里先显示一个简单的提示
        const newData = prompt('请输入新的订单信息（JSON格式）:', JSON.stringify({
            quantity: order.quantity,
            unitPrice: order.unitPrice,
            totalAmount: order.totalAmount,
            shippingAddress: order.shippingAddress,
            receiverName: order.receiverName,
            receiverPhone: order.receiverPhone,
            remark: order.remark
        }, null, 2));

        if (newData) {
            try {
                const updateData = JSON.parse(newData);
                this.updateOrder(order.id, updateData);
            } catch (error) {
                showAlert('JSON格式错误', 'error');
            }
        }
    }

    // 更新订单
    async updateOrder(orderId, data) {
        try {
            const response = await fetch(`/api/orders/${orderId}`, {
                method: 'PUT',
                headers: {
                    ...getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();
            
            if (result.code === 0) {
                showAlert('订单修改成功', 'success');
                this.loadOrders();
            } else {
                showAlert('订单修改失败: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('订单修改失败:', error);
            showAlert('订单修改失败', 'error');
        }
    }

    // 发货
    async shipOrder(orderId) {
        try {
            // 先获取订单信息，检查是否为服务商品
            const order = this.orders.find(o => o.id === parseInt(orderId));
            if (order && order.items && order.items.length > 0) {
                // 检查订单是否包含服务商品
                const isServiceOrder = this.isServiceOrder(order);
                if (isServiceOrder) {
                    showAlert('服务类商品订单不需要发货，请使用核销功能', 'info');
                    return;
                }
            }
            
            const shipOrderIdElement = document.getElementById('shipOrderId');
            const shipOrderModalElement = document.getElementById('shipOrderModal');
            
            if (!shipOrderIdElement || !shipOrderModalElement) {
                console.error('[OrderManagement] 找不到发货模态框元素');
                showAlert('无法打开发货对话框：模态框元素不存在', 'error');
                return;
            }
            
            shipOrderIdElement.value = orderId;
            
            // 清空表单
            document.getElementById('shippingCompany').value = '';
            document.getElementById('trackingNumber').value = '';
            document.getElementById('shippingMethod').value = '标准快递';
            const shippingRemarkEl = document.getElementById('shippingRemark');
            if (shippingRemarkEl) shippingRemarkEl.value = '';
            
            // 尝试使用Bootstrap模态框
            if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
                const modal = new bootstrap.Modal(shipOrderModalElement);
                modal.show();
                // 保存modal实例以便关闭
                this.shipOrderModal = modal;
            } else {
                // 如果没有Bootstrap，使用简单的显示方式
                shipOrderModalElement.style.display = 'flex';
                shipOrderModalElement.classList.add('show');
            }
        } catch (error) {
            console.error('[OrderManagement] 打开发货对话框失败:', error);
            showAlert('打开发货对话框失败: ' + error.message, 'error');
        }
    }

    // 关闭发货模态框
    closeShipOrder() {
        const modalElement = document.getElementById('shipOrderModal');
        if (modalElement) {
            if (this.shipOrderModal) {
                this.shipOrderModal.hide();
            } else if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
                const modal = bootstrap.Modal.getInstance(modalElement);
                if (modal) {
                    modal.hide();
                }
            } else {
                modalElement.style.display = 'none';
                modalElement.classList.remove('show');
            }
        }
    }

    // 确认发货
    async confirmShipOrder() {
        const orderId = document.getElementById('shipOrderId').value;
        const shippingCompany = document.getElementById('shippingCompany').value;
        const trackingNumber = document.getElementById('trackingNumber').value;
        const shippingMethod = document.getElementById('shippingMethod').value;
        const shippingRemark = document.getElementById('shippingRemark')?.value || '';

        if (!shippingCompany || !trackingNumber) {
            showAlert('请填写必填信息', 'error');
            return;
        }

        try {
            const response = await fetch(`/api/orders/${orderId}/ship`, {
                method: 'PUT',
                headers: {
                    ...getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    shippingCompany,
                    trackingNumber,
                    shippingMethod,
                    remark: shippingRemark
                })
            });

            const result = await response.json();
            
            if (result.code === 0) {
                showAlert('发货成功', 'success');
                this.closeShipOrder();
                this.loadOrders();
            } else {
                showAlert('发货失败: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('发货失败:', error);
            showAlert('发货失败', 'error');
        }
    }

    // 核销订单（从订单列表）
    async verifyOrder(orderId) {
        const verificationCode = prompt('请输入核销码（必填）');
        if (!verificationCode || !verificationCode.trim()) return;
        if (!confirm(`确认核销该服务订单？\n核销码：${verificationCode.trim()}`)) return;

        try {
            const response = await fetch(`/api/orders/${orderId}/verify`, {
                method: 'PUT',
                headers: {
                    ...getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ verificationCode: verificationCode.trim() })
            });

            const result = await response.json();
            
            if (result.code === 0) {
                showAlert('核销成功', 'success');
                this.loadOrders();
            } else {
                showAlert('核销失败: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('核销失败:', error);
            showAlert('核销失败', 'error');
        }
    }

    // 核销订单（从订单详情）
    async verifyOrderFromDetail() {
        if (!this.currentOrderId) {
            showAlert('订单ID不存在', 'error');
            return;
        }

        const verificationCode = prompt('请输入核销码（必填）');
        if (!verificationCode || !verificationCode.trim()) return;
        if (!confirm(`确认核销该服务订单？\n核销码：${verificationCode.trim()}`)) return;

        try {
            const response = await fetch(`/api/orders/${this.currentOrderId}/verify`, {
                method: 'PUT',
                headers: {
                    ...getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ verificationCode: verificationCode.trim() })
            });

            const result = await response.json();
            
            if (result.code === 0) {
                showAlert('核销成功', 'success');
                this.closeOrderDetail();
                this.loadOrders();
            } else {
                showAlert('核销失败: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('核销失败:', error);
            showAlert('核销失败', 'error');
        }
    }

    // 显示变更订单类型模态框
    showChangeOrderTypeModal() {
        if (!this.currentOrderId) {
            showAlert('订单ID不存在', 'error');
            return;
        }

        // 优先使用详情的 currentOrder（通常包含 operationLogs），否则回退到列表 orders
        const order = (this.currentOrder && this.currentOrder.id === this.currentOrderId)
            ? this.currentOrder
            : this.orders.find(o => o.id === this.currentOrderId);
        if (!order) {
            showAlert('订单不存在', 'error');
            return;
        }

        const modalElement = document.getElementById('changeOrderTypeModal');
        const orderIdElement = document.getElementById('changeOrderTypeId');
        const orderTypeElement = document.getElementById('newOrderType');
        
        if (!modalElement || !orderIdElement || !orderTypeElement) {
            showAlert('找不到变更订单类型模态框', 'error');
            return;
        }

        orderIdElement.value = this.currentOrderId;
        
        // 根据当前订单类型设置默认值（优先读取 change_type 日志）
        orderTypeElement.value = this.getOrderType(order);

        // 显示模态框
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            const modal = new bootstrap.Modal(modalElement);
            modal.show();
            this.changeOrderTypeModal = modal;
        } else {
            modalElement.style.display = 'flex';
            modalElement.classList.add('show');
        }
    }

    // 关闭变更订单类型模态框
    closeChangeOrderTypeModal() {
        const modalElement = document.getElementById('changeOrderTypeModal');
        if (modalElement) {
            if (this.changeOrderTypeModal) {
                this.changeOrderTypeModal.hide();
            } else if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
                const modal = bootstrap.Modal.getInstance(modalElement);
                if (modal) {
                    modal.hide();
                }
            } else {
                modalElement.style.display = 'none';
                modalElement.classList.remove('show');
            }
        }
    }

    // 确认变更订单类型
    async confirmChangeOrderType() {
        const orderId = document.getElementById('changeOrderTypeId').value;
        const newOrderType = document.getElementById('newOrderType').value;
        const remark = document.getElementById('changeOrderTypeRemark').value;

        if (!orderId || !newOrderType) {
            showAlert('请选择订单类型', 'error');
            return;
        }

        try {
            const response = await fetch(`/api/orders/${orderId}/change-type`, {
                method: 'PUT',
                headers: {
                    ...getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    orderType: newOrderType,
                    remark: remark
                })
            });

            const result = await response.json();
            
            if (result.code === 0) {
                showAlert('订单类型变更成功', 'success');
                this.closeChangeOrderTypeModal();
                // 重新加载订单详情
                await this.viewOrder(this.currentOrderId);
                this.loadOrders();
            } else {
                showAlert('订单类型变更失败: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('变更订单类型失败:', error);
            showAlert('变更订单类型失败', 'error');
        }
    }

    // 确认收货
    async deliverOrder(orderId) {
        if (!confirm('确认收货？')) return;

        try {
            const response = await fetch(`/api/orders/${orderId}/deliver`, {
                method: 'PUT',
                headers: getAuthHeaders()
            });

            const result = await response.json();
            
            if (result.code === 0) {
                showAlert('确认收货成功', 'success');
                this.loadOrders();
            } else {
                showAlert('确认收货失败: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('确认收货失败:', error);
            showAlert('确认收货失败', 'error');
        }
    }

    // 处理退货
    async processReturn(orderId) {
        document.getElementById('processReturnOrderId').value = orderId;
        const modal = new bootstrap.Modal(document.getElementById('processReturnModal'));
        modal.show();
    }

    // 确认处理退货
    async confirmProcessReturn() {
        const orderId = document.getElementById('processReturnOrderId').value;
        const action = document.querySelector('input[name="returnAction"]:checked')?.value;
        const returnAmount = document.getElementById('returnAmount').value;
        const adminRemark = document.getElementById('adminRemark').value;

        if (!action) {
            showAlert('请选择处理结果', 'error');
            return;
        }

        if (action === 'approve' && !returnAmount) {
            showAlert('请填写退货金额', 'error');
            return;
        }

        try {
            const response = await fetch(`/api/orders/${orderId}/return/process`, {
                method: 'PUT',
                headers: {
                    ...getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action,
                    returnAmount: action === 'approve' ? parseFloat(returnAmount) : null,
                    adminRemark
                })
            });

            const result = await response.json();
            
            if (result.code === 0) {
                showAlert('退货处理成功', 'success');
                bootstrap.Modal.getInstance(document.getElementById('processReturnModal')).hide();
                this.loadOrders();
            } else {
                showAlert('退货处理失败: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('退货处理失败:', error);
            showAlert('退货处理失败', 'error');
        }
    }

    // 处理退款
    async processRefund(orderId) {
        document.getElementById('processRefundOrderId').value = orderId;
        const modal = new bootstrap.Modal(document.getElementById('processRefundModal'));
        modal.show();
    }

    // 确认处理退款
    async confirmProcessRefund() {
        const orderId = document.getElementById('processRefundOrderId').value;
        const action = document.querySelector('input[name="refundAction"]:checked')?.value;
        const refundRemark = document.getElementById('refundRemark').value;

        if (!action) {
            showAlert('请选择处理结果', 'error');
            return;
        }

        try {
            const response = await fetch(`/api/orders/${orderId}/refund/process`, {
                method: 'PUT',
                headers: {
                    ...getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action,
                    adminRemark: refundRemark
                })
            });

            const result = await response.json();
            
            if (result.code === 0) {
                showAlert('退款处理成功', 'success');
                bootstrap.Modal.getInstance(document.getElementById('processRefundModal')).hide();
                this.loadOrders();
            } else {
                showAlert('退款处理失败: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('退款处理失败:', error);
            showAlert('退款处理失败', 'error');
        }
    }

    // 完成退款
    async completeRefund(orderId) {
        document.getElementById('completeRefundOrderId').value = orderId;
        const modal = new bootstrap.Modal(document.getElementById('completeRefundModal'));
        modal.show();
    }

    // 确认完成退款
    async confirmCompleteRefund() {
        const orderId = document.getElementById('completeRefundOrderId').value;
        const thirdPartyRefundNo = document.getElementById('thirdPartyRefundNo').value;

        if (!confirm('确认退款已完成？此操作不可撤销。')) return;

        try {
            const response = await fetch(`/api/orders/${orderId}/refund/complete`, {
                method: 'PUT',
                headers: {
                    ...getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    thirdPartyRefundNo
                })
            });

            const result = await response.json();
            
            if (result.code === 0) {
                showAlert('退款完成', 'success');
                bootstrap.Modal.getInstance(document.getElementById('completeRefundModal')).hide();
                this.loadOrders();
            } else {
                showAlert('退款完成失败: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('退款完成失败:', error);
            showAlert('退款完成失败', 'error');
        }
    }

    // 刷新订单列表
    async refreshOrders() {
        this.currentPage = 1;
        await this.loadOrders();
    }

    // 格式化日期
    formatDate(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleString('zh-CN');
    }
}

// 全局函数
function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
}

function showAlert(message, type = 'info') {
    // 这里可以使用您现有的提示组件
    alert(message);
}

// 创建全局实例
console.log('[OrderJS] 创建 OrderManagement 实例...');
const orderManagement = new OrderManagement();
console.log('[OrderJS] OrderManagement 实例创建成功');

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    console.log('[OrderJS] DOMContentLoaded 事件触发，开始初始化...');
    try {
        orderManagement.init().then(() => {
            console.log('[OrderJS] 初始化完成');
        }).catch(error => {
            console.error('[OrderJS] 初始化失败:', error);
        });
    } catch (error) {
        console.error('[OrderJS] 初始化异常:', error);
    }
});

// 如果 DOM 已经加载完成，立即初始化
if (document.readyState === 'loading') {
    console.log('[OrderJS] 文档正在加载，等待 DOMContentLoaded 事件...');
} else {
    console.log('[OrderJS] 文档已加载，立即初始化...');
    try {
        orderManagement.init().then(() => {
            console.log('[OrderJS] 立即初始化完成');
        }).catch(error => {
            console.error('[OrderJS] 立即初始化失败:', error);
        });
    } catch (error) {
        console.error('[OrderJS] 立即初始化异常:', error);
    }
}

// 导出全局函数供HTML调用
window.orderManagement = orderManagement;
// 暴露关闭函数供HTML调用
window.closeOrderDetailModal = function() {
    if (orderManagement) {
        orderManagement.closeOrderDetail();
    }
};
console.log('[OrderJS] orderManagement 已挂载到 window 对象');

window.showAddOrderModal = function() {
    // 这里可以添加创建订单的功能
    alert('创建订单功能待实现');
};

window.showCreateOrderModal = function() {
    console.log('[OrderJS] showCreateOrderModal 被调用');
    // 这里可以添加创建订单的功能
    alert('创建订单功能待实现');
};

window.exportOrders = function() {
    console.log('[OrderJS] exportOrders 被调用');

    // 后端全量导出（按当前筛选条件）
    (async () => {
        try {
            const token = localStorage.getItem('token');
            const searchInput = document.getElementById('searchInput')?.value || '';
            const statusFilter = document.getElementById('statusFilter')?.value || '';
            const paymentMethodFilter = document.getElementById('paymentMethodFilter')?.value || '';
            const startDate = document.getElementById('startDate')?.value || '';
            const endDate = document.getElementById('endDate')?.value || '';

            const params = new URLSearchParams();
            if (searchInput) params.set('search', searchInput);
            if (statusFilter) params.set('status', statusFilter);
            if (paymentMethodFilter) params.set('paymentMethod', paymentMethodFilter);
            if (startDate) params.set('startDate', startDate);
            if (endDate) params.set('endDate', endDate);

            const url = `/api/orders/export${params.toString() ? `?${params.toString()}` : ''}`;
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const a = document.createElement('a');
            const href = URL.createObjectURL(blob);
            a.href = href;
            a.download = `orders_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(href);
            showAlert('订单导出成功', 'success');
        } catch (error) {
            console.error('导出订单失败:', error);
            showAlert('导出订单失败: ' + error.message, 'error');
        }
    })();
};

// ==================== 批量发货导入（CSV） ====================
window.downloadShippingTemplate = async function downloadShippingTemplate() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/orders/import-shipping-template', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const a = document.createElement('a');
        const href = URL.createObjectURL(blob);
        a.href = href;
        a.download = 'orders_import_shipping_template.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(href);
    } catch (err) {
        console.error('下载发货模板失败:', err);
        showAlert('下载发货模板失败: ' + err.message, 'error');
    }
};

window.triggerImportShipping = function triggerImportShipping() {
    const input = document.getElementById('ordersShippingImportFile');
    if (input) input.click();
};

async function importShipping(file) {
    const token = localStorage.getItem('token');
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/orders/import-shipping', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: form
    });
    const result = await res.json();
    if (!res.ok || result.code !== 0) throw new Error(result.message || `HTTP ${res.status}`);
    return result;
}

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('ordersShippingImportFile');
    if (!input) return;
    input.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!confirm(`确认导入发货信息？\n文件: ${file.name}\n注意：仅支持已支付的实物订单`)) {
            e.target.value = '';
            return;
        }
        try {
            const result = await importShipping(file);
            showAlert(`导入完成：成功 ${result.data.success}，跳过 ${result.data.skipped}，错误 ${result.data.errors.length}`, 'success');
            orderManagement.loadOrders();
        } catch (err) {
            console.error('导入发货失败:', err);
            showAlert('导入发货失败: ' + err.message, 'error');
        } finally {
            e.target.value = '';
        }
    });
});

window.refreshOrders = function() {
    console.log('[OrderJS] refreshOrders 被调用');
    orderManagement.refreshOrders();
};

window.filterOrders = function() {
    console.log('[OrderJS] filterOrders 被调用');
    orderManagement.currentStatus = document.getElementById('statusFilter')?.value || '';
    orderManagement.currentPage = 1;
    orderManagement.loadOrders();
};

window.searchOrders = function() {
    console.log('[OrderJS] searchOrders 被调用');
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const paymentMethodFilter = document.getElementById('paymentMethodFilter');
    const startDate = document.getElementById('startDate');
    const endDate = document.getElementById('endDate');
    
    // 这里可以添加搜索逻辑，目前先简单刷新
    orderManagement.currentPage = 1;
    orderManagement.loadOrders();
};

window.resetFilters = function() {
    console.log('[OrderJS] resetFilters 被调用');
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const paymentMethodFilter = document.getElementById('paymentMethodFilter');
    const startDate = document.getElementById('startDate');
    const endDate = document.getElementById('endDate');
    
    if (searchInput) searchInput.value = '';
    if (statusFilter) statusFilter.value = '';
    if (paymentMethodFilter) paymentMethodFilter.value = '';
    if (startDate) startDate.value = '';
    if (endDate) endDate.value = '';
    
    orderManagement.currentStatus = '';
    orderManagement.currentPage = 1;
    orderManagement.loadOrders();
};

console.log('[OrderJS] 脚本加载完成');