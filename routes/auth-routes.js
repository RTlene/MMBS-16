const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const captchaService = require('../services/captchaService');

const router = express.Router();

// 获取登录验证码图片
router.get('/captcha', (req, res) => {
  try {
    if (!captchaService.isAvailable()) {
      return res.status(503).json({
        code: 1,
        message: '验证码服务未就绪'
      });
    }
    const data = captchaService.createCaptcha();
    res.json({
      code: 0,
      data
    });
  } catch (error) {
    console.error('生成验证码失败:', error);
    res.status(500).json({
      code: 1,
      message: '生成验证码失败'
    });
  }
});

// 登录
router.post('/login', async (req, res) => {
  try {
    const { username, password, captcha, captchaToken } = req.body;
    // 兼容旧字段名 captchaId（曾用于内存版；现为 JWT 字符串）
    const captchaTokenPayload = captchaToken || req.body.captchaId;

    if (!username || !password) {
      return res.status(400).json({
        code: 1,
        message: '用户名和密码不能为空'
      });
    }

    if (!captchaService.isAvailable()) {
      return res.status(503).json({
        code: 1,
        message: '验证码服务未就绪'
      });
    }

    if (!captchaTokenPayload || captcha == null || String(captcha).trim() === '') {
      return res.status(400).json({
        code: 1,
        message: '请输入验证码'
      });
    }

    if (!captchaService.verifyCaptchaToken(captchaTokenPayload, captcha)) {
      return res.status(401).json({
        code: 1,
        message: '验证码错误或已过期，请刷新后重试'
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