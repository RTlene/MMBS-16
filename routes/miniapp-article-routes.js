const express = require('express');
const { Op } = require('sequelize');
const { Article, sequelize } = require('../db');
const { authenticateMiniappUser, optionalAuthenticate } = require('../middleware/miniapp-auth');
const router = express.Router();

// 获取文章列表
router.get('/articles', optionalAuthenticate, async (req, res) => {
    try {
        const { page = 1, limit = 20, status = 'published' } = req.query;
        const offset = (page - 1) * limit;
        const now = new Date();

        const where = {
            status: status === 'all' ? { [Op.in]: ['published', 'draft'] } : status
        };

        // 只显示已发布的文章
        if (status === 'published') {
            where.publishTime = { [Op.lte]: now };
        }

        const { count, rows } = await Article.findAndCountAll({
            where,
            order: [['publishTime', 'DESC'], ['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset),
            attributes: [
                'id',
                'title',
                'summary',
                'coverImage',
                'author',
                'publishTime',
                'readCount',
                'likeCount',
                'externalUrl',
                'status',
                'createdAt'
            ]
        });

        const articles = rows.map(article => ({
            id: article.id,
            title: article.title,
            summary: article.summary || '',
            coverImage: article.coverImage || '',
            author: article.author || 'MMBS商城',
            publishTime: article.publishTime,
            readCount: article.readCount || 0,
            likeCount: article.likeCount || 0,
            externalUrl: article.externalUrl || null,
            hasExternalUrl: !!article.externalUrl
        }));

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                articles,
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                hasMore: offset + rows.length < count
            }
        });
    } catch (error) {
        console.error('[MiniappArticle] 获取文章列表失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取文章列表失败',
            error: error.message
        });
    }
});

// 获取文章详情
router.get('/articles/:id', optionalAuthenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const now = new Date();

        const article = await Article.findOne({
            where: {
                id: parseInt(id),
                status: 'published',
                publishTime: { [Op.lte]: now }
            }
        });

        if (!article) {
            return res.status(404).json({
                code: 1,
                message: '文章不存在或未发布'
            });
        }

        // 增加阅读数
        await article.increment('readCount', { by: 1 });

        const articleData = {
            id: article.id,
            title: article.title,
            summary: article.summary || '',
            content: article.content || '',
            coverImage: article.coverImage || '',
            author: article.author || 'MMBS商城',
            publishTime: article.publishTime,
            readCount: (article.readCount || 0) + 1,
            likeCount: article.likeCount || 0,
            externalUrl: article.externalUrl || null,
            hasExternalUrl: !!article.externalUrl,
            htmlContent: !!article.content && article.content.includes('<')
        };

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                article: articleData
            }
        });
    } catch (error) {
        console.error('[MiniappArticle] 获取文章详情失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取文章详情失败',
            error: error.message
        });
    }
});

// 增加阅读数（可选，因为详情接口已经自动增加）
router.post('/articles/:id/read', optionalAuthenticate, async (req, res) => {
    try {
        const { id } = req.params;

        const article = await Article.findByPk(parseInt(id));
        if (!article) {
            return res.status(404).json({
                code: 1,
                message: '文章不存在'
            });
        }

        await article.increment('readCount', { by: 1 });

        res.json({
            code: 0,
            message: '操作成功'
        });
    } catch (error) {
        console.error('[MiniappArticle] 增加阅读数失败:', error);
        res.status(500).json({
            code: 1,
            message: '操作失败',
            error: error.message
        });
    }
});

module.exports = router;

