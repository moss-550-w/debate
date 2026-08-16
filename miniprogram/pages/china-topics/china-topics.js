const chinaTopics = require('../../data/chinaTopics');

Page({
  data: {
    topics: chinaTopics,
  },

  goPractice(e) {
    const { id, title } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/practice/practice?scope=china&topicId=${id}&topicTitle=${encodeURIComponent(title)}`,
    });
  },
});
