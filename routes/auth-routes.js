const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// 登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        code: 1,
        message: '用户名和密码不能为空'
      });
    }

    const user = await User.findOne({ where: { username } });
    if (!user) {
      return res.status(401).json({
        code: 1,
        message: '用户名或密码错误'
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        code: 1,
        message: '用户名或密码错误'
      });
    }

    if (user.status !== 'active') {
      return res.status(401).json({
        code: 1,
        message: '账户已被禁用'
      });
    }

    // 生成JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role 
      },
      process.env.JWT_SECRET || 'your-secret-key-change-this',
      { expiresIn: '24h' }
    );

    // 更新最后登录时间
    await user.update({ lastLogin: new Date() });

    res.json({
      code: 0,
      message: '登录成功',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      }
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({
      code: 1,
      message: '登录失败'
    });
  }
});

// 登出
router.post('/logout', authenticateToken, (req, res) => {
  res.json({
    code: 0,
    message: '登出成功'
  });
});

// 获取当前用户信息
router.get('/me', authenticateToken, (req, res) => {
  res.json({
    code: 0,
    data: {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role
    }
  });
});

module.exports = router;