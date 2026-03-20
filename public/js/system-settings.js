(function() {
    function getAuthHeaders() {
        const token = localStorage.getItem('token');
        return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || '') };
    }

    async function loadSystemSettings() {
        try {
            const res = await fetch('/api/settings/system', { headers: getAuthHeaders() });
            const result = await res.json();
            if (result.code !== 0) {
                console.error('加载系统设置失败', result.message);
                return;
            }
            const d = result.data || {};
            const enabledEl = document.getElementById('activeMemberCheckEnabled');
            const daysEl = document.getElementById('activeMemberCheckDays');
            const conditionEl = document.getElementById('activeMemberCondition');
            const intervalEl = document.getElementById('activeMemberCheckIntervalHours');
            const modeEl = document.getElementById('activeMemberCheckMode');
            const mallNameEl = document.getElementById('mallName');
            const returnAddressEl = document.getElementById('returnAddress');
            const afterSalesDaysEl = document.getElementById('afterSalesImageRetentionDays');
            const amapKeyEl = document.getElementById('amapKey');
            const amapWsEl = document.getElementById('amapWebServiceKey');
            const amapSecEl = document.getElementById('amapSecurityJsCode');
            if (afterSalesDaysEl) afterSalesDaysEl.value = d.afterSalesImageRetentionDays != null ? d.afterSalesImageRetentionDays : 90;
            if (modeEl) {
                modeEl.value = (d.activeMemberCheckMode === 'simple' ? 'simple' : 'scheduled');
                updateActiveMemberModeUI();
            }
            if (mallNameEl) mallNameEl.value = d.mallName != null ? d.mallName : '';
            if (enabledEl) enabledEl.checked = !!d.activeMemberCheckEnabled;
            if (daysEl) daysEl.value = d.activeMemberCheckDays != null ? d.activeMemberCheckDays : 30;
            if (conditionEl) conditionEl.value = d.activeMemberCondition === 'lastOrderAt' ? 'lastOrderAt' : 'lastActiveAt';
            if (intervalEl) intervalEl.value = d.activeMemberCheckIntervalHours != null ? d.activeMemberCheckIntervalHours : 24;
            if (returnAddressEl) returnAddressEl.value = d.returnAddress != null ? d.returnAddress : '';
            if (amapKeyEl) amapKeyEl.value = d.amapKey != null ? d.amapKey : '';
            if (amapWsEl) amapWsEl.value = d.amapWebServiceKey != null ? d.amapWebServiceKey : '';
            if (amapSecEl) amapSecEl.value = d.amapSecurityJsCode != null ? d.amapSecurityJsCode : '';
        } catch (e) {
            console.error('加载系统设置失败', e);
        }
    }

    async function saveSystemSettings() {
        const enabledEl = document.getElementById('activeMemberCheckEnabled');
        const daysEl = document.getElementById('activeMemberCheckDays');
        const conditionEl = document.getElementById('activeMemberCondition');
        const intervalEl = document.getElementById('activeMemberCheckIntervalHours');
        const modeEl = document.getElementById('activeMemberCheckMode');
        const mallNameEl = document.getElementById('mallName');
        const returnAddressEl = document.getElementById('returnAddress');
        const afterSalesDaysEl = document.getElementById('afterSalesImageRetentionDays');
        const amapKeyEl = document.getElementById('amapKey');
        const amapWsEl = document.getElementById('amapWebServiceKey');
        const amapSecEl = document.getElementById('amapSecurityJsCode');
        const body = {
            activeMemberCheckEnabled: enabledEl ? enabledEl.checked : false,
            activeMemberCheckMode: modeEl && modeEl.value === 'simple' ? 'simple' : 'scheduled',
            activeMemberCheckDays: daysEl ? Math.max(1, parseInt(daysEl.value, 10) || 30) : 30,
            activeMemberCondition: conditionEl && conditionEl.value === 'lastOrderAt' ? 'lastOrderAt' : 'lastActiveAt',
            activeMemberCheckIntervalHours: intervalEl ? Math.max(1, Math.min(720, parseInt(intervalEl.value, 10) || 24)) : 24,
            mallName: mallNameEl ? String(mallNameEl.value || '').trim().slice(0, 50) : '',
            returnAddress: returnAddressEl ? String(returnAddressEl.value || '').trim() : '',
            afterSalesImageRetentionDays: afterSalesDaysEl ? Math.max(1, Math.min(3650, parseInt(afterSalesDaysEl.value, 10) || 90)) : 90,
            amapKey: amapKeyEl ? String(amapKeyEl.value || '').trim().slice(0, 256) : '',
            amapWebServiceKey: amapWsEl ? String(amapWsEl.value || '').trim().slice(0, 256) : '',
            amapSecurityJsCode: amapSecEl ? String(amapSecEl.value || '').trim().slice(0, 256) : ''
        };
        try {
            const res = await fetch('/api/settings/system', {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify(body)
            });
            const result = await res.json();
            if (result.code === 0) {
                alert('保存成功');
            } else {
                alert('保存失败：' + (result.message || '未知错误'));
            }
        } catch (e) {
            console.error('保存失败', e);
            alert('保存失败');
        }
    }

    function updateActiveMemberModeUI() {
        const modeEl = document.getElementById('activeMemberCheckMode');
        const scheduledOpts = document.getElementById('activeMemberScheduledOptions');
        const modeHint = document.getElementById('activeMemberCheckModeHint');
        const isSimple = modeEl && modeEl.value === 'simple';
        if (scheduledOpts) scheduledOpts.style.display = isSimple ? 'none' : '';
        if (modeHint) modeHint.textContent = isSimple ? '简单模式：用户只要有订单即视为活跃，不会执行定时扫描。' : '定时检测模式：按下方设置定时将会员标记为活跃/不活跃。';
    }

    async function saveAfterSalesImageSettings() {
        const afterSalesDaysEl = document.getElementById('afterSalesImageRetentionDays');
        const days = afterSalesDaysEl ? Math.max(1, Math.min(3650, parseInt(afterSalesDaysEl.value, 10) || 90)) : 90;
        try {
            const res = await fetch('/api/settings/system', {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ afterSalesImageRetentionDays: days })
            });
            const result = await res.json();
            if (result.code === 0) alert('保存成功');
            else alert('保存失败：' + (result.message || ''));
        } catch (e) {
            console.error(e);
            alert('保存失败');
        }
    }

    async function saveAmapSettings() {
        const amapKeyEl = document.getElementById('amapKey');
        const amapWsEl = document.getElementById('amapWebServiceKey');
        const amapSecEl = document.getElementById('amapSecurityJsCode');
        const body = {
            amapKey: amapKeyEl ? String(amapKeyEl.value || '').trim().slice(0, 256) : '',
            amapWebServiceKey: amapWsEl ? String(amapWsEl.value || '').trim().slice(0, 256) : '',
            amapSecurityJsCode: amapSecEl ? String(amapSecEl.value || '').trim().slice(0, 256) : ''
        };
        try {
            const res = await fetch('/api/settings/system', {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify(body)
            });
            const result = await res.json();
            if (result.code === 0) {
                alert('高德配置已保存（若已打开门店管理页，建议刷新页面以重新加载地图配置）');
            } else {
                alert('保存失败：' + (result.message || '未知错误'));
            }
        } catch (e) {
            console.error(e);
            alert('保存失败');
        }
    }

    async function cleanupAfterSalesImages() {
        if (!confirm('确定要立即清理已超期的售后凭证图吗？清理后图片将不可恢复。')) return;
        try {
            const res = await fetch('/api/settings/after-sales/cleanup-images', {
                method: 'POST',
                headers: getAuthHeaders()
            });
            const result = await res.json();
            if (result.code === 0) {
                alert('清理完成：已处理 ' + (result.data && result.data.clearedCount) + ' 条售后单，从存储删除 ' + (result.data && result.data.deletedFromStorage) + ' 个文件。');
            } else {
                alert('清理失败：' + (result.message || ''));
            }
        } catch (e) {
            console.error(e);
            alert('清理失败');
        }
    }

    function init() {
        loadSystemSettings();
        const btn = document.getElementById('saveSystemSettingsBtn');
        if (btn) btn.addEventListener('click', saveSystemSettings);
        const btn2 = document.getElementById('saveSystemSettingsBtn2');
        if (btn2) btn2.addEventListener('click', saveSystemSettings);
        const btnAfterSales = document.getElementById('saveAfterSalesImageSettingsBtn');
        if (btnAfterSales) btnAfterSales.addEventListener('click', saveAfterSalesImageSettings);
        const btnCleanup = document.getElementById('cleanupAfterSalesImagesBtn');
        if (btnCleanup) btnCleanup.addEventListener('click', cleanupAfterSalesImages);
        const btnAmap = document.getElementById('saveAmapSettingsBtn');
        if (btnAmap) btnAmap.addEventListener('click', saveAmapSettings);
        const modeEl = document.getElementById('activeMemberCheckMode');
        if (modeEl) modeEl.addEventListener('change', updateActiveMemberModeUI);
    }

    window.SystemSettings = { init, loadSystemSettings };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
