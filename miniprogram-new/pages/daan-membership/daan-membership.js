/**
 * 达安细胞会员邀请页面
 */

Page({
  data: {
    // 公司介绍图片（占位区）
    introImage1: '',
    introImage2: '',
    
    // 二维码图片（占位区）- 两个
    qrCodeImage1: '',
    qrCodeImage2: ''
  },

  /**
   * 页面加载
   */
  onLoad(options) {
    console.log('[DaanMembership] 页面加载', options);
    
    // 可以在这里加载图片数据
    // this.loadImages();
  },

  /**
   * 页面显示
   */
  onShow() {
    console.log('[DaanMembership] 页面显示');
  },

  /**
   * 图片加载错误处理
   */
  onImageError1(e) {
    console.error('[DaanMembership] 图片1加载失败:', e);
    this.setData({ introImage1: '' });
  },

  onImageError2(e) {
    console.error('[DaanMembership] 图片2加载失败:', e);
    this.setData({ introImage2: '' });
  },

  onQrCodeError1(e) {
    console.error('[DaanMembership] 二维码1加载失败:', e);
    this.setData({ qrCodeImage1: '' });
  },

  onQrCodeError2(e) {
    console.error('[DaanMembership] 二维码2加载失败:', e);
    this.setData({ qrCodeImage2: '' });
  },

  /**
   * 点击电话
   */
  onPhoneTap() {
    const phone = '13202863949';
    wx.makePhoneCall({
      phoneNumber: phone,
      success: () => {
        console.log('[DaanMembership] 拨打电话成功');
      },
      fail: (err) => {
        console.error('[DaanMembership] 拨打电话失败:', err);
        wx.showToast({
          title: '拨打电话失败',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 分享
   */
  onShareAppMessage() {
    return {
      title: '达安生命 - 加入会员享受特权',
      path: '/pages/daan-membership/daan-membership',
      imageUrl: '' // 可以设置分享图片
    };
  }
});
