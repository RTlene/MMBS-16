/**
 * 文章详情页面
 */

const request = require('../../utils/request.js');
const { API, replaceUrlParams } = require('../../config/api.js');

Page({
  data: {
    articleId: null,
    article: null,
    loading: true,
    error: null
  },

  onLoad(options) {
    const { id } = options;
    if (!id) {
      wx.showToast({
        title: '文章ID缺失',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
      return;
    }

    this.setData({ articleId: id });
    this.loadArticle();
  },

  /**
   * 加载文章详情
   */
  async loadArticle() {
    try {
      this.setData({ loading: true, error: null });

      // 调用后端API获取文章详情
      const url = replaceUrlParams(API.ARTICLE.DETAIL, { id: this.data.articleId });
      const result = await request.get(url, {
        data: {}
      }, {
        needAuth: false,
        showLoading: false
      });

      if (result.code === 0 && result.data && result.data.article) {
        const article = result.data.article;
        
        // 格式化时间
        const formattedArticle = {
          ...article,
          publishTimeText: this.formatTime(article.publishTime)
        };
        
        // 如果有外部链接，验证链接格式
        if (formattedArticle.externalUrl) {
          // 确保链接是 HTTPS 协议
          if (!formattedArticle.externalUrl.startsWith('https://')) {
            console.warn('[Article] 外部链接必须是 HTTPS 协议');
            formattedArticle.externalUrl = null;
          }
        }
        
        this.setData({
          article: formattedArticle,
          loading: false
        });

        // 阅读数已在后端自动增加，无需额外调用
      } else {
        throw new Error(result.message || '文章不存在');
      }
    } catch (error) {
      console.error('[Article] 加载文章详情失败:', error);
      // 如果API调用失败，使用模拟数据作为降级方案
      try {
        const mockArticle = this.getMockArticle(this.data.articleId);
        if (mockArticle) {
          const formattedArticle = {
            ...mockArticle,
            publishTimeText: this.formatTime(mockArticle.publishTime)
          };
          
          if (formattedArticle.externalUrl && !formattedArticle.externalUrl.startsWith('https://')) {
            formattedArticle.externalUrl = null;
          }
          
          this.setData({
            article: formattedArticle,
            loading: false
          });
        } else {
          throw new Error('文章不存在');
        }
      } catch (fallbackError) {
        this.setData({
          loading: false,
          error: error.message || '加载失败，请稍后重试'
        });
      }
    }
  },

  /**
   * web-view 消息处理
   */
  onWebViewMessage(e) {
    console.log('[Article] web-view 消息:', e.detail.data);
    // 可以在这里处理来自 web-view 的消息
  },

  /**
   * 模拟文章详情数据（临时使用，实际应从后端获取）
   */
  getMockArticle(id) {
    const mockArticles = {
      1: {
        id: 1,
        title: '新品上市 | 春季限定款现已发售',
        content: `
          <p>亲爱的用户，我们很高兴地宣布，春季限定款商品现已正式发售！</p>
          <p>本次新品包含了多个系列，涵盖了服装、配饰、美妆等多个品类。每一件商品都经过精心设计，旨在为您带来最优质的购物体验。</p>
          <h3>新品亮点</h3>
          <ul>
            <li>全新设计理念，时尚与实用完美结合</li>
            <li>优质材料，确保产品的耐用性和舒适度</li>
            <li>限时优惠，现在购买享受超值折扣</li>
          </ul>
          <p>更多精彩内容，敬请期待！</p>
        `,
        coverImage: '',
        author: 'MMBS商城',
        publishTime: new Date().toISOString(),
        readCount: 1234,
        likeCount: 56,
        htmlContent: true,
        // externalUrl: 'https://mp.weixin.qq.com/s/xxxxx' // 示例：公众号文章链接
      },
      2: {
        id: 2,
        title: '购物攻略 | 如何选择适合的商品',
        content: `
          <p>在购物时，选择适合自己的商品是非常重要的。本文将为您提供一些实用的购物建议。</p>
          <h3>1. 明确需求</h3>
          <p>在购物前，首先要明确自己的需求。问问自己：我真的需要这个商品吗？它符合我的预算吗？</p>
          <h3>2. 比较价格</h3>
          <p>在多个平台上比较价格，确保您获得最优惠的价格。同时要注意商品的质量和售后服务。</p>
          <h3>3. 查看评价</h3>
          <p>阅读其他用户的评价，了解商品的实际使用体验。真实的评价可以帮助您做出更好的决策。</p>
          <p>希望这些建议能够帮助您更好地选择商品！</p>
        `,
        coverImage: '',
        author: 'MMBS商城',
        publishTime: new Date(Date.now() - 86400000).toISOString(),
        readCount: 2345,
        likeCount: 89,
        htmlContent: true,
        // externalUrl: 'https://mp.weixin.qq.com/s/xxxxx' // 示例：公众号文章链接
      },
      3: {
        id: 3,
        title: '会员权益 | 了解更多会员专享优惠',
        content: `
          <p>成为MMBS商城会员，享受更多专享优惠和特权！</p>
          <h3>会员权益</h3>
          <ul>
            <li>专享折扣：会员购买商品享受额外折扣</li>
            <li>生日特权：生日当月享受特殊优惠</li>
            <li>积分奖励：购物获得积分，积分可兑换商品</li>
            <li>优先配送：享受优先配送服务</li>
            <li>专属客服：会员专属客服支持</li>
          </ul>
          <h3>如何成为会员</h3>
          <p>注册账号即可成为普通会员。通过购物累积积分，可升级为高级会员，享受更多权益。</p>
          <p>立即注册，开启您的会员之旅吧！</p>
        `,
        coverImage: '',
        author: 'MMBS商城',
        publishTime: new Date(Date.now() - 172800000).toISOString(),
        readCount: 3456,
        likeCount: 123,
        htmlContent: true,
        // externalUrl: 'https://mp.weixin.qq.com/s/xxxxx' // 示例：公众号文章链接
      }
    };

    return mockArticles[id] || null;
  },

  /**
   * 增加阅读数
   */
  async incrementReadCount() {
    try {
      // TODO: 调用后端API增加阅读数
      // const url = replaceUrlParams(API.ARTICLE.INCREMENT_READ, { id: this.data.articleId });
      // await request.post(url);
    } catch (error) {
      console.error('[Article] 增加阅读数失败:', error);
    }
  },

  /**
   * 格式化时间
   */
  formatTime(time) {
    if (!time) return '';
    const date = new Date(time);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }
});

