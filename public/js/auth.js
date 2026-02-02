// 认证相关功能
class Auth {
    constructor() {
        this.token = localStorage.getItem('token');
        this.user = JSON.parse(localStorage.getItem('user') || 'null');
    }

    // 检查登录状态
    isLoggedIn() {
        return !!this.token;
    }

    // 获取token
    getToken() {
        return this.token;
    }

    // 获取用户信息
    getUser() {
        return this.user;
    }

    // 登录
    async login(username, password) {
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            });

            const result = await response.json();

            if (result.code === 0) {
                this.token = result.data.token;
                this.user = result.data.user;
                
                localStorage.setItem('token', this.token);
                localStorage.setItem('user', JSON.stringify(this.user));
                
                return { success: true, message: result.message };
            } else {
                return { success: false, message: result.message };
            }
        } catch (error) {
            console.error('登录错误:', error);
            return { success: false, message: '网络错误，请稍后重试' };
        }
    }

    // 登出
    async logout() {
        try {
            if (this.token) {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`
                    }
                });
            }
        } catch (error) {
            console.error('登出错误:', error);
        } finally {
            this.token = null;
            this.user = null;
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login.html';
        }
    }

    // 验证token
    async validateToken() {
        if (!this.token) return false;

        try {
            const response = await fetch('/api/auth/me', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            const result = await response.json();
            return result.code === 0;
        } catch (error) {
            console.error('Token验证错误:', error);
            return false;
        }
    }
}

// 全局认证实例
window.auth = new Auth();

// 登录页面逻辑
if (window.location.pathname === '/login.html') {
    document.addEventListener('DOMContentLoaded', function() {
        const loginForm = document.getElementById('loginForm');
        const errorMessage = document.getElementById('errorMessage');
        const loading = document.getElementById('loading');
        const loginBtn = document.getElementById('loginBtn');

        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;

            if (!username || !password) {
                showError('请输入用户名和密码');
                return;
            }

            // 显示加载状态
            loading.style.display = 'block';
            loginBtn.disabled = true;
            hideError();

            const result = await window.auth.login(username, password);

            // 隐藏加载状态
            loading.style.display = 'none';
            loginBtn.disabled = false;

            if (result.success) {
                // 登录成功，跳转到主页
                window.location.href = '/';
            } else {
                showError(result.message);
            }
        });

        function showError(message) {
            errorMessage.textContent = message;
            errorMessage.style.display = 'block';
        }

        function hideError() {
            errorMessage.style.display = 'none';
        }
    });
}