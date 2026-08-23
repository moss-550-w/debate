const PRIVACY_VERSION = '2026-08-23';

Page({
  data: { readAgreement: false, submitting: false },

  onAgreementChange(e) {
    const value = e && e.detail ? e.detail.value : [];
    const values = Array.isArray(value) ? value : [value];
    this.setData({ readAgreement: values.includes('agree') });
  },

  openPolicy(e) {
    wx.navigateTo({ url: `/pages/privacy/detail?type=${e.currentTarget.dataset.type}` });
  },

  agreeAndContinue() {
    if (!this.data.readAgreement) {
      wx.showToast({ title: '请勾选同意协议后继续', icon: 'none' });
      return;
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    const finish = () => {
      wx.setStorageSync('privacy_agreed_version', PRIVACY_VERSION);
      wx.setStorageSync('privacy_agreed_at', new Date().toISOString());
      const app = getApp();
      app.startUserSession().catch(err => console.error('用户资料同步失败:', err));
      wx.reLaunch({ url: '/pages/index/index' });
    };
    if (typeof wx.requirePrivacyAuthorize !== 'function') {
      finish();
      return;
    }
    wx.requirePrivacyAuthorize({
      success: finish,
      fail: err => {
        console.error('隐私授权失败:', err);
        this.setData({ submitting: false });
        wx.showToast({ title: '需要同意隐私保护指引后才能继续', icon: 'none' });
      },
    });
  },
});
