const { request } = require('../../utils/request');

const CATEGORY_LABELS = {
  all: '全部',
  society: '社会',
  education: '教育',
  tech: '科技',
  environment: '环境',
};

const DIFFICULTY_LABELS = {
  all: '全部',
  easy: '简单',
  medium: '中等',
  hard: '困难',
};

Page({
  data: {
    categories: ['全部', '社会', '教育', '科技', '环境'],
    categoryKeys: ['all', 'society', 'education', 'tech', 'environment'],
    difficulties: ['全部', '简单', '中等', '困难'],
    difficultyKeys: ['all', 'easy', 'medium', 'hard'],
    currentCategory: '全部',
    currentCategoryKey: 'all',
    currentDifficulty: '全部',
    currentDifficultyKey: 'all',
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
        size: 20,
      };
      if (this.data.currentCategoryKey !== 'all') params.category = this.data.currentCategoryKey;
      if (this.data.currentDifficultyKey !== 'all') params.difficulty = this.data.currentDifficultyKey;

      const queryStr = Object.keys(params)
        .map(k => `${k}=${encodeURIComponent(params[k])}`)
        .join('&');

      const res = await request(`/topics?${queryStr}`);
      if (res.code === 200) {
        const topics = (res.data.list || []).map(t => ({
          ...t,
          categoryLabel: CATEGORY_LABELS[t.category] || t.category,
          difficultyLabel: DIFFICULTY_LABELS[t.difficulty] || t.difficulty,
        }));

        this.setData({
          topics: this.data.page === 1 ? topics : [...this.data.topics, ...topics],
          hasMore: topics.length === 20,
        });
      } else {
        throw new Error(res.message);
      }
    } catch (err) {
      console.error('加载辩题失败:', err);
      wx.showToast({ title: '加载辩题失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onCategoryChange(e) {
    const index = parseInt(e.detail.value);
    this.setData({
      currentCategory: this.data.categories[index],
      currentCategoryKey: this.data.categoryKeys[index],
      page: 1,
      topics: [],
      hasMore: true,
    });
    this.loadTopics();
  },

  onDifficultyChange(e) {
    const index = parseInt(e.detail.value);
    this.setData({
      currentDifficulty: this.data.difficulties[index],
      currentDifficultyKey: this.data.difficultyKeys[index],
      page: 1,
      topics: [],
      hasMore: true,
    });
    this.loadTopics();
  },

  loadMore() {
    if (!this.data.hasMore || this.data.loading) return;
    this.setData({ page: this.data.page + 1 });
    this.loadTopics();
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    const title = e.currentTarget.dataset.title;
    wx.navigateTo({ url: `/pages/practice/practice?topicId=${id}&topicTitle=${encodeURIComponent(title)}` });
  },
});
