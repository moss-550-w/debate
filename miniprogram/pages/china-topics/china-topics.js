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
      const pageSize = 100;
      const first = await request(`/topics?category=china&page=1&size=${pageSize}`);
      if (first.code !== 200) throw new Error(first.message);

      const total = Number(first.data.total) || 0;
      const topics = [...(first.data.list || [])];
      const totalPages = Math.ceil(total / pageSize);
      for (let page = 2; page <= totalPages; page += 1) {
        const res = await request(`/topics?category=china&page=${page}&size=${pageSize}`);
        if (res.code !== 200) throw new Error(res.message);
        topics.push(...(res.data.list || []));
      }

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
