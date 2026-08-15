const { request } = require('../../utils/request');

Page({
  data: {
    baseline: { pronunciation: 0, fluency: 0, logic: 0, vocabulary: 0, reaction: 0 },
    latest: { pronunciation: 0, fluency: 0, logic: 0, vocabulary: 0, reaction: 0 },
    stats: {
      totalCount: 0,
      totalDuration: 0,
      avgScore: 0,
      daysActive: 0,
    },
    history: [],
  },

  onShow() {
    this.loadGrowthData();
  },

  async loadGrowthData() {
    const openid = wx.getStorageSync('openid');
    if (!openid) return;

    try {
      const res = await request(`/growth/${openid}`);
      if (res.code === 200) {
        const data = res.data;
        this.setData({
          baseline: data.baseline,
          latest: data.latest,
          history: data.history || [],
          stats: {
            totalCount: data.stats.totalCount,
            totalDuration: data.stats.totalDuration,
            avgScore: Math.round(
              (data.latest.pronunciation + data.latest.fluency + data.latest.logic) / 3
            ),
            daysActive: Math.min(data.history.length, 30),
          },
        });
      }
    } catch (err) {
      // 模拟数据
      this.setData({
        baseline: { pronunciation: 55, fluency: 50, logic: 45, vocabulary: 60, reaction: 40 },
        latest: { pronunciation: 78, fluency: 72, logic: 68, vocabulary: 80, reaction: 70 },
        history: [
          { _id: '1', type: 'argument', score: { overall: 75 }, created_at: '2026-08-14T10:00:00Z' },
          { _id: '2', type: 'speech', score: { pronunciation: 82 }, created_at: '2026-08-13T15:30:00Z' },
          { _id: '3', type: 'argument', score: { overall: 70 }, created_at: '2026-08-12T09:00:00Z' },
        ],
        stats: { totalCount: 15, totalDuration: 1800, avgScore: 76, daysActive: 7 },
      });
    }
  },

  formatDate(dateStr) {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  },
});