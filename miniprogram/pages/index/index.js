const { callFunction } = require('../../utils/cloud');

Page({
  data: {
    isLoggedIn: false,
    userInfo: {},
    hotTopics: [],
  },

  onLoad() {
    this.checkLogin();
    this.loadHotTopics();
  },

  onShow() {
    this.checkLogin();
  },

  // 检查登录状态
  checkLogin() {
    const openid = wx.getStorageSync('openid');
    const userInfo = wx.getStorageSync('userInfo');
    if (openid && userInfo) {
      this.setData({
        isLoggedIn: true,
        userInfo,
      });
    }
  },

  // 登录
  async handleLogin() {
    wx.showLoading({ title: '登录中...' });
    try {
      const { code } = await wx.login();
      const result = await callFunction('userLogin', { code });

      wx.setStorageSync('openid', result.openid);
      wx.setStorageSync('token', result.openid);
      wx.setStorageSync('userInfo', result.user);

      this.setData({
        isLoggedIn: true,
        userInfo: result.user,
      });

      wx.showToast({ title: '登录成功' });
    } catch (err) {
      console.error('登录失败:', err);
      wx.showToast({ title: '登录失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // 加载热门辩题
  async loadHotTopics() {
    try {
      const result = await callFunction('getTopicList', { page: 1, size: 5 });
      this.setData({ hotTopics: result.list });
    } catch (err) {
      // 模拟数据
      this.setData({
        hotTopics: [
          { _id: '1', title: 'AI in Education', difficulty: 'medium' },
          { _id: '2', title: 'Recycling', difficulty: 'easy' },
          { _id: '3', title: 'Homework', difficulty: 'easy' },
        ],
      });
    }
  },

  goSpeech() {
    if (!this.data.isLoggedIn) return this.showLoginTip();
    wx.navigateTo({ url: '/pages/speech/speech' });
  },

  goPractice() {
    if (!this.data.isLoggedIn) return this.showLoginTip();
    wx.navigateTo({ url: '/pages/practice/practice' });
  },

  goProfile() {
    if (!this.data.isLoggedIn) return this.showLoginTip();
    wx.navigateTo({ url: '/pages/profile/profile' });
  },

  goTopicDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/topic/topic?id=${id}` });
  },

  showLoginTip() {
    wx.showToast({ title: '请先登录', icon: 'none' });
  },
});