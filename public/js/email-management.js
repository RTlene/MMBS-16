// 邮件营销管理
let emailTemplates = [];
let currentPage = 1;
let totalPages = 1;
let currentTemplate = null;

// 页面初始化
document.addEventListener('DOMContentLoaded', function() {
    initEmailManagement();
});

// 初始化邮件营销管理
function initEmailManagement() {
    loadStats();
    loadTemplates();
    bindEventListeners();
}

// 绑定事件监听器
function bindEventListeners() {
    // 搜索功能
    document.getElementById('searchInput').addEventListener('input', function() {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            searchTemplates();
        }, 500);
    });

    // 筛选条件变化
    document.getElementById('typeFilter').addEventListener('change', searchTemplates);
    document.getElementById('statusFilter').addEventListener('change', searchTemplates);

    // 模板表单变化
    document.getElementById('templateSubject').addEventListener('input', updateEmailPreview);
    document.getElementById('templateContent').addEventListener('input', updateEmailPreview);
    document.getElementById('templateType').addEventListener('change', updateEmailPreview);
}

// 加载统计数据
async function loadStats() {
    try {
        const response = await fetch('/api/email-templates/stats', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            document.getElementById('totalTemplates').textContent = result.data.total;
            document.getElementById('activeTemplates').textContent = result.data.active;
            document.getElementById('totalSent').textContent = result.data.totalSent;
            document.getElementById('todaySent').textContent = result.data.todaySent;
        }
    } catch (error) {
        console.error('加载统计数据失败:', error);
    }
}

// 加载邮件模板列表
async function loadTemplates() {
    try {
        const search = document.getElementById('searchInput').value;
        const type = document.getElementById('typeFilter').value;
        const status = document.getElementById('statusFilter').value;
        
        const params = new URLSearchParams({
            page: currentPage,
            limit: 10,
            search: search,
            type: type,
            status: status
        });

        const response = await fetch(`/api/email-templates?${params}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            emailTemplates = result.data.templates;
            totalPages = result.data.totalPages;
            renderTemplatesTable();
            renderPagination();
        }
    } catch (error) {
        console.error('加载邮件模板列表失败:', error);
    }
}

// 渲染邮件模板表格
function renderTemplatesTable() {
    const tbody = document.getElementById('templateTableBody');
    tbody.innerHTML = '';

    emailTemplates.forEach(template => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${template.id}</td>
            <td>${template.name}</td>
            <td><span class="type-badge">${getTypeText(template.type)}</span></td>
            <td><span class="status-badge status-${template.status}">${template.status === 'active' ? '有效' : '无效'}</span></td>
            <td>${template.subject ? template.subject.substring(0, 30) + '...' : '-'}</td>
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

    // 上一页按钮
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '上一页';
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            loadTemplates();
        }
    };
    pagination.appendChild(prevBtn);

    // 页码按钮
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);

    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.textContent = i;
        pageBtn.className = i === currentPage ? 'active' : '';
        pageBtn.onclick = () => {
            currentPage = i;
            loadTemplates();
        };
        pagination.appendChild(pageBtn);
    }

    // 下一页按钮
    const nextBtn = document.createElement('button');
    nextBtn.textContent = '下一页';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => {
        if (currentPage < totalPages) {
            currentPage++;
            loadTemplates();
        }
    };
    pagination.appendChild(nextBtn);
}

// 搜索邮件模板
function searchTemplates() {
    currentPage = 1;
    loadTemplates();
}

// 显示添加模板模态框
function showAddTemplateModal() {
    currentTemplate = null;
    document.getElementById('templateModalTitle').textContent = '添加邮件模板';
    document.getElementById('templateForm').reset();
    document.getElementById('templateModal').classList.add('show');
    updateEmailPreview();
}

// 编辑模板
async function editTemplate(id) {
    try {
        const response = await fetch(`/api/email-templates/${id}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            currentTemplate = result.data;
            document.getElementById('templateModalTitle').textContent = '编辑邮件模板';
            document.getElementById('templateName').value = currentTemplate.name;
            document.getElementById('templateType').value = currentTemplate.type;
            document.getElementById('templateStatus').value = currentTemplate.status;
            document.getElementById('templateSubject').value = currentTemplate.subject || '';
            document.getElementById('templateContent').value = currentTemplate.content || '';
            document.getElementById('templateModal').classList.add('show');
            updateEmailPreview();
        }
    } catch (error) {
        console.error('获取模板详情失败:', error);
        alert('获取模板详情失败');
    }
}

// 保存模板
async function saveTemplate() {
    try {
        const formData = {
            name: document.getElementById('templateName').value,
            type: document.getElementById('templateType').value,
            status: document.getElementById('templateStatus').value,
            subject: document.getElementById('templateSubject').value,
            content: document.getElementById('templateContent').value
        };

        if (!formData.name || !formData.subject || !formData.content) {
            alert('请填写所有必填字段');
            return;
        }

        const url = currentTemplate ? `/api/email-templates/${currentTemplate.id}` : '/api/email-templates';
        const method = currentTemplate ? 'PUT' : 'POST';

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
            alert(currentTemplate ? '更新成功' : '创建成功');
            closeTemplateModal();
            loadTemplates();
            loadStats();
        } else {
            alert(result.message || '保存失败');
        }
    } catch (error) {
        console.error('保存模板失败:', error);
        alert('保存失败');
    }
}

// 删除模板
async function deleteTemplate(id) {
    if (!confirm('确定要删除这个模板吗？')) {
        return;
    }

    try {
        const response = await fetch(`/api/email-templates/${id}`, {
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
            alert(result.message || '删除失败');
        }
    } catch (error) {
        console.error('删除模板失败:', error);
        alert('删除失败');
    }
}

// 测试模板
async function testTemplate(id) {
    const email = prompt('请输入测试邮箱地址：');
    if (!email) return;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        alert('邮箱格式不正确');
        return;
    }

    try {
        const response = await fetch('/api/email-templates/test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                templateId: id,
                email: email
            })
        });

        const result = await response.json();
        
        if (result.code === 0) {
            alert('测试邮件发送成功');
        } else {
            alert(result.message || '测试发送失败');
        }
    } catch (error) {
        console.error('测试发送失败:', error);
        alert('测试发送失败');
    }
}

// 显示发送邮件模态框
async function showSendModal() {
    try {
        // 加载模板列表
        const response = await fetch('/api/email-templates?status=active', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            const templateSelect = document.getElementById('sendTemplate');
            templateSelect.innerHTML = '<option value="">请选择模板</option>';
            
            result.data.templates.forEach(template => {
                const option = document.createElement('option');
                option.value = template.id;
                option.textContent = template.name;
                templateSelect.appendChild(option);
            });
        }
        
        document.getElementById('sendForm').reset();
        document.getElementById('sendModal').classList.add('show');
        updateSendPreview();
    } catch (error) {
        console.error('加载模板列表失败:', error);
        alert('加载模板列表失败');
    }
}

// 更新发送预览
async function updateSendPreview() {
    const templateId = document.getElementById('sendTemplate').value;
    if (!templateId) {
        document.getElementById('sendPreview').innerHTML = `
            <div class="email-subject">请选择模板</div>
            <div class="email-body">请选择模板</div>
        `;
        return;
    }

    try {
        const response = await fetch(`/api/email-templates/${templateId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const result = await response.json();
        
        if (result.code === 0) {
            const template = result.data;
            let subject = template.subject || '';
            let content = template.content || '';

            // 处理变量替换
            const variablesText = document.getElementById('variables').value;
            if (variablesText) {
                try {
                    const variables = JSON.parse(variablesText);
                    Object.keys(variables).forEach(key => {
                        subject = subject.replace(new RegExp(`\\{${key}\\}`, 'g'), variables[key]);
                        content = content.replace(new RegExp(`\\{${key}\\}`, 'g'), variables[key]);
                    });
                } catch (e) {
                    console.warn('变量格式不正确');
                }
            }

            document.getElementById('sendPreview').innerHTML = `
                <div class="email-subject">${subject}</div>
                <div class="email-body">${content}</div>
            `;
        }
    } catch (error) {
        console.error('更新预览失败:', error);
    }
}

// 发送邮件
async function sendEmail() {
    try {
        const templateId = document.getElementById('sendTemplate').value;
        const emailAddresses = document.getElementById('emailAddresses').value;
        const variablesText = document.getElementById('variables').value;

        if (!templateId || !emailAddresses) {
            alert('请选择模板并输入邮箱地址');
            return;
        }

        // 解析邮箱地址
        const emails = emailAddresses.split('\n').map(email => email.trim()).filter(email => email);
        if (emails.length === 0) {
            alert('请输入有效的邮箱地址');
            return;
        }

        // 验证邮箱格式
        const invalidEmails = emails.filter(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
        if (invalidEmails.length > 0) {
            alert(`以下邮箱格式不正确：${invalidEmails.join(', ')}`);
            return;
        }

        let variables = {};
        if (variablesText) {
            try {
                variables = JSON.parse(variablesText);
            } catch (e) {
                alert('变量格式不正确，请使用JSON格式');
                return;
            }
        }

        const response = await fetch('/api/email-templates/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                templateId: templateId,
                emails: emails,
                variables: variables
            })
        });

        const result = await response.json();
        
        if (result.code === 0) {
            alert(`邮件发送成功，共发送 ${result.data.sentCount} 封邮件`);
            closeSendModal();
            loadStats();
        } else {
            alert(result.message || '发送失败');
        }
    } catch (error) {
        console.error('发送邮件失败:', error);
        alert('发送失败');
    }
}

// 更新邮件预览
function updateEmailPreview() {
    const subject = document.getElementById('templateSubject').value || '请输入邮件主题';
    const content = document.getElementById('templateContent').value || '请输入邮件内容';
    
    document.getElementById('subjectPreview').textContent = subject;
    document.getElementById('contentPreview').innerHTML = content.replace(/\n/g, '<br>');
}

// 关闭模板模态框
function closeTemplateModal() {
    document.getElementById('templateModal').classList.remove('show');
    currentTemplate = null;
}

// 关闭发送模态框
function closeSendModal() {
    document.getElementById('sendModal').classList.remove('show');
}

// 获取类型文本
function getTypeText(type) {
    const typeMap = {
        'welcome': '欢迎邮件',
        'order': '订单邮件',
        'promotion': '促销邮件',
        'newsletter': '新闻邮件'
    };
    return typeMap[type] || type;
}

// 格式化日期
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}