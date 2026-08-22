const chinaTopics = require('../../data/chinaTopics');
const { request } = require('../../utils/request');

Page({
  data: {
    topics: [],
    loading: true,
  },

  onLoad() {
    this.loadTopics();
  },

  async loadTopics() {
    try {
      const res = await request('/topics?category=china&size=500');
      if (res.code !== 200) throw new Error(res.message);
      const topics = res.data.list || [];
      this.setData({ topics: topics.length ? topics : chinaTopics });
    } catch (err) {
      console.warn('加载思辨中国辩题失败，使用本地题库:', err);
      this.setData({ topics: chinaTopics });
    } finally {
      this.setData({ loading: false });
    }
  },

  goPractice(e) {
    const { id, title } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/practice/practice?scope=china&topicId=${id}&topicTitle=${encodeURIComponent(title)}`,
    });
  },
});
