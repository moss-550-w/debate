const { request } = require('../../utils/request');

Page({
  data: {
    step: 1, // 1=选题, 2=生成中, 3=结果
    topics: [],
    topicNames: [],
    selectedTopicId: '',
    selectedTopicName: '',
    position: 'pro',
    positionLabel: '正方',
    result: null,
    chinaAdded: false,
  },

  onLoad(options) {
    if (options.topicId) {
      this.setData({ selectedTopicId: options.topicId });
    }
    if (options.topicTitle) {
      this.setData({ selectedTopicName: decodeURIComponent(options.topicTitle) });
    }
    this.loadTopics();
  },

  async loadTopics() {
    try {
      const res = await request('/topics?size=100');
      if (res.code === 200) {
        const topics = res.data.list || [];
        this.setData({
          topics,
          topicNames: topics.map(t => t.title),
        });
        // 如果从辩题列表进入且没有传标题，自动选中
        if (this.data.selectedTopicId && !this.data.selectedTopicName) {
          const idx = topics.findIndex(t => t._id === this.data.selectedTopicId);
          if (idx >= 0) {
            this.setData({
              selectedTopicName: topics[idx].title,
            });
          }
        }
      } else {
        throw new Error(res.message);
      }
    } catch (err) {
      console.error('加载辩题失败:', err);
      wx.showToast({ title: '加载辩题失败', icon: 'none' });
    }
  },

  onTopicChange(e) {
    const index = parseInt(e.detail.value);
    const topic = this.data.topics[index];
    if (topic) {
      this.setData({
        selectedTopicId: topic._id,
        selectedTopicName: topic.title,
      });
    }
  },

  selectPosition(e) {
    const pos = e.currentTarget.dataset.pos;
    this.setData({
      position: pos,
      positionLabel: pos === 'pro' ? '正方' : '反方',
    });
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
        timeout: 75000,
        data: {
          topic_id: this.data.selectedTopicId,
          topic_title: this.data.selectedTopicName,
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
      console.error('生成立论失败:', err);
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
      wx.showToast({ title: '使用示例数据', icon: 'none' });
    }
  },

  goSpeech() {
    if (!this.data.result || !this.data.result.full_text) {
      wx.showToast({ title: '还没有立论内容', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/speech/speech?text=${encodeURIComponent(this.data.result.full_text)}`,
    });
  },

  addChinaArgument() {
    const story = this.data.result && this.data.result.china_story;
    if (!story || !story.debate_argument || this.data.chinaAdded) return;

    this.setData({
      chinaAdded: true,
      result: {
        ...this.data.result,
        full_text: `${this.data.result.full_text} ${story.debate_argument}`,
      },
    });
    wx.showToast({ title: '已加入逐字稿', icon: 'success' });
  },

  goChinaSpeech() {
    const story = this.data.result && this.data.result.china_story;
    if (!story || !story.debate_argument) return;
    wx.navigateTo({
      url: `/pages/speech/speech?text=${encodeURIComponent(story.debate_argument)}`,
    });
  },

  reset() {
    this.setData({
      step: 1,
      selectedTopicId: '',
      selectedTopicName: '',
      position: 'pro',
      positionLabel: '正方',
      result: null,
      chinaAdded: false,
    });
  },
});
