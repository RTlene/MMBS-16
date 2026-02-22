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
            if (enabledEl) enabledEl.checked = !!d.activeMemberCheckEnabled;
            if (daysEl) daysEl.value = d.activeMemberCheckDays != null ? d.activeMemberCheckDays : 30;
            if (conditionEl) conditionEl.value = d.activeMemberCondition === 'lastOrderAt' ? 'lastOrderAt' : 'lastActiveAt';
            if (intervalEl) intervalEl.value = d.activeMemberCheckIntervalHours != null ? d.activeMemberCheckIntervalHours : 24;
        } catch (e) {
            console.error('加载系统设置失败', e);
        }
    }

    async function saveSystemSettings() {
        const enabledEl = document.getElementById('activeMemberCheckEnabled');
        const daysEl = document.getElementById('activeMemberCheckDays');
        const conditionEl = document.getElementById('activeMemberCondition');
        const intervalEl = document.getElementById('activeMemberCheckIntervalHours');
        const body = {
            activeMemberCheckEnabled: enabledEl ? enabledEl.checked : false,
            activeMemberCheckDays: daysEl ? Math.max(1, parseInt(daysEl.value, 10) || 30) : 30,
            activeMemberCondition: conditionEl && conditionEl.value === 'lastOrderAt' ? 'lastOrderAt' : 'lastActiveAt',
            activeMemberCheckIntervalHours: intervalEl ? Math.max(1, Math.min(720, parseInt(intervalEl.value, 10) || 24)) : 24
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

    function init() {
        loadSystemSettings();
        const btn = document.getElementById('saveSystemSettingsBtn');
        if (btn) btn.addEventListener('click', saveSystemSettings);
    }

    window.SystemSettings = { init, loadSystemSettings };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
