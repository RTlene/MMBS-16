/**
 * 文章列表页面
 */

const request = require('../../utils/request.js');
const { API, replaceUrlParams } = require('../../config/api.js');

Page({
  data: {
    articles: [],
    page: 1,
    limit: 20,
    hasMore: true,
    loading: false,
    refreshing: false
  },

  onLoad(options) {
    // 使用 try-catch 包裹，确保不会阻塞页面初始化
    try {
      this.loadArticles(true).catch(err => {
        console.error('[Articles] onLoad 加载失败:', err);
      });
    } catch (err) {
      console.error('[Articles] onLoad 异常:', err);
    }
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.setData({
      page: 1,
      articles: [],
      hasMore: true,
      refreshing: true
    });
    this.loadArticles(true).then(() => {
      wx.stopPullDownRefresh();
      this.setData({ refreshing: false });
    }).catch(err => {
      console.error('[Articles] 下拉刷新失败:', err);
      wx.stopPullDownRefresh();
      this.setData({ refreshing: false });
    });
  },

  /**
   * 上拉加载更多
   */
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadArticles(false).catch(err => {
        console.error('[Articles] 加载更多失败:', err);
      });
    }
  },

  /**
   * 加载文章列表
   */
  async loadArticles(refresh = false) {
    if (this.data.loading) return;

    try {
      this.setData({ loading: true });

      const page = refresh ? 1 : this.data.page;
      const limit = this.data.limit;

      // 调用后端API获取文章列表
      const result = await request.get(API.ARTICLE.LIST, {
        data: {
          page,
          limit,
          status: 'published'
        }
      }, {
        needAuth: false,
        showLoading: false
      });

      if (result.code === 0 && result.data) {
        const articles = result.data.articles || [];
        const hasMore = result.data.hasMore !== false;

        // 格式化时间
        const formattedArticles = articles.map(article => {
          try {
            return {
              ...article,
              publishTimeText: this.formatTime(article.publishTime)
            };
          } catch (e) {
            console.error('[Articles] 格式化时间失败:', e);
            return {
              ...article,
              publishTimeText: ''
            };
          }
        });

        const newArticles = refresh ? formattedArticles : [...this.data.articles, ...formattedArticles];

        this.setData({
          articles: newArticles,
          page: page + 1,
          hasMore,
          loading: false
        });
      } else {
        throw new Error(result.message || '获取文章列表失败');
      }
    } catch (error) {
      console.error('[Articles] 加载文章列表失败:', error);
      // 如果API调用失败，使用模拟数据作为降级方案
      try {
        const mockArticles = this.getMockArticles(refresh ? 1 : this.data.page, this.data.limit);
        const formattedArticles = mockArticles.map(article => ({
          ...article,
          publishTimeText: this.formatTime(article.publishTime)
        }));
        const newArticles = refresh ? formattedArticles : [...this.data.articles, ...formattedArticles];
        const hasMore = mockArticles.length >= this.data.limit;

        this.setData({
          articles: newArticles,
          page: (refresh ? 1 : this.data.page) + 1,
          hasMore,
          loading: false
        });
      } catch (fallbackError) {
        console.error('[Articles] 降级方案也失败:', fallbackError);
        this.setData({ 
          loading: false,
          articles: refresh ? [] : this.data.articles
        });
      }
    }
  },

  /**
   * 模拟文章数据（临时使用，实际应从后端获取）
   */
  getMockArticles(page, limit) {
    const allMockArticles = [
      {
        id: 1,
        title: '新品上市 | 春季限定款现已发售',
        summary: '春季新品隆重上市，多款限定商品等你来选...',
        coverImage: '',
        author: 'MMBS商城',
        publishTime: new Date().toISOString(),
        readCount: 1234,
        likeCount: 56,
        // externalUrl: 'https://mp.weixin.qq.com/s/xxxxx' // 示例：公众号文章链接
      },
      {
        id: 2,
        title: '购物攻略 | 如何选择适合的商品',
        summary: '详细的购物指南，帮助您选择最适合的商品...',
        coverImage: '',
        author: 'MMBS商城',
        publishTime: new Date(Date.now() - 86400000).toISOString(),
        readCount: 2345,
        likeCount: 89,
        // externalUrl: 'https://mp.weixin.qq.com/s/xxxxx' // 示例：公众号文章链接
      },
      {
        id: 3,
        title: '会员权益 | 了解更多会员专享优惠',
        summary: '成为会员，享受更多专享优惠和特权...',
        coverImage: '',
        author: 'MMBS商城',
        publishTime: new Date(Date.now() - 172800000).toISOString(),
        readCount: 3456,
        likeCount: 123,
        // externalUrl: 'https://mp.weixin.qq.com/s/xxxxx' // 示例：公众号文章链接
      }
    ];

    const start = (page - 1) * limit;
    const end = start + limit;
    return allMockArticles.slice(start, end);
  },

  /**
   * 跳转到文章详情
   */
  onArticleTap(e) {
    try {
      const { article } = e.currentTarget.dataset;
      if (!article || !article.id) return;

      wx.navigateTo({
        url: `/pages/article/article?id=${article.id}`
      });
    } catch (err) {
      console.error('[Articles] 跳转失败:', err);
    }
  },

  /**
   * 格式化时间
   */
  formatTime(time) {
    if (!time) return '';
    try {
      const date = new Date(time);
      const now = new Date();
      const diff = now - date;

      if (diff < 60000) {
        return '刚刚';
      } else if (diff < 3600000) {
        return `${Math.floor(diff / 60000)}分钟前`;
      } else if (diff < 86400000) {
        return `${Math.floor(diff / 3600000)}小时前`;
      } else if (diff < 604800000) {
        return `${Math.floor(diff / 86400000)}天前`;
      } else {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    } catch (e) {
      console.error('[Articles] formatTime 错误:', e);
      return '';
    }
  }
});
