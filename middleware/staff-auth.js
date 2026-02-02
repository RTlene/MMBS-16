const jwt = require('jsonwebtoken');
const { User } = require('../db');

/**
 * 员工认证中间件（小程序端使用）
 * 验证JWT token并加载用户信息
 */
async function authenticateStaff(req, res, next) {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                code: 1,
                message: '未提供访问令牌'
            });
        }

        // 验证JWT token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        } catch (err) {
            return res.status(403).json({
                code: 1,
                message: '无效的访问令牌'
            });
        }

        // 从数据库加载用户信息
        const user = await User.findByPk(decoded.id);
        if (!user) {
            return res.status(403).json({
                code: 1,
                message: '用户不存在'
            });
        }

        // 检查用户状态
        if (user.status !== 'active') {
            return res.status(403).json({
                code: 1,
                message: '账户已被禁用'
            });
        }

        // 检查用户角色（必须是admin或user）
        if (!['admin', 'user'].includes(user.role)) {
            return res.status(403).json({
                code: 1,
                message: '无权限访问'
            });
        }

        // 将用户信息附加到请求对象
        req.staff = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role
        };

        next();
    } catch (error) {
        console.error('[StaffAuth] 认证失败:', error);
        res.status(500).json({
            code: 1,
            message: '认证失败',
            error: error.message
        });
    }
}

module.exports = { authenticateStaff };

