const { callFunction } = require('../../utils/cloud');

Page({
  data: {
    categories: ['全部', 'tech', 'environment', 'education', 'society'],
    difficulties: ['全部', 'easy', 'medium', 'hard'],
    currentCategory: '全部',
    currentDifficulty: '全部',
    topics: [],
    page: 1,
    hasMore: true,
    loading: false,
  },

  onLoad() {
    this.loadTopics();
  },

  async loadTopics() {
    if (this.data.loading) return;
    this.setData({ loading: true });

    try {
      const params = {
        page: this.data.page,
        size: 10,
      };
      if (this.data.currentCategory !== '全部') params.category = this.data.currentCategory;
      if (this.data.currentDifficulty !== '全部') params.difficulty = this.data.currentDifficulty;

      const result = await callFunction('getTopicList', params);
      const topics = result.list || [];

      this.setData({
        topics: this.data.page === 1 ? topics : [...this.data.topics, ...topics],
        hasMore: topics.length === 10,
      });
    } catch (err) {
      // 模拟数据
      const mockTopics = [
        { _id: '1', title: 'Should AI be used in education?', category: 'tech', difficulty: 'medium' },
        { _id: '2', title: 'Is recycling important for the environment?', category: 'environment', difficulty: 'easy' },
        { _id: '3', title: 'Should students have homework every day?', category: 'education', difficulty: 'easy' },
        { _id: '4', title: 'Is social media good for society?', category: 'society', difficulty: 'hard' },
      ];
      this.setData({ topics: mockTopics, hasMore: false });
    } finally {
      this.setData({ loading: false });
    }
  },

  onCategoryChange(e) {
    const index = e.detail.value;
    this.setData({
      currentCategory: this.data.categories[index],
      page: 1,
      topics: [],
    });
    this.loadTopics();
  },

  onDifficultyChange(e) {
    const index = e.detail.value;
    this.setData({
      currentDifficulty: this.data.difficulties[index],
      page: 1,
      topics: [],
    });
    this.loadTopics();
  },

  loadMore() {
    this.setData({ page: this.data.page + 1 });
    this.loadTopics();
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/practice/practice?topicId=${id}` });
  },
});