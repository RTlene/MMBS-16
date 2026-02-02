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
    loading: false
  },

  onLoad() {
    if (!auth.isLogin()) {
      auth.login().then(res => {
        if (res.success) {
          this.loadMemberInfo();
        } else {
          wx.navigateBack();
        }
      });
      return;
    }
    this.loadMemberInfo();
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
    const types = ['wechat', 'alipay', 'bank'];
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
        wx.showModal({
          title: '提示',
          content: '提现申请已提交，请等待审核',
          showCancel: false,
          success: () => {
            wx.navigateBack();
          }
        });
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

