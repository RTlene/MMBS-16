/**
 * 创建测试订单 - 用于验证佣金计算逻辑
 */
window.TestOrder = {
    members: [],
    products: [],

    init() {
        this.loadMembers();
        this.loadProducts();
        this.bindEvents();
    },

    getAuthHeaders() {
        const token = localStorage.getItem('token');
        return {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        };
    },

    async loadMembers() {
        try {
            const res = await fetch('/api/members?page=1&limit=300', { headers: this.getAuthHeaders() });
            const result = await res.json();
            if (result.code === 0 && result.data && result.data.members) {
                this.members = result.data.members;
                this.renderMemberSelect();
            } else {
                console.error('加载会员列表失败', result.message);
            }
        } catch (e) {
            console.error('加载会员列表失败', e);
        }
    },

    renderMemberSelect() {
        const sel = document.getElementById('memberId');
        if (!sel) return;
        sel.innerHTML = '<option value="">请选择会员</option>';
        this.members.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            const name = (m.nickname || m.phone || '') || ('ID:' + m.id);
            opt.textContent = name + ' (ID:' + m.id + (m.referrerId ? ', 推荐人:' + m.referrerId : '') + ')';
            sel.appendChild(opt);
        });
    },

    async loadProducts() {
        try {
            const res = await fetch('/api/products?page=1&limit=300', { headers: this.getAuthHeaders() });
            const result = await res.json();
            if (result.code === 0 && result.data && result.data.products) {
                this.products = result.data.products;
                this.renderProductSelect();
            } else {
                console.error('加载商品列表失败', result.message);
            }
        } catch (e) {
            console.error('加载商品列表失败', e);
        }
    },

    renderProductSelect() {
        const sel = document.getElementById('productId');
        if (!sel) return;
        sel.innerHTML = '<option value="">请选择商品</option>';
        this.products.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            const firstPrice = p.skus && p.skus[0] ? p.skus[0].price : (p.price != null ? p.price : '');
            opt.textContent = (p.name || '') + ' (ID:' + p.id + (firstPrice ? ' ¥' + firstPrice : '') + ')';
            opt.dataset.price = firstPrice !== '' && firstPrice != null ? firstPrice : '';
            sel.appendChild(opt);
        });
    },

    bindEvents() {
        const btn = document.getElementById('btnCreate');
        if (btn) btn.addEventListener('click', () => this.createTestOrder());
        const productId = document.getElementById('productId');
        if (productId) productId.addEventListener('change', () => this.onProductChange());
    },

    onProductChange() {
        const sel = document.getElementById('productId');
        const unitPriceEl = document.getElementById('unitPrice');
        if (!sel || !unitPriceEl) return;
        const opt = sel.options[sel.selectedIndex];
        const price = opt && opt.dataset.price ? opt.dataset.price : '';
        if (price !== '') unitPriceEl.placeholder = '默认 ' + price + ' 元';
        else unitPriceEl.placeholder = '不填则使用商品默认价';
    },

    async createTestOrder() {
        const memberId = document.getElementById('memberId').value;
        const productId = document.getElementById('productId').value;
        const quantity = document.getElementById('quantity').value;
        const unitPrice = document.getElementById('unitPrice').value.trim();
        const totalAmount = document.getElementById('totalAmount').value.trim();
        const resultBox = document.getElementById('resultBox');
        const btn = document.getElementById('btnCreate');

        if (!memberId || !productId) {
            resultBox.className = 'result-box error';
            resultBox.style.display = 'block';
            resultBox.innerHTML = '请选择下单会员和商品';
            return;
        }

        btn.disabled = true;
        resultBox.style.display = 'none';

        const body = {
            memberId: parseInt(memberId, 10),
            productId: parseInt(productId, 10),
            quantity: parseInt(quantity, 10) || 1
        };
        if (unitPrice !== '') body.unitPrice = parseFloat(unitPrice);
        if (totalAmount !== '') body.totalAmount = parseFloat(totalAmount);

        try {
            const res = await fetch('/api/orders/test', {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(body)
            });
            const result = await res.json();

            resultBox.style.display = 'block';
            if (result.code === 0) {
                resultBox.className = 'result-box success';
                const order = result.data && result.data.order;
                const commissionCreated = result.data && result.data.commissionCreated;
                let extra = '<br><span class="order-id">订单号：' + (order && order.orderNo) + '，订单ID：' + (order && order.id) + '</span>';
                if (commissionCreated !== undefined) {
                    extra += '<br>' + (commissionCreated > 0
                        ? ('已生成 <strong>' + commissionCreated + '</strong> 条佣金记录，请到「佣金管理 → 佣金记录」中确认。')
                        : '未生成佣金记录（该会员无推荐人或未满足等级条件）。');
                }
                resultBox.innerHTML = result.message + extra;
            } else {
                resultBox.className = 'result-box error';
                resultBox.innerHTML = result.message || '创建失败';
            }
        } catch (e) {
            resultBox.style.display = 'block';
            resultBox.className = 'result-box error';
            resultBox.innerHTML = '网络错误：' + (e.message || '');
        } finally {
            btn.disabled = false;
        }
    }
};
