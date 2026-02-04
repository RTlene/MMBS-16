/**
 * 后台资讯/文章管理（CRUD）
 * 小程序首页「资讯」列表数据来源
 */
const express = require('express');
const { Op } = require('sequelize');
const { Article } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../public/uploads/articles');
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, 'article-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname));
  }
});

const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只允许上传图片'), false);
  }
});

// 列表（分页、搜索、状态筛选）
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status = '', sortBy = 'publishTime', sortOrder = 'DESC' } = req.query;
    const offset = (page - 1) * limit;
    const where = {};

    if (search && search.trim()) {
      where[Op.or] = [
        { title: { [Op.like]: `%${search.trim()}%` } },
        { summary: { [Op.like]: `%${search.trim()}%` } }
      ];
    }
    if (status && status.trim()) where.status = status.trim();

    const { count, rows } = await Article.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [[sortBy, sortOrder.toUpperCase()]]
    });

    res.json({
      code: 0,
      message: '获取成功',
      data: {
        articles: rows,
        total: count,
        totalPages: Math.ceil(count / limit),
        currentPage: parseInt(page)
      }
    });
  } catch (err) {
    console.error('[Article] list error:', err);
    res.status(500).json({ code: 1, message: '获取列表失败' });
  }
});

// 单条
router.get('/:id(\\d+)', authenticateToken, async (req, res) => {
  try {
    const article = await Article.findByPk(req.params.id);
    if (!article) return res.status(404).json({ code: 1, message: '资讯不存在' });
    res.json({ code: 0, data: article });
  } catch (err) {
    console.error('[Article] get error:', err);
    res.status(500).json({ code: 1, message: '获取失败' });
  }
});

// 新增（可选封面图）
router.post('/', authenticateToken, uploadMiddleware.single('coverImage'), async (req, res) => {
  try {
    const body = req.body || {};
    let coverImage = body.coverImage || '';
    if (req.file) coverImage = '/uploads/articles/' + req.file.filename;

    const article = await Article.create({
      title: body.title || '未命名',
      summary: body.summary || null,
      content: body.content || null,
      coverImage: coverImage || null,
      author: body.author || 'MMBS商城',
      publishTime: body.publishTime ? new Date(body.publishTime) : null,
      externalUrl: body.externalUrl || null,
      status: body.status || 'draft',
      sortOrder: parseInt(body.sortOrder, 10) || 0
    });

    res.json({ code: 0, message: '创建成功', data: article });
  } catch (err) {
    console.error('[Article] create error:', err);
    res.status(500).json({ code: 1, message: '创建失败' });
  }
});

// 更新（可选封面图）
router.put('/:id', authenticateToken, uploadMiddleware.single('coverImage'), async (req, res) => {
  try {
    const article = await Article.findByPk(req.params.id);
    if (!article) return res.status(404).json({ code: 1, message: '资讯不存在' });

    const body = req.body || {};
    let coverImage = body.coverImage !== undefined ? body.coverImage : article.coverImage;
    if (req.file) coverImage = '/uploads/articles/' + req.file.filename;

    await article.update({
      title: body.title !== undefined ? body.title : article.title,
      summary: body.summary !== undefined ? body.summary : article.summary,
      content: body.content !== undefined ? body.content : article.content,
      coverImage: coverImage,
      author: body.author !== undefined ? body.author : article.author,
      publishTime: body.publishTime !== undefined ? (body.publishTime ? new Date(body.publishTime) : null) : article.publishTime,
      externalUrl: body.externalUrl !== undefined ? body.externalUrl : article.externalUrl,
      status: body.status !== undefined ? body.status : article.status,
      sortOrder: body.sortOrder !== undefined ? parseInt(body.sortOrder, 10) : article.sortOrder
    });

    res.json({ code: 0, message: '更新成功', data: article });
  } catch (err) {
    console.error('[Article] update error:', err);
    res.status(500).json({ code: 1, message: '更新失败' });
  }
});

// 删除
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const article = await Article.findByPk(req.params.id);
    if (!article) return res.status(404).json({ code: 1, message: '资讯不存在' });
    await article.destroy();
    res.json({ code: 0, message: '删除成功' });
  } catch (err) {
    console.error('[Article] delete error:', err);
    res.status(500).json({ code: 1, message: '删除失败' });
  }
});

module.exports = router;
