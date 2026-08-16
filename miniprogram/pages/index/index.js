const { request } = require('../../utils/request');

const DIFFICULTY_LABELS = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
};

Page({
  data: {
    isLoggedIn: true,
    userInfo: {},
    hotTopics: [],
    currentAssignment: null,
  },

  onLoad() {
    this.loadUserInfo();
    this.loadHotTopics();
    this.loadCurrentAssignment();
  },

  onShow() {
    this.loadUserInfo();
  },

  loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo');
    const openid = wx.getStorageSync('openid');
    if (userInfo && openid) {
      this.setData({ isLoggedIn: true, userInfo });
      const app = getApp();
      app.globalData.openid = openid;
      app.globalData.userInfo = userInfo;
    } else {
      // 触发自动登录
      const app = getApp();
      app.autoLogin();
      this.setData({
        isLoggedIn: true,
        userInfo: app.globalData.userInfo,
      });
    }
  },

  async loadHotTopics() {
    try {
      const res = await request('/topics?size=5');
      if (res.code === 200) {
        const topics = (res.data.list || []).map(t => ({
          ...t,
          difficultyLabel: DIFFICULTY_LABELS[t.difficulty] || t.difficulty,
        }));
        this.setData({ hotTopics: topics });
      }
    } catch (err) {
      console.error('加载热门辩题失败:', err);
      this.setData({
        hotTopics: [
          { _id: '1', title: 'Should AI be used in education?', difficulty: 'medium', difficultyLabel: '中等' },
          { _id: '2', title: 'Is recycling important?', difficulty: 'easy', difficultyLabel: '简单' },
          { _id: '3', title: 'Should students have homework?', difficulty: 'easy', difficultyLabel: '简单' },
        ],
      });
    }
  },

  async loadCurrentAssignment() {
    try {
      const res = await request('/assignments/current');
      if (res.code === 200 && res.data && res.data.is_active) {
        this.setData({ currentAssignment: res.data });
      }
    } catch (err) {
      // ignore
    }
  },

  handleLogin() {
    wx.showToast({ title: '已自动登录', icon: 'success' });
  },

  goSpeech() {
    wx.switchTab({ url: '/pages/topic/topic' });
  },

  goPractice() {
    wx.navigateTo({ url: '/pages/practice/practice' });
  },

  goChinaPractice() {
    wx.navigateTo({
      url: '/pages/practice/practice?topicId=china_daily_001&topicTitle=Should%20traditional%20culture%20be%20adapted%20for%20modern%20life%3F',
    });
  },

  goProfile() {
    wx.switchTab({ url: '/pages/profile/profile' });
  },

  goTopicList() {
    wx.switchTab({ url: '/pages/topic/topic' });
  },

  goPortfolio() {
    wx.navigateTo({ url: '/pages/portfolio/portfolio' });
  },

  goSparring() {
    wx.navigateTo({ url: '/pages/sparring/sparring' });
  },

  goTournament() {
    wx.navigateTo({ url: '/pages/tournament/tournament' });
  },

  goTopicDetail(e) {
    const id = e.currentTarget.dataset.id;
    const title = e.currentTarget.dataset.title;
    wx.navigateTo({ url: `/pages/practice/practice?topicId=${id}&topicTitle=${encodeURIComponent(title)}` });
  },
});
