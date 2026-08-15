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
    showFeedback: false,
    currentRecord: null,
    filterType: '',
    loading: true,
    submitting: false,
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
    this.setData({ submitting: true });
    try {
      const res = await request('/portfolio', {
        method: 'POST',
        data: fd,
      });
      this.setData({ submitting: false });
      if (res.code === 200) {
        wx.showToast({ title: '提交成功', icon: 'success' });
        this.setData({ showForm: false });
        this.loadData();
      } else {
        wx.showToast({ title: (res && res.message) || '提交失败', icon: 'none' });
      }
    } catch (err) {
      this.setData({ submitting: false });
      wx.showToast({ title: '提交失败', icon: 'none' });
    }
  },

  _expandFeedback(record) {
    const fb = record.ai_feedback;
    const r = Object.assign({}, record);
    if (!fb) {
      r.aiFeedbackStrengths = [];
      r.aiFeedbackWeaknesses = [];
      r.aiFeedbackDims = [];
      return r;
    }
    r.aiFeedbackStrengths = fb.strengths && fb.strengths.length ? fb.strengths : ['暂无'];
    r.aiFeedbackWeaknesses = fb.weaknesses && fb.weaknesses.length ? fb.weaknesses : ['暂无'];
    const dimsRaw = fb.dimensions || {};
    const dimLabels = [
      { key: 'logic', name: '逻辑性' },
      { key: 'evidence', name: '论据' },
      { key: 'expression', name: '表达' },
      { key: 'structure', name: '结构' },
      { key: 'creativity', name: '创意' },
    ];
    r.aiFeedbackDims = dimLabels.map(d => {
      const s = dimsRaw[d.key] != null ? Number(dimsRaw[d.key]) : 15;
      return { name: d.name, score: Math.min(20, Math.max(0, s)), percent: Math.min(100, s * 5) };
    });
    return r;
  },

  viewFeedback(e) {
    const record = e.currentTarget.dataset.record;
    if (!record) return;
    const expanded = this._expandFeedback(record);
    this.setData({ showFeedback: true, currentRecord: expanded });
  },

  closeFeedback() {
    this.setData({ showFeedback: false, currentRecord: null });
  },

  preventDefault() {
    // 遮罩捕获触摸滚动
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