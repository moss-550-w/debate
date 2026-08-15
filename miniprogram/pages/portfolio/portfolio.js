const { request } = require('../../utils/request');

const CONTENT_TYPE_LABELS = {
  case: '完整论点',
  argument: '论点片段',
  mechanism: '机制分析',
  clash: '反驳思路',
  question: '未解问题',
};

const POSITION_LABELS = {
  pro: '正方',
  con: '反方',
};

Page({
  data: {
    records: [],
    styleAnalysis: null,
    // 展平后的分析数据，避免WXML中需要?.运算符
    analysisData: {
      styleLabel: '',
      styleDesc: '',
      strengthAreas: [],
      weaknessAreas: [],
      focusText: '',
      recommendedTasks: [],
      totalRecords: 0,
      avgScore: 0,
      practiceCount: 0,
    },
    showForm: false,
    filterType: '',
    loading: true,
    formData: {
      topic_id: '',
      topic_title: '',
      content_type: 'argument',
      title: '',
      content: '',
      position: 'pro',
    },
    contentTypes: Object.entries(CONTENT_TYPE_LABELS).map(([value, label]) => ({ value, label })),
    positions: [
      { value: 'pro', label: '正方' },
      { value: 'con', label: '反方' },
    ],
    activeTab: 'records',
  },

  onShow() {
    this.loadData();
  },

  async loadData() {
    this.setData({ loading: true });
    const userId = wx.getStorageSync('openid');
    try {
      const [listRes, analysisRes] = await Promise.all([
        request(`/portfolio/${userId}?size=50`),
        request(`/portfolio/${userId}/analysis`),
      ]);
      if (listRes.code === 200) {
        const records = (listRes.data.records || []).map(r => ({
          ...r,
          contentTypeLabel: CONTENT_TYPE_LABELS[r.content_type] || r.content_type,
          positionLabel: POSITION_LABELS[r.position] || r.position,
          recordScore: r.ai_feedback ? r.ai_feedback.judge_score : null,
          displayContent: (r.content || '').slice(0, 60),
          displayDate: (r.created_at || '').slice(0, 10),
          hasMoreContent: (r.content || '').length > 60,
        }));
        this.setData({ records });
      }
      if (analysisRes.code === 200 && analysisRes.data) {
        const sa = analysisRes.data;
        const byType = sa.stats && sa.stats.by_type ? sa.stats.by_type : {};
        const practiceCount = Object.values(byType).reduce((a, b) => a + (b || 0), 0);
        const analysisData = {
          styleLabel: sa.preferred_style ? sa.preferred_style.label : '分析中...',
          styleDesc: sa.preferred_style ? sa.preferred_style.description : '',
          strengthAreas: sa.strength_areas || [],
          weaknessAreas: sa.weakness_areas || [],
          focusText: sa.recommended_focus || '',
          recommendedTasks: sa.recommended_tasks || [],
          totalRecords: sa.stats ? sa.stats.total_records || 0 : 0,
          avgScore: sa.stats ? sa.stats.avg_score || 0 : 0,
          practiceCount: practiceCount,
        };
        this.setData({
          styleAnalysis: sa,
          analysisData: analysisData,
        });
      }
    } catch (err) {
      console.error('加载作品集失败:', err);
    } finally {
      this.setData({ loading: false });
    }
  },

  openForm() {
    this.setData({ showForm: true, formData: { topic_id: '', topic_title: '', content_type: 'argument', title: '', content: '', position: 'pro' } });
  },

  closeForm() {
    this.setData({ showForm: false });
  },

  inputChange(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ ['formData.' + field]: e.detail.value });
  },

  selectType(e) {
    this.setData({ ['formData.content_type']: e.currentTarget.dataset.value });
  },

  selectPosition(e) {
    this.setData({ ['formData.position']: e.currentTarget.dataset.value });
  },

  async submitRecord() {
    const fd = this.data.formData;
    if (!fd.title || !fd.content) {
      wx.showToast({ title: '请填写标题和内容', icon: 'none' });
      return;
    }
    try {
      wx.showLoading({ title: '提交中...' });
      const res = await request('/portfolio', {
        method: 'POST',
        data: fd,
      });
      wx.hideLoading();
      if (res.code === 200) {
        wx.showToast({ title: '提交成功', icon: 'success' });
        this.setData({ showForm: false });
        this.loadData();
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '提交失败', icon: 'none' });
    }
  },

  viewFeedback(e) {
    const record = e.currentTarget.dataset.record;
    if (!record.ai_feedback) {
      wx.showModal({ title: 'AI评委反馈', content: '暂无反馈', showCancel: false });
      return;
    }
    const fb = record.ai_feedback;
    const strengths = fb.strengths && Array.isArray(fb.strengths) ? fb.strengths.join('、') : '无';
    const weaknesses = fb.weaknesses && Array.isArray(fb.weaknesses) ? fb.weaknesses.join('、') : '无';
    const suggestions = fb.suggestions && Array.isArray(fb.suggestions) ? fb.suggestions.join('、') : '无';
    wx.showModal({
      title: 'AI评委反馈',
      content: `评分: ${fb.judge_score || '?'}/100\n\n${fb.judge_comment || ''}\n\n优势: ${strengths}\n待提升: ${weaknesses}\n建议: ${suggestions}`,
      showCancel: false,
    });
  },

  filterByType(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ filterType: type === this.data.filterType ? '' : type });
    this.loadData();
  },

  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  },

  goPractice() {
    wx.navigateTo({ url: '/pages/practice/practice' });
  },
});