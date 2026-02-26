/**
 * 客服页面
 */

Page({
  data: {
    // 客服配置（可以从后端获取，这里先写死）
    serviceConfig: {
      phone: '400-123-4567',
      wechat: 'MMBS_Service',
      email: 'service@mmbs.com',
      workTime: '周一至周日 9:00-18:00',
      address: '北京市朝阳区xxx街道xxx号'
    },
    // 常见问题
    faqs: [
      {
        id: 1,
        question: '如何下单？',
        answer: '选择商品后，点击"立即购买"或"加入购物车"，在购物车中点击"结算"进入订单确认页，填写收货信息后提交订单即可。'
      },
      {
        id: 2,
        question: '如何申请退货/换货？',
        answer: '未收货或已收货的订单，可在订单详情页点击「申请退货/换货」，填写退货原因后提交。如需换货，请在原因中说明，我们会按退货流程处理。'
      },
      {
        id: 3,
        question: '如何申请退款？',
        answer: '仅未发货或已取消的订单可在订单详情页点击「申请退款」并提交，商家审核后处理。退货成功由商家统一办理退款，无需再申请；换货不涉及退款。'
      },
      {
        id: 4,
        question: '如何查看佣金明细？',
        answer: '在"我的团队"页面，点击"佣金明细"按钮即可查看详细的佣金记录，包括收入、支出等信息。'
      },
      {
        id: 5,
        question: '如何提现佣金？',
        answer: '在"我的团队"页面，点击"佣金提现"按钮，填写提现信息（账户类型、账户号码等）后提交申请，等待审核即可。'
      },
      {
        id: 6,
        question: '订单什么时候发货？',
        answer: '订单支付成功后，我们会在1-3个工作日内安排发货，具体发货时间以订单详情页显示为准。'
      }
    ],
    expandedFaq: null // 当前展开的FAQ ID
  },

  onLoad() {
    // 可以在这里从后端获取客服配置
    // this.loadServiceConfig();
  },

  /**
   * 拨打客服电话
   */
  onCallPhone() {
    const phone = this.data.serviceConfig.phone;
    wx.makePhoneCall({
      phoneNumber: phone.replace(/-/g, ''),
      fail: (err) => {
        console.error('拨打电话失败:', err);
        wx.showToast({
          title: '无法拨打电话',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 复制客服微信
   */
  onCopyWechat() {
    const wechat = this.data.serviceConfig.wechat;
    wx.setClipboardData({
      data: wechat,
      success: () => {
        wx.showToast({
          title: '微信号已复制',
          icon: 'success'
        });
      }
    });
  },

  /**
   * 复制客服邮箱
   */
  onCopyEmail() {
    const email = this.data.serviceConfig.email;
    wx.setClipboardData({
      data: email,
      success: () => {
        wx.showToast({
          title: '邮箱已复制',
          icon: 'success'
        });
      }
    });
  },

  /**
   * 复制地址
   */
  onCopyAddress() {
    const address = this.data.serviceConfig.address;
    wx.setClipboardData({
      data: address,
      success: () => {
        wx.showToast({
          title: '地址已复制',
          icon: 'success'
        });
      }
    });
  },

  /**
   * 展开/收起FAQ
   */
  onToggleFaq(e) {
    const id = e.currentTarget.dataset.id;
    const expandedFaq = this.data.expandedFaq === id ? null : id;
    this.setData({ expandedFaq });
  },

  /**
   * 微信客服消息回调
   */
  onContact(e) {
    console.log('客服消息:', e.detail);
    // 可以在这里记录用户联系客服的行为
  }
});

