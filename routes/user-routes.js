const express = require('express');
const bcrypt = require('bcryptjs');
const { User } = require('../db');

const router = express.Router();

// 获取用户列表
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = {};
    if (search) {
      whereClause = {
        [require('sequelize').Op.or]: [
          { username: { [require('sequelize').Op.like]: `%${search}%` } },
          { email: { [require('sequelize').Op.like]: `%${search}%` } }
        ]
      };
    }
    
    const { count, rows } = await User.findAndCountAll({
      where: whereClause,
      attributes: { exclude: ['password'] },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });
    
    res.json({
      code: 0,
      data: {
        users: rows,
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('获取用户列表错误:', error);
    res.status(500).json({
      code: 1,
      message: "获取用户列表失败"
    });
  }
});

// 创建用户
router.post("/", async (req, res) => {
  try {
    const { username, password, email, role = 'user' } = req.body;
    
    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      return res.status(400).json({
        code: 1,
        message: "用户名已存在"
      });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = await User.create({
      username,
      password: hashedPassword,
      email,
      role
    });
    
    res.json({
      code: 0,
      message: "用户创建成功",
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status
      }
    });
  } catch (error) {
    console.error('创建用户错误:', error);
    res.status(500).json({
      code: 1,
      message: "创建用户失败"
    });
  }
});

// 更新用户
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, role, status, password } = req.body;
    
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        code: 1,
        message: "用户不存在"
      });
    }
    
    const updateData = { username, email, role, status };
    
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    
    await user.update(updateData);
    
    res.json({
      code: 0,
      message: "用户更新成功",
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status
      }
    });
  } catch (error) {
    console.error('更新用户错误:', error);
    res.status(500).json({
      code: 1,
      message: "更新用户失败"
    });
  }
});

// 删除用户
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        code: 1,
        message: "用户不存在"
      });
    }
    
    await user.destroy();
    
    res.json({
      code: 0,
      message: "用户删除成功"
    });
  } catch (error) {
    console.error('删除用户错误:', error);
    res.status(500).json({
      code: 1,
      message: "删除用户失败"
    });
  }
});

// 获取用户详情
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findByPk(id, {
      attributes: { exclude: ['password'] }
    });
    
    if (!user) {
      return res.status(404).json({
        code: 1,
        message: "用户不存在"
      });
    }
    
    res.json({
      code: 0,
      data: user
    });
  } catch (error) {
    console.error('获取用户详情错误:', error);
    res.status(500).json({
      code: 1,
      message: "获取用户详情失败"
    });
  }
});

module.exports = router;