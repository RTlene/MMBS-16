// 积分设置管理JavaScript
let currentTab = 'source';
let sourceConfigs = [];
let multiplierConfigs = [];
let ruleConfigs = [];

// 页面初始化
document.addEventListener('DOMContentLoaded', function() {
    initializePage();
    bindEvents();
    loadData();
});

// 初始化页面
function initializePage() {
    // 设置默认标签页
    const tabButtons = document.querySelectorAll('#settingsTabs button[data-bs-toggle="tab"]');
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            currentTab = this.getAttribute('data-bs-target').replace('#', '');
            loadData();
        });
    });
}

// 绑定事件
function bindEvents() {
    // 表单提交事件
    document.getElementById('sourceConfigForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveSourceConfig();
    });

    document.getElementById('multiplierConfigForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveMultiplierConfig();
    });

    document.getElementById('ruleConfigForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveRuleConfig();
    });
}

// 加载数据
async function loadData() {
    try {
        await Promise.all([
            loadSourceConfigs(),
            loadMultiplierConfigs(),
            loadRuleConfigs(),
            loadStats()
        ]);
    } catch (error) {
        console.error('加载数据失败:', error);
        showAlert('加载数据失败', 'danger');
    }
}

// 加载积分来源配置
async function loadSourceConfigs() {
    try {
        const response = await fetch('/api/point-settings/source-configs');
        const result = await response.json();
        
        if (result.code === 0) {
            sourceConfigs = result.data;
            renderSourceConfigTable();
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('加载积分来源配置失败:', error);
        showAlert('加载积分来源配置失败', 'danger');
    }
}

// 加载倍率配置
async function loadMultiplierConfigs() {
    try {
        const response = await fetch('/api/point-settings/multiplier-configs');
        const result = await response.json();
        
        if (result.code === 0) {
            multiplierConfigs = result.data;
            renderMultiplierConfigTable();
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('加载倍率配置失败:', error);
        showAlert('加载倍率配置失败', 'danger');
    }
}

// 加载规则配置
async function loadRuleConfigs() {
    try {
        const response = await fetch('/api/point-settings/rule-configs');
        const result = await response.json();
        
        if (result.code === 0) {
            ruleConfigs = result.data;
            renderRuleConfigTable();
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('加载规则配置失败:', error);
        showAlert('加载规则配置失败', 'danger');
    }
}

// 加载统计信息
async function loadStats() {
    try {
        const response = await fetch('/api/point-settings/stats');
        const result = await response.json();
        
        if (result.code === 0) {
            updateStats(result.data);
        }
    } catch (error) {
        console.error('加载统计信息失败:', error);
    }
}

// 渲染积分来源配置表格
function renderSourceConfigTable() {
    const tbody = document.getElementById('sourceConfigTableBody');
    tbody.innerHTML = '';

    sourceConfigs.forEach(config => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div class="d-flex align-items-center">
                    <i class="bi bi-gift text-primary me-2"></i>
                    <div>
                        <div class="fw-bold">${config.sourceName}</div>
                        <small class="text-muted">${getSourceText(config.source)}</small>
                    </div>
                </div>
            </td>
            <td>
                <span class="badge bg-info">${config.basePoints}</span>
            </td>
            <td>
                <span class="badge bg-success">${config.multiplier}x</span>
            </td>
            <td>
                ${config.maxDailyPoints ? config.maxDailyPoints : '-'}
            </td>
            <td>
                ${config.maxTotalPoints ? config.maxTotalPoints : '-'}
            </td>
            <td>
                <span class="badge ${config.isEnabled ? 'bg-success' : 'bg-secondary'}">
                    ${config.isEnabled ? '启用' : '禁用'}
                </span>
            </td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" onclick="editSourceConfig(${config.id})" title="编辑">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="deleteSourceConfig(${config.id})" title="删除">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 渲染倍率配置表格
function renderMultiplierConfigTable() {
    const tbody = document.getElementById('multiplierConfigTableBody');
    tbody.innerHTML = '';

    multiplierConfigs.forEach(config => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div class="fw-bold">${config.name}</div>
                <small class="text-muted">${config.description || ''}</small>
            </td>
            <td>
                <span class="badge bg-warning">${config.multiplier}x</span>
            </td>
            <td>
                <small>${getConditionsText(config.conditions)}</small>
            </td>
            <td>
                <span class="badge bg-info">${config.priority}</span>
            </td>
            <td>
                <small>
                    ${config.validFrom ? formatDate(config.validFrom) : '-'} ~ 
                    ${config.validTo ? formatDate(config.validTo) : '-'}
                </small>
            </td>
            <td>
                <span class="badge ${config.isActive ? 'bg-success' : 'bg-secondary'}">
                    ${config.isActive ? '启用' : '禁用'}
                </span>
            </td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" onclick="editMultiplierConfig(${config.id})" title="编辑">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="deleteMultiplierConfig(${config.id})" title="删除">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 渲染规则配置表格
function renderRuleConfigTable() {
    const tbody = document.getElementById('ruleConfigTableBody');
    tbody.innerHTML = '';

    ruleConfigs.forEach(config => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div class="fw-bold">${config.name}</div>
                <small class="text-muted">${config.description || ''}</small>
            </td>
            <td>
                <span class="badge bg-primary">${getTypeText(config.type)}</span>
            </td>
            <td>
                <span class="badge bg-info">${getSourceText(config.source)}</span>
            </td>
            <td>
                <span class="badge bg-success">${config.basePoints}</span>
            </td>
            <td>
                <span class="badge bg-warning">${config.multiplier}x</span>
            </td>
            <td>
                <span class="badge bg-secondary">${config.priority}</span>
            </td>
            <td>
                <span class="badge ${config.isActive ? 'bg-success' : 'bg-secondary'}">
                    ${config.isActive ? '启用' : '禁用'}
                </span>
            </td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" onclick="editRuleConfig(${config.id})" title="编辑">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="deleteRuleConfig(${config.id})" title="删除">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 更新统计信息
function updateStats(stats) {
    document.getElementById('sourceCount').textContent = stats.sourceCount || 0;
    document.getElementById('multiplierCount').textContent = stats.multiplierCount || 0;
    document.getElementById('ruleCount').textContent = stats.ruleCount || 0;
    document.getElementById('activeCount').textContent = stats.activeCount || 0;
}

// 显示积分来源配置模态框
function showSourceConfigModal(config = null) {
    const modal = new bootstrap.Modal(document.getElementById('sourceConfigModal'));
    const form = document.getElementById('sourceConfigForm');
    
    form.reset();
    
    if (config) {
        // 编辑模式
        document.getElementById('sourceConfigId').value = config.id;
        document.getElementById('sourceConfigSource').value = config.source;
        document.getElementById('sourceConfigName').value = config.sourceName;
        document.getElementById('sourceConfigBasePoints').value = config.basePoints;
        document.getElementById('sourceConfigMultiplier').value = config.multiplier;
        document.getElementById('sourceConfigMaxDaily').value = config.maxDailyPoints || '';
        document.getElementById('sourceConfigMaxTotal').value = config.maxTotalPoints || '';
        document.getElementById('sourceConfigDescription').value = config.description || '';
        document.getElementById('sourceConfigEnabled').checked = config.isEnabled;
    }
    
    modal.show();
}

// 显示倍率配置模态框
function showMultiplierConfigModal(config = null) {
    const modal = new bootstrap.Modal(document.getElementById('multiplierConfigModal'));
    const form = document.getElementById('multiplierConfigForm');
    
    form.reset();
    
    if (config) {
        // 编辑模式
        document.getElementById('multiplierConfigId').value = config.id;
        document.getElementById('multiplierConfigName').value = config.name;
        document.getElementById('multiplierConfigValue').value = config.multiplier;
        document.getElementById('multiplierConfigPriority').value = config.priority;
        document.getElementById('multiplierConfigValidFrom').value = config.validFrom ? formatDateTimeLocal(config.validFrom) : '';
        document.getElementById('multiplierConfigValidTo').value = config.validTo ? formatDateTimeLocal(config.validTo) : '';
        document.getElementById('multiplierConfigDescription').value = config.description || '';
        document.getElementById('multiplierConfigEnabled').checked = config.isActive;
    }
    
    modal.show();
}

// 显示规则配置模态框
function showRuleConfigModal(config = null) {
    const modal = new bootstrap.Modal(document.getElementById('ruleConfigModal'));
    const form = document.getElementById('ruleConfigForm');
    
    form.reset();
    
    if (config) {
        // 编辑模式
        document.getElementById('ruleConfigId').value = config.id;
        document.getElementById('ruleConfigName').value = config.name;
        document.getElementById('ruleConfigType').value = config.type;
        document.getElementById('ruleConfigSource').value = config.source;
        document.getElementById('ruleConfigBasePoints').value = config.basePoints;
        document.getElementById('ruleConfigMultiplier').value = config.multiplier;
        document.getElementById('ruleConfigPriority').value = config.priority;
        document.getElementById('ruleConfigMinOrderAmount').value = config.minOrderAmount || '';
        document.getElementById('ruleConfigMaxOrderAmount').value = config.maxOrderAmount || '';
        document.getElementById('ruleConfigValidFrom').value = config.validFrom ? formatDateTimeLocal(config.validFrom) : '';
        document.getElementById('ruleConfigValidTo').value = config.validTo ? formatDateTimeLocal(config.validTo) : '';
        document.getElementById('ruleConfigConditions').value = config.conditions ? JSON.stringify(config.conditions, null, 2) : '';
        document.getElementById('ruleConfigDescription').value = config.description || '';
        document.getElementById('ruleConfigEnabled').checked = config.isActive;
    }
    
    modal.show();
}

// 保存积分来源配置
async function saveSourceConfig() {
    try {
        const formData = {
            source: document.getElementById('sourceConfigSource').value,
            sourceName: document.getElementById('sourceConfigName').value,
            basePoints: parseInt(document.getElementById('sourceConfigBasePoints').value),
            multiplier: parseFloat(document.getElementById('sourceConfigMultiplier').value),
            maxDailyPoints: document.getElementById('sourceConfigMaxDaily').value ? parseInt(document.getElementById('sourceConfigMaxDaily').value) : null,
            maxTotalPoints: document.getElementById('sourceConfigMaxTotal').value ? parseInt(document.getElementById('sourceConfigMaxTotal').value) : null,
            description: document.getElementById('sourceConfigDescription').value,
            isEnabled: document.getElementById('sourceConfigEnabled').checked
        };

        const configId = document.getElementById('sourceConfigId').value;
        const url = configId ? `/api/point-settings/source-configs/${configId}` : '/api/point-settings/source-configs';
        const method = configId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (result.code === 0) {
            showAlert('保存成功', 'success');
            bootstrap.Modal.getInstance(document.getElementById('sourceConfigModal')).hide();
            loadSourceConfigs();
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('保存积分来源配置失败:', error);
        showAlert('保存失败: ' + error.message, 'danger');
    }
}

// 保存倍率配置
async function saveMultiplierConfig() {
    try {
        const formData = {
            name: document.getElementById('multiplierConfigName').value,
            multiplier: parseFloat(document.getElementById('multiplierConfigValue').value),
            priority: parseInt(document.getElementById('multiplierConfigPriority').value),
            validFrom: document.getElementById('multiplierConfigValidFrom').value ? new Date(document.getElementById('multiplierConfigValidFrom').value) : null,
            validTo: document.getElementById('multiplierConfigValidTo').value ? new Date(document.getElementById('multiplierConfigValidTo').value) : null,
            description: document.getElementById('multiplierConfigDescription').value,
            isActive: document.getElementById('multiplierConfigEnabled').checked
        };

        const configId = document.getElementById('multiplierConfigId').value;
        const url = configId ? `/api/point-settings/multiplier-configs/${configId}` : '/api/point-settings/multiplier-configs';
        const method = configId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (result.code === 0) {
            showAlert('保存成功', 'success');
            bootstrap.Modal.getInstance(document.getElementById('multiplierConfigModal')).hide();
            loadMultiplierConfigs();
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('保存倍率配置失败:', error);
        showAlert('保存失败: ' + error.message, 'danger');
    }
}

// 保存规则配置
async function saveRuleConfig() {
    try {
        const formData = {
            name: document.getElementById('ruleConfigName').value,
            type: document.getElementById('ruleConfigType').value,
            source: document.getElementById('ruleConfigSource').value,
            basePoints: parseInt(document.getElementById('ruleConfigBasePoints').value),
            multiplier: parseFloat(document.getElementById('ruleConfigMultiplier').value),
            priority: parseInt(document.getElementById('ruleConfigPriority').value),
            minOrderAmount: document.getElementById('ruleConfigMinOrderAmount').value ? parseFloat(document.getElementById('ruleConfigMinOrderAmount').value) : null,
            maxOrderAmount: document.getElementById('ruleConfigMaxOrderAmount').value ? parseFloat(document.getElementById('ruleConfigMaxOrderAmount').value) : null,
            validFrom: document.getElementById('ruleConfigValidFrom').value ? new Date(document.getElementById('ruleConfigValidFrom').value) : null,
            validTo: document.getElementById('ruleConfigValidTo').value ? new Date(document.getElementById('ruleConfigValidTo').value) : null,
            conditions: document.getElementById('ruleConfigConditions').value ? JSON.parse(document.getElementById('ruleConfigConditions').value) : null,
            description: document.getElementById('ruleConfigDescription').value,
            isActive: document.getElementById('ruleConfigEnabled').checked
        };

        const configId = document.getElementById('ruleConfigId').value;
        const url = configId ? `/api/point-settings/rule-configs/${configId}` : '/api/point-settings/rule-configs';
        const method = configId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (result.code === 0) {
            showAlert('保存成功', 'success');
            bootstrap.Modal.getInstance(document.getElementById('ruleConfigModal')).hide();
            loadRuleConfigs();
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('保存规则配置失败:', error);
        showAlert('保存失败: ' + error.message, 'danger');
    }
}

// 编辑积分来源配置
function editSourceConfig(id) {
    const config = sourceConfigs.find(c => c.id === id);
    if (config) {
        showSourceConfigModal(config);
    }
}

// 编辑倍率配置
function editMultiplierConfig(id) {
    const config = multiplierConfigs.find(c => c.id === id);
    if (config) {
        showMultiplierConfigModal(config);
    }
}

// 编辑规则配置
function editRuleConfig(id) {
    const config = ruleConfigs.find(c => c.id === id);
    if (config) {
        showRuleConfigModal(config);
    }
}

// 删除积分来源配置
async function deleteSourceConfig(id) {
    if (!confirm('确定要删除这个积分来源配置吗？')) {
        return;
    }

    try {
        const response = await fetch(`/api/point-settings/source-configs/${id}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.code === 0) {
            showAlert('删除成功', 'success');
            loadSourceConfigs();
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('删除积分来源配置失败:', error);
        showAlert('删除失败: ' + error.message, 'danger');
    }
}

// 删除倍率配置
async function deleteMultiplierConfig(id) {
    if (!confirm('确定要删除这个倍率配置吗？')) {
        return;
    }

    try {
        const response = await fetch(`/api/point-settings/multiplier-configs/${id}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.code === 0) {
            showAlert('删除成功', 'success');
            loadMultiplierConfigs();
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('删除倍率配置失败:', error);
        showAlert('删除失败: ' + error.message, 'danger');
    }
}

// 删除规则配置
async function deleteRuleConfig(id) {
    if (!confirm('确定要删除这个规则配置吗？')) {
        return;
    }

    try {
        const response = await fetch(`/api/point-settings/rule-configs/${id}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.code === 0) {
            showAlert('删除成功', 'success');
            loadRuleConfigs();
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('删除规则配置失败:', error);
        showAlert('删除失败: ' + error.message, 'danger');
    }
}

// 刷新数据
function refreshData() {
    loadData();
}

// 辅助函数
function getSourceText(source) {
    const sourceMap = {
        'register': '注册',
        'order': '订单',
        'share': '分享',
        'invite': '邀请',
        'review': '评价',
        'signin': '签到',
        'activity': '活动',
        'admin': '管理员赠送'
    };
    return sourceMap[source] || source;
}

function getTypeText(type) {
    const typeMap = {
        'source': '积分来源',
        'rate': '倍率设置',
        'rule': '规则设置'
    };
    return typeMap[type] || type;
}

function getConditionsText(conditions) {
    if (!conditions) return '-';
    if (typeof conditions === 'string') {
        try {
            conditions = JSON.parse(conditions);
        } catch (e) {
            return conditions;
        }
    }
    return Object.entries(conditions).map(([key, value]) => `${key}: ${value}`).join(', ');
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN');
}

function formatDateTimeLocal(dateString) {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function showAlert(message, type) {
    // 创建提示框
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alertDiv);
    
    // 3秒后自动移除
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.parentNode.removeChild(alertDiv);
        }
    }, 3000);
}