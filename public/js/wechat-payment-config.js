// 微信支付配置管理 JavaScript

let configData = {};

// 页面初始化：
// - 在子页面动态加载场景下，DOMContentLoaded 可能已经触发过
// - page-loader 会在脚本加载后调用 loadConfig()；这里做一次兜底
try {
    if (document.getElementById('paymentConfigForm')) {
        loadConfig();
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            if (document.getElementById('paymentConfigForm')) loadConfig();
        });
    }
} catch (_) {}

// 加载配置
async function loadConfig() {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = '/login.html';
            return;
        }

        const response = await fetch('/api/payment-config/get', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();

        if (result.code === 0) {
            configData = result.data || {};
            fillForm(configData);
            updateConfigStatus();
            updateNotifyPreview();
        } else {
            throw new Error(result.message || '加载配置失败');
        }
    } catch (error) {
        console.error('加载配置失败:', error);
        showAlert('加载配置失败: ' + error.message, 'danger');
    }
}

// 填充表单
function fillForm(data) {
    document.getElementById('wxAppId').value = data.wxAppId || '';
    document.getElementById('wxMchId').value = data.wxMchId || '';
    // 出于安全考虑，后端不会返回真实密钥；这里保持为空，留空表示不修改
    document.getElementById('wxPayKey').value = '';
    document.getElementById('wxCertSerialNo').value = data.wxCertSerialNo || '';
    document.getElementById('wxNotifyUrl').value = data.wxNotifyUrl || '';
    document.getElementById('baseUrl').value = data.baseUrl || '';
    document.getElementById('sandbox').value = data.sandbox === 'true' || data.sandbox === true ? 'true' : 'false';
    document.getElementById('certPath').value = data.certPath || '/app/cert/apiclient_cert.pem';
    document.getElementById('keyPath').value = data.keyPath || '/app/cert/apiclient_key.pem';
}

function normalizeBaseUrl(url) {
    if (!url) return '';
    return url.trim().replace(/\/+$/, '');
}

function deriveNotifyUrlFromBaseUrl(baseUrl) {
    const b = normalizeBaseUrl(baseUrl);
    if (!b) return '';
    return `${b}/api/payment/wechat/notify`;
}

function updateNotifyPreview() {
    const el = document.getElementById('notifyPreview');
    if (!el) return;
    const baseUrl = document.getElementById('baseUrl')?.value || '';
    const derived = deriveNotifyUrlFromBaseUrl(baseUrl);
    el.textContent = derived || '（未生成）';
}

function applySuggestedNotifyUrl() {
    const baseUrl = document.getElementById('baseUrl')?.value || '';
    const derived = deriveNotifyUrlFromBaseUrl(baseUrl);
    if (!derived) {
        showAlert('请先填写基础 URL，再一键填充回调地址', 'warning');
        return;
    }
    document.getElementById('wxNotifyUrl').value = derived;
    showAlert('已填充回调地址（可按需修改）', 'success');
}

// 更新配置状态
function updateConfigStatus() {
    const statusEl = document.getElementById('configStatus');
    const hasRequired = configData.wxAppId && configData.wxMchId && configData.wxPayKey;
    
    if (hasRequired) {
        statusEl.textContent = '已配置';
        statusEl.className = 'status-badge status-active';
    } else {
        statusEl.textContent = '未配置';
        statusEl.className = 'status-badge status-inactive';
    }
}

// 保存配置
async function saveConfig(mode = 'all') {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = '/login.html';
            return;
        }

        const safeMode = typeof mode === 'string' ? mode : 'all';
        const payload = { mode: safeMode };

        // 分组收集数据（按组保存时，只发该组字段，避免缺少字段导致后端校验失败）
        if (safeMode === 'all' || safeMode === 'basic') {
            payload.wxAppId = document.getElementById('wxAppId').value.trim();
            payload.wxMchId = document.getElementById('wxMchId').value.trim();
            payload.wxPayKey = document.getElementById('wxPayKey').value.trim();
            payload.wxCertSerialNo = document.getElementById('wxCertSerialNo').value.trim();
        }
        if (safeMode === 'all' || safeMode === 'callback') {
            payload.baseUrl = document.getElementById('baseUrl').value.trim();
            payload.wxNotifyUrl = document.getElementById('wxNotifyUrl').value.trim();
        }
        if (safeMode === 'all' || safeMode === 'env') {
            payload.sandbox = document.getElementById('sandbox').value === 'true';
        }
        if (safeMode === 'all' || safeMode === 'paths') {
            payload.certPath = document.getElementById('certPath').value.trim();
            payload.keyPath = document.getElementById('keyPath').value.trim();
        }

        // 基础配置校验
        if (safeMode === 'all' || safeMode === 'basic') {
            if (!payload.wxAppId || !payload.wxMchId) {
                showAlert('请填写必填字段：小程序AppID、商户号', 'warning');
                return;
            }
            // 密钥首次必须填；如果已有保存（后端会返回 ***已保存***），则允许留空表示不修改
            const hasSavedKey = !!(configData && configData.wxPayKey);
            if (!hasSavedKey && !payload.wxPayKey) {
                showAlert('首次配置请填写 API 密钥；已保存过则可留空表示不修改', 'warning');
                return;
            }
        }

        // 验证回调地址格式
        if ((safeMode === 'all' || safeMode === 'callback') && payload.wxNotifyUrl && !payload.wxNotifyUrl.startsWith('http')) {
            showAlert('回调地址必须是有效的URL（以 http:// 或 https:// 开头）', 'warning');
            return;
        }
        if ((safeMode === 'all' || safeMode === 'callback') && payload.baseUrl && !payload.baseUrl.startsWith('http')) {
            showAlert('基础 URL 必须是有效的URL（以 http:// 或 https:// 开头）', 'warning');
            return;
        }

        // 显示加载提示（只禁用当前点击的按钮）
        const btnMap = {
            all: document.getElementById('btnSaveAll'),
            basic: document.getElementById('btnSaveBasic'),
            callback: document.getElementById('btnSaveCallback'),
            env: document.getElementById('btnSaveEnv'),
            paths: document.getElementById('btnSavePaths')
        };
        const activeBtn = btnMap[safeMode] || null;
        if (activeBtn) {
            activeBtn.disabled = true;
            activeBtn.dataset.originalHtml = activeBtn.innerHTML;
            activeBtn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>保存中...';
        }

        const response = await fetch('/api/payment-config/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.code === 0) {
            showAlert('配置保存成功！', 'success');
            configData = result.data || configData;
            updateConfigStatus();
            updateNotifyPreview();
            // 保存后清空密钥输入框，避免页面残留
            document.getElementById('wxPayKey').value = '';
        } else {
            throw new Error(result.message || '保存配置失败');
        }
    } catch (error) {
        console.error('保存配置失败:', error);
        showAlert('保存配置失败: ' + error.message, 'danger');
    } finally {
        const btnMap = {
            all: document.getElementById('btnSaveAll'),
            basic: document.getElementById('btnSaveBasic'),
            callback: document.getElementById('btnSaveCallback'),
            env: document.getElementById('btnSaveEnv'),
            paths: document.getElementById('btnSavePaths')
        };
        const b = btnMap[typeof mode === 'string' ? mode : 'all'];
        if (b) {
            b.disabled = false;
            if (b.dataset.originalHtml) {
                b.innerHTML = b.dataset.originalHtml;
                delete b.dataset.originalHtml;
            }
        }
    }
}

// 重置表单
function resetForm() {
    if (confirm('确定要重置表单吗？未保存的更改将丢失。')) {
        fillForm(configData);
        updateNotifyPreview();
    }
}

// 测试连接
async function testConnection() {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = '/login.html';
            return;
        }

        const testBtn = document.querySelector('button[onclick="testConnection()"]');
        testBtn.disabled = true;
        testBtn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>测试中...';

        const response = await fetch('/api/payment-config/test', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();

        if (result.code === 0) {
            let msg = result.message || '连接测试成功';
            if (result.warning) msg += ' ' + result.warning;
            showAlert(msg, result.warning ? 'info' : 'success');
        } else {
            showAlert('连接测试失败: ' + (result.message || '配置不完整'), 'warning');
        }
    } catch (error) {
        console.error('测试连接失败:', error);
        showAlert('测试连接失败: ' + error.message, 'danger');
    } finally {
        const testBtn = document.querySelector('button[onclick="testConnection()"]');
        if (testBtn) {
            testBtn.disabled = false;
            testBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i>测试连接';
        }
    }
}

// 显示提示消息
function showAlert(message, type = 'info') {
    // 移除现有的提示
    const existingAlert = document.querySelector('.alert-auto-dismiss');
    if (existingAlert) {
        existingAlert.remove();
    }

    // 创建新的提示
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show alert-auto-dismiss`;
    alertDiv.style.position = 'fixed';
    alertDiv.style.top = '20px';
    alertDiv.style.right = '20px';
    alertDiv.style.zIndex = '9999';
    alertDiv.style.minWidth = '300px';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    document.body.appendChild(alertDiv);

    // 3秒后自动关闭
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 3000);
}

// 绑定输入事件：实时更新“推荐回调地址”
document.addEventListener('input', function(e) {
    if (e && e.target && e.target.id === 'baseUrl') {
        updateNotifyPreview();
    }
});

// 上传证书文件
async function uploadCertFiles() {
    const certInput = document.getElementById('certFileInput');
    const keyInput = document.getElementById('keyFileInput');
    const certFile = certInput && certInput.files && certInput.files[0];
    const keyFile = keyInput && keyInput.files && keyInput.files[0];

    if (!certFile && !keyFile) {
        showAlert('请至少选择一个 .pem 文件（商户证书或商户私钥）', 'warning');
        return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    const btn = document.getElementById('btnUploadCert');
    if (btn) {
        btn.disabled = true;
        btn.dataset.originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>上传中...';
    }

    try {
        const formData = new FormData();
        if (certFile) formData.append('certFile', certFile);
        if (keyFile) formData.append('keyFile', keyFile);

        const response = await fetch('/api/payment-config/upload-cert', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        const result = await response.json();

        if (result.code === 0) {
            showAlert(result.message || '证书上传成功', 'success');
            if (certInput) certInput.value = '';
            if (keyInput) keyInput.value = '';
        } else {
            throw new Error(result.message || '上传失败');
        }
    } catch (error) {
        console.error('上传证书失败:', error);
        showAlert('上传证书失败: ' + error.message, 'danger');
    } finally {
        if (btn) {
            btn.disabled = false;
            if (btn.dataset.originalHtml) {
                btn.innerHTML = btn.dataset.originalHtml;
                delete btn.dataset.originalHtml;
            }
        }
    }
}

// 上传证书包（zip）并解压
async function uploadCertZip() {
    const zipInput = document.getElementById('certZipInput');
    const zipFile = zipInput && zipInput.files && zipInput.files[0];

    if (!zipFile) {
        showAlert('请先选择 .zip 证书包文件', 'warning');
        return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    const btn = document.getElementById('btnUploadCertZip');
    if (btn) {
        btn.disabled = true;
        btn.dataset.originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>解压中...';
    }

    try {
        const formData = new FormData();
        formData.append('certZip', zipFile);

        const response = await fetch('/api/payment-config/upload-cert-zip', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        const result = await response.json();

        if (result.code === 0) {
            showAlert(result.message || '证书包已解压', 'success');
            if (zipInput) zipInput.value = '';
        } else {
            throw new Error(result.message || '上传失败');
        }
    } catch (error) {
        console.error('上传证书包失败:', error);
        showAlert('上传证书包失败: ' + error.message, 'danger');
    } finally {
        if (btn) {
            btn.disabled = false;
            if (btn.dataset.originalHtml) {
                btn.innerHTML = btn.dataset.originalHtml;
                delete btn.dataset.originalHtml;
            }
        }
    }
}

// 暴露给 HTML onclick
window.applySuggestedNotifyUrl = applySuggestedNotifyUrl;
window.uploadCertFiles = uploadCertFiles;
window.uploadCertZip = uploadCertZip;
