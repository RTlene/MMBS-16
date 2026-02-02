// 短信营销管理数据
window.smsManagementData = {
    templates: [],
    currentPage: 1,
    totalPages: 1,
    pageSize: 10,
    searchKeyword: '',
    typeFilter: '',
    statusFilter: '',
    currentTemplate: null
};

// 页面初始化
function initSmsManagement() {
    console.log('初始化短信营销管理页面');
    loadStats();
    loadTemplates();
    bindEvents();
}

// 绑定事件
function bindEvents() {
    // 搜索输入框回车事件
    document.getElementById('searchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchTemplates();
        }
    });

    // 筛选条件变化事件
    document.getElementById('typeFilter').addEventListener('change', searchTemplates);
    document.getElementById('statusFilter').addEventListener('change', searchTemplates);

    // 内容预览事件
    document.getElementById('templateContent').addEventListener('input', updateContentPreview);
}

// 加载统计数据
async function loadStats() {
    try {
        const response = await fetch('/api/sms-templates/stats', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            document.getElementById('totalTemplates').textContent = result.data.total || 0;
            document.getElementById('activeTemplates').textContent = result.data.active || 0;
            document.getElementById('totalSent').textContent = result.data.totalSent || 0;
            document.getElementById('todaySent').textContent = result.data.todaySent || 0;
        }
    } catch (error) {
        console.error('加载统计数据失败:', error);
    }
}

// 加载短信模板列表
async function loadTemplates() {
    try {
        const params = new URLSearchParams({
            page: window.smsManagementData.currentPage,
            limit: window.smsManagementData.pageSize,
            search: window.smsManagementData.searchKeyword,
            type: window.smsManagementData.typeFilter,
            status: window.smsManagementData.statusFilter
        });

        const response = await fetch(`/api/sms-templates?${params}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            window.smsManagementData.templates = result.data.templates || [];
            window.smsManagementData.totalPages = result.data.totalPages || 1;
            renderTemplateTable();
            renderPagination();
        } else {
            alert('加载短信模板列表失败: ' + result.message);
        }
    } catch (error) {
        console.error('加载短信模板列表失败:', error);
        alert('加载短信模板列表失败');
    }
}

// 渲染短信模板表格
function renderTemplateTable() {
    const tbody = document.getElementById('templateTableBody');
    tbody.innerHTML = '';

    window.smsManagementData.templates.forEach(template => {
        const row = document.createElement('tr');
        const contentPreview = template.content.length > 50 ? 
            template.content.substring(0, 50) + '...' : 
            template.content;
        
        row.innerHTML = `
            <td>${template.id}</td>
            <td>${template.name}</td>
            <td><span class="type-badge">${getTypeText(template.type)}</span></td>
            <td><span class="status-badge status-${template.status}">${getStatusText(template.status)}</span></td>
            <td title="${template.content}">${contentPreview}</td>
            <td>${formatDate(template.createdAt)}</td>
            <td>
                <button class="btn btn-primary" onclick="editTemplate(${template.id})">编辑</button>
                <button class="btn btn-warning" onclick="testTemplate(${template.id})">测试</button>
                <button class="btn btn-danger" onclick="deleteTemplate(${template.id})">删除</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 渲染分页
function renderPagination() {
    const pagination = document.getElementById('pagination');
    pagination.innerHTML = '';

    const { currentPage, totalPages } = window.smsManagementData;

    // 上一页按钮
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '上一页';
    prevBtn.disabled = currentPage <= 1;
    prevBtn.onclick = () => {
        if (currentPage > 1) {
            window.smsManagementData.currentPage = currentPage - 1;
            loadTemplates();
        }
    };
    pagination.appendChild(prevBtn);

    // 页码按钮
    for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.textContent = i;
        pageBtn.className = i === currentPage ? 'active' : '';
        pageBtn.onclick = () => {
            window.smsManagementData.currentPage = i;
            loadTemplates();
        };
        pagination.appendChild(pageBtn);
    }

    // 下一页按钮
    const nextBtn = document.createElement('button');
    nextBtn.textContent = '下一页';
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.onclick = () => {
        if (currentPage < totalPages) {
            window.smsManagementData.currentPage = currentPage + 1;
            loadTemplates();
        }
    };
    pagination.appendChild(nextBtn);
}

// 搜索短信模板
function searchTemplates() {
    window.smsManagementData.searchKeyword = document.getElementById('searchInput').value;
    window.smsManagementData.typeFilter = document.getElementById('typeFilter').value;
    window.smsManagementData.statusFilter = document.getElementById('statusFilter').value;
    window.smsManagementData.currentPage = 1;
    loadTemplates();
}

// 显示添加模板模态框
function showAddTemplateModal() {
    window.smsManagementData.currentTemplate = null;
    document.getElementById('templateModalTitle').textContent = '添加短信模板';
    document.getElementById('templateForm').reset();
    updateContentPreview();
    document.getElementById('templateModal').classList.add('show');
}

// 编辑模板
function editTemplate(templateId) {
    const template = window.smsManagementData.templates.find(t => t.id === templateId);
    if (!template) return;

    window.smsManagementData.currentTemplate = template;
    document.getElementById('templateModalTitle').textContent = '编辑短信模板';
    
    // 填充表单数据
    document.getElementById('templateName').value = template.name;
    document.getElementById('templateType').value = template.type;
    document.getElementById('templateStatus').value = template.status;
    document.getElementById('templateContent').value = template.content;
    
    updateContentPreview();
    document.getElementById('templateModal').classList.add('show');
}

// 更新内容预览
function updateContentPreview() {
    const content = document.getElementById('templateContent').value;
    const preview = document.getElementById('contentPreview');
    
    if (!content) {
        preview.textContent = '请输入短信内容';
        return;
    }
    
    // 简单的变量替换预览
    let previewContent = content
        .replace(/\{name\}/g, '张三')
        .replace(/\{code\}/g, '123456')
        .replace(/\{time\}/g, new Date().toLocaleString('zh-CN'))
        .replace(/\{amount\}/g, '100.00')
        .replace(/\{orderNo\}/g, 'ORD20231201001');
    
    preview.textContent = previewContent;
}

// 保存模板
async function saveTemplate() {
    const formData = {
        name: document.getElementById('templateName').value,
        type: document.getElementById('templateType').value,
        status: document.getElementById('templateStatus').value,
        content: document.getElementById('templateContent').value
    };

    try {
        const url = window.smsManagementData.currentTemplate 
            ? `/api/sms-templates/${window.smsManagementData.currentTemplate.id}`
            : '/api/sms-templates';
        
        const method = window.smsManagementData.currentTemplate ? 'PUT' : 'POST';
        
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
            closeTemplateModal();
            loadTemplates();
            loadStats();
        } else {
            alert('保存失败: ' + result.message);
        }
    } catch (error) {
        console.error('保存短信模板失败:', error);
        alert('保存失败');
    }
}

// 测试模板
async function testTemplate(templateId) {
    const template = window.smsManagementData.templates.find(t => t.id === templateId);
    if (!template) return;

    const phoneNumber = prompt('请输入测试手机号：');
    if (!phoneNumber) return;

    if (!/^1[3-9]\d{9}$/.test(phoneNumber)) {
        alert('请输入正确的手机号');
        return;
    }

    try {
        const response = await fetch('/api/sms-templates/test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                templateId: templateId,
                phoneNumber: phoneNumber
            })
        });
        
        const result = await response.json();
        
        if (result.code === 0) {
            alert('测试短信发送成功');
        } else {
            alert('测试短信发送失败: ' + result.message);
        }
    } catch (error) {
        console.error('测试短信发送失败:', error);
        alert('测试短信发送失败');
    }
}

// 删除模板
async function deleteTemplate(templateId) {
    if (!confirm('确定要删除这个短信模板吗？')) return;

    try {
        const response = await fetch(`/api/sms-templates/${templateId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const result = await response.json();
        
        if (result.code === 0) {
            alert('删除成功');
            loadTemplates();
            loadStats();
        } else {
            alert('删除失败: ' + result.message);
        }
    } catch (error) {
        console.error('删除短信模板失败:', error);
        alert('删除失败');
    }
}

// 显示发送短信模态框
function showSendModal() {
    document.getElementById('sendModal').classList.add('show');
    loadTemplatesForSend();
}

// 加载模板到发送选择框
async function loadTemplatesForSend() {
    try {
        const response = await fetch('/api/sms-templates?status=active', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            const select = document.getElementById('sendTemplate');
            select.innerHTML = '<option value="">请选择模板</option>';
            
            result.data.templates.forEach(template => {
                const option = document.createElement('option');
                option.value = template.id;
                option.textContent = `${template.name} (${getTypeText(template.type)})`;
                option.dataset.content = template.content;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('加载模板失败:', error);
    }
}

// 更新发送预览
function updateSendPreview() {
    const templateSelect = document.getElementById('sendTemplate');
    const variablesText = document.getElementById('variables').value;
    const preview = document.getElementById('sendPreview');
    
    if (!templateSelect.value) {
        preview.textContent = '请选择模板';
        return;
    }
    
    const selectedOption = templateSelect.options[templateSelect.selectedIndex];
    let content = selectedOption.dataset.content;
    
    // 解析变量
    let variables = {};
    if (variablesText) {
        try {
            variables = JSON.parse(variablesText);
        } catch (e) {
            preview.textContent = '变量格式错误，请使用JSON格式';
            return;
        }
    }
    
    // 替换变量
    Object.keys(variables).forEach(key => {
        content = content.replace(new RegExp(`\\{${key}\\}`, 'g'), variables[key]);
    });
    
    preview.textContent = content;
}

// 发送短信
async function sendSms() {
    const templateId = document.getElementById('sendTemplate').value;
    const phoneNumbers = document.getElementById('phoneNumbers').value;
    const variablesText = document.getElementById('variables').value;
    
    if (!templateId) {
        alert('请选择模板');
        return;
    }
    
    if (!phoneNumbers.trim()) {
        alert('请输入接收手机号');
        return;
    }
    
    const phoneList = phoneNumbers.split('\n').map(phone => phone.trim()).filter(phone => phone);
    
    // 验证手机号格式
    const invalidPhones = phoneList.filter(phone => !/^1[3-9]\d{9}$/.test(phone));
    if (invalidPhones.length > 0) {
        alert(`以下手机号格式不正确：${invalidPhones.join(', ')}`);
        return;
    }
    
    let variables = {};
    if (variablesText) {
        try {
            variables = JSON.parse(variablesText);
        } catch (e) {
            alert('变量格式错误，请使用JSON格式');
            return;
        }
    }
    
    try {
        const response = await fetch('/api/sms-templates/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                templateId: parseInt(templateId),
                phoneNumbers: phoneList,
                variables: variables
            })
        });
        
        const result = await response.json();
        
        if (result.code === 0) {
            alert(`短信发送成功，共发送 ${result.data.sentCount} 条`);
            closeSendModal();
            loadStats();
        } else {
            alert('短信发送失败: ' + result.message);
        }
    } catch (error) {
        console.error('发送短信失败:', error);
        alert('发送短信失败');
    }
}

// 关闭模板模态框
function closeTemplateModal() {
    document.getElementById('templateModal').classList.remove('show');
}

// 关闭发送模态框
function closeSendModal() {
    document.getElementById('sendModal').classList.remove('show');
    document.getElementById('sendForm').reset();
    document.getElementById('sendPreview').textContent = '请选择模板';
}

// 工具函数
function getTypeText(type) {
    const typeMap = {
        'verification': '验证码',
        'notification': '通知',
        'marketing': '营销'
    };
    return typeMap[type] || type;
}

function getStatusText(status) {
    const statusMap = {
        'active': '有效',
        'inactive': '无效'
    };
    return statusMap[status] || status;
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN', { hour12: false });
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initSmsManagement();
});