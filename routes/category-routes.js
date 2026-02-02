const express = require('express');
const { Op } = require('sequelize');
const { Category } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// 获取所有分类
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '' } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = {};
        if (search) {
            whereClause = {
                [Op.or]: [
                    { name: { [Op.like]: `%${search}%` } },
                    { description: { [Op.like]: `%${search}%` } }
                ]
            };
        }

        const { count, rows } = await Category.findAndCountAll({
            where: whereClause,
            order: [['sortOrder', 'ASC'], ['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            code: 0,
            data: {
                categories: rows,
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(count / limit)
            }
        });
    } catch (error) {
        console.error('获取分类列表错误:', error);
        res.status(500).json({
            code: 1,
            message: '获取分类列表失败'
        });
    }
});

// 创建分类
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { name, description, parentId, sortOrder, status } = req.body;

        if (!name) {
            return res.status(400).json({
                code: 1,
                message: '分类名称不能为空'
            });
        }

        const category = await Category.create({
            name,
            description,
            parentId: parentId || null,
            sortOrder: sortOrder || 0,
            status: status || 'active'
        });

        res.json({
            code: 0,
            message: '分类创建成功',
            data: category
        });
    } catch (error) {
        console.error('创建分类错误:', error);
        if (error.name === 'SequelizeUniqueConstraintError') {
            res.status(400).json({
                code: 1,
                message: '分类名称已存在'
            });
        } else {
            res.status(500).json({
                code: 1,
                message: '创建分类失败'
            });
        }
    }
});

// 获取单个分类信息
router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const category = await Category.findByPk(id);
      
      if (!category) {
        return res.status(404).json({
          code: 1,
          message: '分类不存在'
        });
      }
      
      res.json({
        code: 0,
        message: '获取成功',
        data: category
      });
    } catch (error) {
      console.error('获取分类失败:', error);
      res.status(500).json({
        code: 1,
        message: '服务器错误'
      });
    }
  });

// 更新分类
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, parentId, sortOrder, status } = req.body;

        const category = await Category.findByPk(id);
        if (!category) {
            return res.status(404).json({
                code: 1,
                message: '分类不存在'
            });
        }

        await category.update({
            name,
            description,
            parentId: parentId || null,
            sortOrder: sortOrder || 0,
            status: status || 'active'
        });

        res.json({
            code: 0,
            message: '分类更新成功',
            data: category
        });
    } catch (error) {
        console.error('更新分类错误:', error);
        if (error.name === 'SequelizeUniqueConstraintError') {
            res.status(400).json({
                code: 1,
                message: '分类名称已存在'
            });
        } else {
            res.status(500).json({
                code: 1,
                message: '更新分类失败'
            });
        }
    }
});

// 删除分类
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const category = await Category.findByPk(id);
        if (!category) {
            return res.status(404).json({
                code: 1,
                message: '分类不存在'
            });
        }

        await category.destroy();

        res.json({
            code: 0,
            message: '分类删除成功'
        });
    } catch (error) {
        console.error('删除分类错误:', error);
        res.status(500).json({
            code: 1,
            message: '删除分类失败'
        });
    }
});

module.exports = router;