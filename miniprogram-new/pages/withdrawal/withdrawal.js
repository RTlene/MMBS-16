const request = require('../../utils/request');
const { API, replaceUrlParams } = require('../../config/api');
const auth = require('../../utils/auth');

Page({
  data: {
    availableCommission: 0,
    form: {
      amount: '',
      accountType: 'wechat',
      accountName: '',
      accountNumber: '',
      bankName: '',
      bankBranch: '',
      remark: ''
    },
    loading: false,
    withdrawalList: [],
    loadingList: false
  },

  onLoad() {
    if (!auth.isLogin()) {
      auth.login().then(res => {
        if (res.success) {
          this.loadMemberInfo();
          this.loadWithdrawalList();
        } else {
          wx.navigateBack();
        }
      });
      return;
    }
    this.loadMemberInfo();
    this.loadWithdrawalList();
  },

  onShow() {
    if (auth.isLogin()) {
      this.loadWithdrawalList();
    }
  },

  async loadWithdrawalList() {
    if (this.data.loadingList) return;
    this.setData({ loadingList: true });
    try {
      const res = await request.get(API.WITHDRAWAL.LIST, { data: { page: 1, limit: 20 } }, { needAuth: true, showLoading: false });
      if (res.code === 0) {
        const list = (res.data.withdrawals || []).map(item => ({
          ...item,
          createdAtText: item.createdAt ? this.formatTime(item.createdAt) : ''
        }));
        this.setData({
          withdrawalList: list,
          loadingList: false
        });
      } else {
        this.setData({ loadingList: false });
      }
    } catch (e) {
      this.setData({ loadingList: false });
    }
  },

  statusText(s) {
    const map = { pending: '待审核', approved: '已通过', rejected: '已拒绝', processing: '处理中', completed: '已完成', cancelled: '已取消' };
    return map[s] || s;
  },

  formatTime(time) {
    if (!time) return '';
    const date = new Date(time);
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const h = date.getHours();
    const min = date.getMinutes();
    return `${date.getFullYear()}-${m < 10 ? '0' + m : m}-${d < 10 ? '0' + d : d} ${h < 10 ? '0' + h : h}:${min < 10 ? '0' + min : min}`;
  },

  async onConfirmReceipt(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    if (typeof wx.requestMerchantTransfer !== 'function') {
      wx.showToast({ title: '当前微信版本不支持，请升级后重试', icon: 'none' });
      return;
    }
    try {
      const res = await request.get(replaceUrlParams(API.WITHDRAWAL.DETAIL, { id }), {}, { needAuth: true, showLoading: true });
      if (res.code !== 0 || !res.data || !res.data.withdrawal) {
        wx.showToast({ title: res.message || '获取失败', icon: 'none' });
        return;
      }
      const w = res.data.withdrawal;
      if (!w.needConfirmReceipt || !w.transferPackage || !w.wxAppId || !w.wxMchId) {
        wx.showToast({ title: '该笔无需确认或已过期', icon: 'none' });
        return;
      }
      wx.requestMerchantTransfer({
        mchId: w.wxMchId,
        appId: w.wxAppId,
        package: w.transferPackage,
        success: () => {
          wx.showToast({ title: '已确认收款', icon: 'success' });
          this.loadWithdrawalList();
        },
        fail: (err) => {
          wx.showToast({ title: err.errMsg || '调起失败，请稍后重试', icon: 'none' });
        }
      });
    } catch (err) {
      wx.showToast({ title: err.message || '网络错误', icon: 'none' });
    }
  },

  /**
   * 加载会员信息
   */
  async loadMemberInfo() {
    try {
      const res = await request.get(API.MEMBER.PROFILE, {}, { needAuth: true, showLoading: false });
      if (res.code === 0 && res.data && res.data.member) {
        this.setData({
          availableCommission: parseFloat(res.data.member.availableCommission || 0)
        });
      }
    } catch (err) {
      console.warn('[Withdrawal] loadMemberInfo fail', err);
    }
  },

  /**
   * 输入提现金额
   */
  onAmountInput(e) {
    const value = e.detail.value;
    this.setData({
      'form.amount': value
    });
  },

  /**
   * 选择全部
   */
  onSelectAll() {
    this.setData({
      'form.amount': this.data.availableCommission.toFixed(2)
    });
  },

  /**
   * 选择账户类型
   */
  onAccountTypeChange(e) {
    const index = parseInt(e.detail.value);
    const types = ['wechat', 'bank'];
    const type = types[index];
    this.setData({
      'form.accountType': type,
      'form.bankName': '',
      'form.bankBranch': ''
    });
  },

  /**
   * 输入账户姓名
   */
  onAccountNameInput(e) {
    this.setData({
      'form.accountName': e.detail.value
    });
  },

  /**
   * 输入账户号码
   */
  onAccountNumberInput(e) {
    this.setData({
      'form.accountNumber': e.detail.value
    });
  },

  /**
   * 输入银行名称
   */
  onBankNameInput(e) {
    this.setData({
      'form.bankName': e.detail.value
    });
  },

  /**
   * 输入开户行
   */
  onBankBranchInput(e) {
    this.setData({
      'form.bankBranch': e.detail.value
    });
  },

  /**
   * 输入备注
   */
  onRemarkInput(e) {
    this.setData({
      'form.remark': e.detail.value
    });
  },

  /**
   * 提交提现申请
   */
  async onSubmit() {
    if (this.data.loading) return;

    const { form, availableCommission } = this.data;

    // 验证
    if (!form.amount || parseFloat(form.amount) <= 0) {
      wx.showToast({ title: '请输入提现金额', icon: 'none' });
      return;
    }

    const amount = parseFloat(form.amount);
    if (amount > availableCommission) {
      wx.showToast({ title: '可用佣金不足', icon: 'none' });
      return;
    }

    if (amount < 10) {
      wx.showToast({ title: '最小提现金额为¥10', icon: 'none' });
      return;
    }

    if (!form.accountName || !form.accountName.trim()) {
      wx.showToast({ title: '请输入账户姓名', icon: 'none' });
      return;
    }

    if (!form.accountNumber || !form.accountNumber.trim()) {
      wx.showToast({ title: '请输入账户号码', icon: 'none' });
      return;
    }

    if (form.accountType === 'bank' && (!form.bankName || !form.bankName.trim())) {
      wx.showToast({ title: '请输入银行名称', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    try {
      const res = await request.post(API.WITHDRAWAL.CREATE, {
        amount: amount,
        accountType: form.accountType,
        accountName: form.accountName.trim(),
        accountNumber: form.accountNumber.trim(),
        bankName: form.bankName ? form.bankName.trim() : '',
        bankBranch: form.bankBranch ? form.bankBranch.trim() : '',
        remark: form.remark ? form.remark.trim() : ''
      }, { needAuth: true });

      if (res.code === 0) {
        const content = res.message || '提现申请已提交，请等待审核';
        const data = res.data || {};
        // 升级版商家转账：需用户在小程序内确认收款才会到账，调起微信确认收款页
        if (data.needConfirmReceipt && data.transferPackage && data.wxAppId && data.wxMchId && typeof wx.requestMerchantTransfer === 'function') {
          wx.requestMerchantTransfer({
            mchId: data.wxMchId,
            appId: data.wxAppId,
            package: data.transferPackage,
            success: () => {
              wx.showModal({
                title: '提示',
                content: '已确认收款，款项将打至微信零钱',
                showCancel: false,
                success: () => { wx.navigateBack(); }
              });
            },
            fail: (err) => {
              wx.showModal({
                title: '提示',
                content: (content + '\n\n若未弹出收款页，可在「微信-支付」中查看待确认的转账，或稍后重试。').trim(),
                showCancel: false,
                success: () => { wx.navigateBack(); }
              });
            }
          });
        } else {
          wx.showModal({
            title: '提示',
            content: content,
            showCancel: false,
            success: () => {
              wx.navigateBack();
            }
          });
        }
      } else {
        wx.showToast({ title: res.message || '提交失败', icon: 'none' });
      }
    } catch (err) {
      console.error('[Withdrawal] submit fail', err);
      wx.showToast({ title: err.message || '提交失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  }
});

