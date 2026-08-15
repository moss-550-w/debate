const { request } = require('../../utils/request');
const { callFunction } = require('../../utils/cloud');

Page({
  data: {
    step: 1, // 1=选题, 2=生成中, 3=结果
    topics: [],
    topicNames: [],
    selectedTopicId: '',
    selectedTopicName: '',
    position: 'pro',
    result: null,
  },

  onLoad(options) {
    if (options.topicId) {
      this.setData({ selectedTopicId: options.topicId });
    }
    this.loadTopics();
  },

  async loadTopics() {
    try {
      const result = await callFunction('getTopicList', { page: 1, size: 50 });
      const topics = result.list || [];
      this.setData({
        topics,
        topicNames: topics.map(t => t.title),
      });
      // 如果从辩题列表进入，自动选中
      if (this.data.selectedTopicId) {
        const idx = topics.findIndex(t => t._id === this.data.selectedTopicId);
        if (idx >= 0) {
          this.setData({
            selectedTopicName: topics[idx].title,
          });
        }
      }
    } catch (err) {
      // 模拟数据
      const mockTopics = [
        { _id: '1', title: 'Should AI be used in education?', category: 'tech', difficulty: 'medium' },
        { _id: '2', title: 'Is recycling important?', category: 'environment', difficulty: 'easy' },
        { _id: '3', title: 'Should students have homework?', category: 'education', difficulty: 'easy' },
      ];
      this.setData({
        topics: mockTopics,
        topicNames: mockTopics.map(t => t.title),
      });
    }
  },

  onTopicChange(e) {
    const index = e.detail.value;
    const topic = this.data.topics[index];
    this.setData({
      selectedTopicId: topic._id,
      selectedTopicName: topic.title,
    });
  },

  selectPosition(e) {
    this.setData({ position: e.currentTarget.dataset.pos });
  },

  async startGenerate() {
    if (!this.data.selectedTopicId || !this.data.position) {
      wx.showToast({ title: '请选择辩题和立场', icon: 'none' });
      return;
    }

    this.setData({ step: 2 });

    try {
      const res = await request('/generate', {
        method: 'POST',
        data: {
          topic_id: this.data.selectedTopicId,
          position: this.data.position,
          user_role: 'pupil',
        },
      });

      if (res.code === 200) {
        this.setData({ result: res.data, step: 3 });
      } else {
        throw new Error(res.message);
      }
    } catch (err) {
      // 模拟数据兜底
      this.setData({
        result: {
          points: [
            { title: 'Benefit', sentence: 'This is good because it helps us learn.', translation: '这很好，因为它帮助我们学习。' },
            { title: 'Example', sentence: 'For example, many students improved their grades.', translation: '例如，许多学生提高了成绩。' },
          ],
          conclusion: 'In conclusion, we should support this idea.',
          full_text: 'This is good because it helps us learn. For example, many students improved their grades. In conclusion, we should support this idea.',
        },
        step: 3,
      });
    }
  },

  goSpeech() {
    wx.navigateTo({
      url: `/pages/speech/speech?text=${encodeURIComponent(this.data.result.full_text)}`,
    });
  },

  reset() {
    this.setData({
      step: 1,
      selectedTopicId: '',
      selectedTopicName: '',
      position: 'pro',
      result: null,
    });
  },
});