const request = require('../../../../utils/request');
const { API, replaceUrlParams } = require('../../../../config/api');

Component({
  data: {
    verificationCode: null,
    code: '',
    loading: false,
    showResult: false
  },

  methods: {
    // 调用摄像头扫码
    onScanCode() {
      wx.scanCode({
        onlyFromCamera: true,
        scanType: ['barCode', 'qrCode'],
        success: (res) => {
          const code = res.result;
          this.setData({ code });
          this.queryVerificationCode(code);
        },
        fail: (err) => {
          console.error('[Verification] 扫码失败:', err);
          if (err.errMsg && !err.errMsg.includes('cancel')) {
            wx.showToast({
              title: '扫码失败',
              icon: 'none'
            });
          }
        }
      });
    },

    // 手动输入核销码
    onCodeInput(e) {
      this.setData({ code: e.detail.value });
    },

    onQueryCode() {
      const { code } = this.data;
      if (!code) {
        wx.showToast({
          title: '请输入核销码',
          icon: 'none'
        });
        return;
      }
      this.queryVerificationCode(code);
    },

    async queryVerificationCode(code) {
      this.setData({ loading: true, showResult: false });

      try {
        const url = replaceUrlParams(API.STAFF.VERIFICATION_QUERY, { code });
        const res = await request.get(url, {}, {
          isStaff: true,
          needAuth: true,
          showLoading: false
        });

        if (res.code === 0) {
          this.setData({
            verificationCode: res.data.verificationCode,
            showResult: true
          });
        } else {
          wx.showToast({
            title: res.message || '查询失败',
            icon: 'none'
          });
        }
      } catch (error) {
        console.error('[Verification] 查询失败:', error);
        wx.showToast({
          title: '查询失败',
          icon: 'none'
        });
      } finally {
        this.setData({ loading: false });
      }
    },

    async onUseCode() {
      const { verificationCode } = this.data;

      if (!verificationCode) return;

      if (verificationCode.status === 'used') {
        wx.showToast({
          title: '核销码已被使用',
          icon: 'none'
        });
        return;
      }

      if (verificationCode.status === 'expired' || verificationCode.isExpired) {
        wx.showToast({
          title: '核销码已过期',
          icon: 'none'
        });
        return;
      }

      wx.showModal({
        title: '确认核销',
        content: `确定要核销核销码 ${verificationCode.code} 吗？`,
        success: async (res) => {
          if (res.confirm) {
            try {
              const url = replaceUrlParams(API.STAFF.VERIFICATION_USE, { id: verificationCode.id });
              const useRes = await request.put(url, {}, {
                isStaff: true,
                needAuth: true
              });

              if (useRes.code === 0) {
                wx.showToast({
                  title: '核销成功',
                  icon: 'success'
                });

                // 更新状态
                this.setData({
                  'verificationCode.status': 'used',
                  'verificationCode.statusText': '已使用',
                  'verificationCode.usedAt': new Date()
                });
              } else {
                wx.showToast({
                  title: useRes.message || '核销失败',
                  icon: 'none'
                });
              }
            } catch (error) {
              console.error('[Verification] 核销失败:', error);
              wx.showToast({
                title: '核销失败',
                icon: 'none'
              });
            }
          }
        }
      });
    },

    onReset() {
      this.setData({
        code: '',
        verificationCode: null,
        showResult: false
      });
    }
  }
});

