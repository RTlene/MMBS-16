/**
 * 优惠券管理：列表、新增、编辑、删除
 */
window.CouponManagement = {
    data: {
        coupons: [],
        total: 0,
        totalPages: 1,
        currentPage: 1,
        pageSize: 20,
        search: '',
        statusFilter: '',
        typeFilter: '',
        current: null
    },
    init: function () {
        this.loadCoupons();
        this.bindEvents();
    },
    bindEvents: function () {
        var self = this;
        var searchEl = document.getElementById('searchInput');
        if (searchEl) searchEl.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') window.CouponManagement.searchCoupons();
        });
        var typeEl = document.getElementById('typeFilter');
        var statusEl = document.getElementById('statusFilter');
        if (typeEl) typeEl.addEventListener('change', function () { window.CouponManagement.searchCoupons(); });
        if (statusEl) statusEl.addEventListener('change', function () { window.CouponManagement.searchCoupons(); });
        var selectAllEl = document.getElementById('couponSelectAll');
        if (selectAllEl) selectAllEl.addEventListener('change', function () {
            document.querySelectorAll('.coupon-checkbox').forEach(function (cb) { cb.checked = selectAllEl.checked; });
        });
        var couponTypeEl = document.getElementById('couponType');
        if (couponTypeEl) couponTypeEl.addEventListener('change', function () {
            self.toggleGiftConfig();
        });
        var modeEl = document.getElementById('couponDistributionMode');
        if (modeEl) modeEl.addEventListener('change', function () {
            self.toggleAutoGrantRules();
        });
    },
    toggleAutoGrantRules: function () {
        var mode = document.getElementById('couponDistributionMode') && document.getElementById('couponDistributionMode').value;
        var section = document.getElementById('autoGrantRulesSection');
        if (!section) return;
        section.style.display = mode === 'auto' ? 'block' : 'none';
    },
    toggleGiftConfig: function () {
        var type = document.getElementById('couponType') && document.getElementById('couponType').value;
        var section = document.getElementById('giftConfigSection');
        if (!section) return;
        if (type === 'gift') {
            section.style.display = 'block';
            this.loadProductsForGift();
        } else {
            section.style.display = 'none';
        }
    },
    loadProductsForGift: function (selectedProductId) {
        var select = document.getElementById('giftProductId');
        if (!select) return;
        select.innerHTML = '<option value="">请选择商品</option>';
        var self = this;
        fetch('/api/products?limit=200&status=active', {
            headers: { 'Authorization': 'Bearer ' + this.getToken() }
        })
            .then(function (res) { return res.json(); })
            .then(function (result) {
                if (result.code === 0 && result.data && result.data.products) {
                    result.data.products.forEach(function (p) {
                        var opt = document.createElement('option');
                        opt.value = p.id;
                        opt.textContent = (p.name || '') + ' (ID:' + p.id + ')';
                        select.appendChild(opt);
                    });
                    if (selectedProductId != null && selectedProductId !== '') {
                        select.value = selectedProductId;
                    }
                }
            })
            .catch(function () {});
    },
    getToken: function () {
        return localStorage.getItem('token') || '';
    },
    loadCoupons: function () {
        var self = this;
        var params = new URLSearchParams({
            page: self.data.currentPage,
            limit: self.data.pageSize,
            search: self.data.search,
            status: self.data.statusFilter,
            type: self.data.typeFilter
        });
        fetch('/api/coupons?' + params, {
            headers: { 'Authorization': 'Bearer ' + self.getToken() }
        })
            .then(function (res) { return res.json(); })
            .then(function (result) {
                if (result.code === 0) {
                    self.data.coupons = result.data.coupons || [];
                    self.data.total = result.data.total || 0;
                    self.data.totalPages = result.data.totalPages || 1;
                    self.renderTable();
                    self.renderPagination();
                    self.loadStats();
                } else {
                    alert('加载失败: ' + (result.message || ''));
                }
            })
            .catch(function (err) {
                console.error(err);
                alert('加载失败');
            });
    },
    loadStats: function () {
        var self = this;
        fetch('/api/coupons/stats', {
            headers: { 'Authorization': 'Bearer ' + this.getToken() }
        })
            .then(function (res) { return res.json(); })
            .then(function (result) {
                if (result.code === 0 && result.data) {
                    var totalEl = document.getElementById('totalCoupons');
                    var activeEl = document.getElementById('activeCoupons');
                    if (totalEl) totalEl.textContent = result.data.total ?? 0;
                    if (activeEl) activeEl.textContent = result.data.active ?? 0;
                }
            })
            .catch(function () {});
    },
    renderTable: function () {
        var tbody = document.getElementById('couponTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        var self = this;
        var distributionModeText = { auto: '自动', system: '系统发放', user_claim: '用户领取' };
        this.data.coupons.forEach(function (c) {
            var tr = document.createElement('tr');
            var typeText = { discount: '折扣券', cash: '代金券', gift: '礼品券' }[c.type] || c.type;
            var modeText = distributionModeText[c.distributionMode] || distributionModeText.user_claim;
            // 面值/折扣：代金券显示面值(value)，折扣券显示折扣(discountValue)，与下单抵扣逻辑一致
            var discountText = '';
            if (c.type === 'cash') {
                discountText = '¥' + (parseFloat(c.value) != null && !isNaN(parseFloat(c.value)) ? parseFloat(c.value) : (parseFloat(c.discountValue) || 0));
            } else if (c.discountType === 'percentage') {
                var v = parseFloat(c.discountValue);
                var zhe = v;
                if (v > 10) zhe = v / 10; else if (v > 0 && v < 1) zhe = v * 10;
                discountText = zhe + '折';
            } else {
                discountText = '¥' + (parseFloat(c.discountValue) != null && !isNaN(parseFloat(c.discountValue)) ? parseFloat(c.discountValue) : 0);
            }
            var minText = c.minOrderAmount != null && c.minOrderAmount > 0 ? '满¥' + c.minOrderAmount : '-';
            var useText = (c.totalCount || 0) + ' / ' + (c.usedCount || 0);
            var userClaimText = c.userClaimLimit != null && c.userClaimLimit > 0 ? c.userClaimLimit + '张' : '不限';
            var validText = self.formatDate(c.validFrom) + ' ~ ' + self.formatDate(c.validTo);
            var statusClass = 'status-' + (c.status || 'inactive');
            var statusText = { active: '启用', inactive: '禁用', expired: '已过期' }[c.status] || c.status;
            tr.innerHTML =
                '<td><input type="checkbox" class="coupon-checkbox" value="' + (c.id || '') + '"></td>' +
                '<td>' + (c.id || '') + '</td>' +
                '<td>' + (c.name || '') + '</td>' +
                '<td><code>' + (c.code || '') + '</code></td>' +
                '<td><span class="type-badge">' + typeText + '</span></td>' +
                '<td>' + modeText + '</td>' +
                '<td>' + discountText + '</td>' +
                '<td>' + minText + '</td>' +
                '<td>' + useText + '</td>' +
                '<td>' + userClaimText + '</td>' +
                '<td>' + validText + '</td>' +
                '<td><span class="' + statusClass + '">' + statusText + '</span></td>' +
                '<td>' +
                '<button class="btn btn-primary" onclick="window.CouponManagement.editCoupon(' + c.id + ')">编辑</button> ' +
                '<button class="btn btn-danger" onclick="window.CouponManagement.deleteCoupon(' + c.id + ')">删除</button>' +
                '</td>';
            tbody.appendChild(tr);
        });
    },
    renderPagination: function () {
        var container = document.getElementById('pagination');
        if (!container) return;
        container.innerHTML = '';
        var cur = this.data.currentPage;
        var total = this.data.totalPages;
        var self = this;

        var prev = document.createElement('button');
        prev.textContent = '上一页';
        prev.disabled = cur <= 1;
        prev.onclick = function () { if (cur > 1) { self.data.currentPage = cur - 1; self.loadCoupons(); } };
        container.appendChild(prev);

        for (var i = 1; i <= total; i++) {
            (function (p) {
                var btn = document.createElement('button');
                btn.textContent = p;
                if (p === cur) btn.className = 'active';
                btn.onclick = function () { self.data.currentPage = p; self.loadCoupons(); };
                container.appendChild(btn);
            })(i);
        }

        var next = document.createElement('button');
        next.textContent = '下一页';
        next.disabled = cur >= total;
        next.onclick = function () { if (cur < total) { self.data.currentPage = cur + 1; self.loadCoupons(); } };
        container.appendChild(next);
    },
    searchCoupons: function () {
        var searchEl = document.getElementById('searchInput');
        var typeEl = document.getElementById('typeFilter');
        var statusEl = document.getElementById('statusFilter');
        this.data.search = searchEl ? searchEl.value.trim() : '';
        this.data.typeFilter = typeEl ? typeEl.value : '';
        this.data.statusFilter = statusEl ? statusEl.value : '';
        this.data.currentPage = 1;
        this.loadCoupons();
    },
    showAddModal: function () {
        this.data.current = null;
        document.getElementById('couponModalTitle').textContent = '新增优惠券';
        document.getElementById('couponForm').reset();
        document.getElementById('couponCode').readOnly = false;
        var from = document.getElementById('couponValidFrom');
        var to = document.getElementById('couponValidTo');
        if (from && to) {
            var now = new Date();
            var next = new Date(now);
            next.setMonth(next.getMonth() + 1);
            from.value = this.formatDateTimeLocal(now);
            to.value = this.formatDateTimeLocal(next);
        }
        document.getElementById('couponValue').value = '100';
        document.getElementById('couponTotalCount').value = '100';
        var userClaimEl = document.getElementById('couponUserClaimLimit');
        if (userClaimEl) userClaimEl.value = '';
        var modeEl = document.getElementById('couponDistributionMode');
        if (modeEl) modeEl.value = 'user_claim';
        this.toggleGiftConfig();
        this.toggleAutoGrantRules();
        var autoRulesEl = document.getElementById('couponAutoGrantRules');
        if (autoRulesEl) autoRulesEl.value = '';
        document.getElementById('couponModal').classList.add('show');
    },
    editCoupon: function (id) {
        var c = this.data.coupons.find(function (x) { return x.id === id; });
        if (!c) return;
        this.data.current = c;
        document.getElementById('couponModalTitle').textContent = '编辑优惠券';
        document.getElementById('couponName').value = c.name || '';
        document.getElementById('couponCode').value = c.code || '';
        document.getElementById('couponCode').readOnly = true;
        document.getElementById('couponType').value = c.type || 'cash';
        document.getElementById('couponDiscountType').value = c.discountType || 'fixed';
        document.getElementById('couponValue').value = c.value != null ? c.value : '100';
        document.getElementById('couponDiscountValue').value = c.discountValue != null ? c.discountValue : '';
        document.getElementById('couponMinOrderAmount').value = c.minOrderAmount != null && c.minOrderAmount > 0 ? c.minOrderAmount : '';
        document.getElementById('couponTotalCount').value = c.totalCount != null ? c.totalCount : 100;
        var userClaimEl = document.getElementById('couponUserClaimLimit');
        if (userClaimEl) userClaimEl.value = c.userClaimLimit != null && c.userClaimLimit > 0 ? c.userClaimLimit : '';
        var modeEl = document.getElementById('couponDistributionMode');
        if (modeEl) modeEl.value = (c.distributionMode === 'auto' || c.distributionMode === 'system') ? c.distributionMode : 'user_claim';
        this.toggleAutoGrantRules();
        var autoRulesEl = document.getElementById('couponAutoGrantRules');
        if (autoRulesEl) autoRulesEl.value = c.autoGrantRules && Array.isArray(c.autoGrantRules) ? JSON.stringify(c.autoGrantRules, null, 2) : (c.autoGrantRules ? JSON.stringify(c.autoGrantRules, null, 2) : '');
        document.getElementById('couponValidFrom').value = this.formatDateTimeLocal(c.validFrom);
        document.getElementById('couponValidTo').value = this.formatDateTimeLocal(c.validTo);
        document.getElementById('couponStatus').value = c.status || 'active';
        document.getElementById('couponDescription').value = c.description || '';
        this.toggleGiftConfig();
        if (c.type === 'gift' && c.fullGiftRules && Array.isArray(c.fullGiftRules) && c.fullGiftRules[0]) {
            var r = c.fullGiftRules[0];
            var giftQuantityEl = document.getElementById('giftQuantity');
            var giftMinAmountEl = document.getElementById('giftMinAmount');
            if (giftQuantityEl) giftQuantityEl.value = r.giftQuantity != null ? r.giftQuantity : 1;
            if (giftMinAmountEl) giftMinAmountEl.value = r.minAmount != null ? r.minAmount : 0;
            this.loadProductsForGift(r.giftProductId != null ? r.giftProductId : null);
        }
        document.getElementById('couponModal').classList.add('show');
    },
    closeModal: function () {
        document.getElementById('couponModal').classList.remove('show');
    },
    saveCoupon: function () {
        var self = this;
        var name = document.getElementById('couponName').value.trim();
        var code = document.getElementById('couponCode').value.trim();
        var type = document.getElementById('couponType').value;
        var discountType = document.getElementById('couponDiscountType').value;
        var value = parseFloat(document.getElementById('couponValue').value) || 0;
        var discountValue = parseFloat(document.getElementById('couponDiscountValue').value);
        var minOrderAmountEl = document.getElementById('couponMinOrderAmount');
        var minOrderAmount = minOrderAmountEl.value.trim() ? parseFloat(minOrderAmountEl.value) : null;
        var totalCount = parseInt(document.getElementById('couponTotalCount').value, 10) || 0;
        var userClaimLimitEl = document.getElementById('couponUserClaimLimit');
        var userClaimLimit = (userClaimLimitEl && userClaimLimitEl.value.trim() !== '') ? parseInt(userClaimLimitEl.value, 10) : null;
        if (userClaimLimit !== null && (isNaN(userClaimLimit) || userClaimLimit < 0)) userClaimLimit = null;
        var validFrom = document.getElementById('couponValidFrom').value;
        var validTo = document.getElementById('couponValidTo').value;
        var status = document.getElementById('couponStatus').value;
        var description = document.getElementById('couponDescription').value.trim();

        if (!name || !code) { alert('请填写名称和兑换码'); return; }
        if (isNaN(discountValue) || discountValue < 0) { alert('请填写有效的折扣值'); return; }
        if (totalCount < 1) { alert('发放总数至少为 1'); return; }
        if (!validFrom || !validTo) { alert('请选择有效期'); return; }
        if (new Date(validFrom) >= new Date(validTo)) { alert('结束时间必须晚于开始时间'); return; }

        var fullGiftRules = null;
        if (type === 'gift') {
            var giftProductIdEl = document.getElementById('giftProductId');
            var giftQuantityEl = document.getElementById('giftQuantity');
            var giftMinAmountEl = document.getElementById('giftMinAmount');
            var giftProductId = giftProductIdEl && giftProductIdEl.value ? parseInt(giftProductIdEl.value, 10) : 0;
            var giftQuantity = giftQuantityEl && giftQuantityEl.value ? parseInt(giftQuantityEl.value, 10) : 1;
            var giftMinAmount = giftMinAmountEl && giftMinAmountEl.value !== '' ? parseFloat(giftMinAmountEl.value) : 0;
            if (!giftProductId || giftProductId < 1) {
                alert('请选择赠品商品');
                return;
            }
            if (!giftQuantity || giftQuantity < 1) {
                alert('赠品数量至少为 1');
                return;
            }
            fullGiftRules = [{ conditionType: 'amount', minAmount: giftMinAmount || 0, giftProductId: giftProductId, giftQuantity: giftQuantity }];
        }

        var distributionModeEl = document.getElementById('couponDistributionMode');
        var distributionMode = (distributionModeEl && distributionModeEl.value) ? distributionModeEl.value : 'user_claim';
        var autoGrantRules = null;
        var autoRulesEl = document.getElementById('couponAutoGrantRules');
        if (distributionMode === 'auto' && autoRulesEl && autoRulesEl.value.trim()) {
            try {
                autoGrantRules = JSON.parse(autoRulesEl.value.trim());
                if (!Array.isArray(autoGrantRules)) autoGrantRules = [autoGrantRules];
            } catch (e) {
                alert('自动发放条件 JSON 格式错误');
                return;
            }
        }
        var body = {
            name: name,
            code: code,
            type: type,
            discountType: discountType,
            value: value,
            discountValue: discountValue,
            minOrderAmount: minOrderAmount,
            totalCount: totalCount,
            userClaimLimit: userClaimLimit,
            validFrom: validFrom.replace('T', ' ').substring(0, 19),
            validTo: validTo.replace('T', ' ').substring(0, 19),
            status: status,
            distributionMode: distributionMode,
            description: description || undefined
        };
        if (fullGiftRules) body.fullGiftRules = fullGiftRules;
        if (autoGrantRules) body.autoGrantRules = autoGrantRules;

        var url = '/api/coupons';
        var method = 'POST';
        if (this.data.current && this.data.current.id) {
            url = '/api/coupons/' + this.data.current.id;
            method = 'PUT';
        }

        fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + this.getToken()
            },
            body: JSON.stringify(body)
        })
            .then(function (res) { return res.json(); })
            .then(function (result) {
                if (result.code === 0) {
                    alert('保存成功');
                    self.closeModal();
                    self.loadCoupons();
                } else {
                    alert('保存失败: ' + (result.message || ''));
                }
            })
            .catch(function (err) {
                console.error(err);
                alert('保存失败');
            });
    },
    deleteCoupon: function (id) {
        var self = this;
        if (!confirm('确定删除该优惠券？')) return;
        fetch('/api/coupons/' + id, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + this.getToken() }
        })
            .then(function (res) { return res.json(); })
            .then(function (result) {
                if (result.code === 0) {
                    alert('删除成功');
                    self.loadCoupons();
                } else {
                    alert('删除失败: ' + (result.message || ''));
                }
            })
            .catch(function (err) {
                console.error(err);
                alert('删除失败');
            });
    },
    getSelectedCouponIds: function () {
        var ids = [];
        document.querySelectorAll('.coupon-checkbox:checked').forEach(function (cb) {
            var v = parseInt(cb.value, 10);
            if (!isNaN(v)) ids.push(v);
        });
        return ids;
    },
    batchDelete: function () {
        var ids = this.getSelectedCouponIds();
        if (ids.length === 0) { alert('请先勾选要删除的优惠券'); return; }
        if (!confirm('确定删除所选 ' + ids.length + ' 张优惠券吗？')) return;
        var self = this;
        fetch('/api/coupons/batch-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.getToken() },
            body: JSON.stringify({ ids: ids })
        }).then(function (r) { return r.json(); }).then(function (res) {
            if (res.code === 0) { alert('删除成功'); self.loadCoupons(); document.getElementById('couponSelectAll').checked = false; }
            else alert(res.message || '删除失败');
        }).catch(function () { alert('请求失败'); });
    },
    batchStatus: function (status) {
        var ids = this.getSelectedCouponIds();
        if (ids.length === 0) { alert('请先勾选优惠券'); return; }
        var text = status === 'active' ? '启用' : '停用';
        if (!confirm('确定' + text + '所选 ' + ids.length + ' 张优惠券吗？')) return;
        var self = this;
        fetch('/api/coupons/batch-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.getToken() },
            body: JSON.stringify({ ids: ids, status: status })
        }).then(function (r) { return r.json(); }).then(function (res) {
            if (res.code === 0) { alert('更新成功'); self.loadCoupons(); document.getElementById('couponSelectAll').checked = false; }
            else alert(res.message || '更新失败');
        }).catch(function () { alert('请求失败'); });
    },
    formatDate: function (d) {
        if (!d) return '-';
        var x = new Date(d);
        return isNaN(x.getTime()) ? '-' : x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    },
    formatDateTimeLocal: function (d) {
        if (!d) return '';
        var x = new Date(d);
        if (isNaN(x.getTime())) return '';
        var y = x.getFullYear();
        var m = String(x.getMonth() + 1).padStart(2, '0');
        var day = String(x.getDate()).padStart(2, '0');
        var h = String(x.getHours()).padStart(2, '0');
        var min = String(x.getMinutes()).padStart(2, '0');
        return y + '-' + m + '-' + day + 'T' + h + ':' + min;
    }
};

function searchCoupons() { window.CouponManagement.searchCoupons(); }
function showAddModal() { window.CouponManagement.showAddModal(); }
function closeModal() { window.CouponManagement.closeModal(); }
function saveCoupon() { window.CouponManagement.saveCoupon(); }
