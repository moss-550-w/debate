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
    comments: [],
    commentsLoading: false,
    commentContent: '',
    commentSubmitting: false,
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
    const payload = {
      ...fd,
      topic_id: (fd.topic_id || '').trim() || 'general',
      topic_title: (fd.topic_title || '').trim() || '自主思考',
      title: (fd.title || '').trim(),
      content: (fd.content || '').trim(),
    };
    if (!payload.title || !payload.content) {
      wx.showToast({ title: '请填写标题和内容', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      const res = await request('/portfolio', {
        method: 'POST',
        data: payload,
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
    this.setData({
      showFeedback: true,
      currentRecord: expanded,
      comments: [],
      commentContent: '',
    });
    this.loadComments(record._id);
  },

  closeFeedback() {
    this.setData({
      showFeedback: false,
      currentRecord: null,
      comments: [],
      commentContent: '',
    });
  },

  async loadComments(recordId) {
    if (!recordId) return;
    this.setData({ commentsLoading: true });
    try {
      const res = await request(`/comments/${recordId}`);
      if (res.code === 200 && res.data) {
        const comments = (res.data.comments || []).map(comment => ({
          ...comment,
          displayDate: (comment.created_at || '').replace('T', ' ').slice(0, 16),
        }));
        this.setData({ comments });
      }
    } catch (error) {
      console.error('加载作品评论失败:', error);
    } finally {
      this.setData({ commentsLoading: false });
    }
  },

  commentInputChange(e) {
    this.setData({ commentContent: e.detail.value });
  },

  async submitComment() {
    const record = this.data.currentRecord;
    const content = (this.data.commentContent || '').trim();
    if (!record || !content || this.data.commentSubmitting) return;

    this.setData({ commentSubmitting: true });
    try {
      const res = await request('/comments', {
        method: 'POST',
        data: {
          record_id: record._id,
          content,
          comment_type: 'peer',
        },
      });
      if (res.code === 200 && res.data) {
        const comment = {
          ...res.data,
          displayDate: (res.data.created_at || '').replace('T', ' ').slice(0, 16),
        };
        this.setData({
          comments: [...this.data.comments, comment],
          commentContent: '',
        });
        wx.showToast({ title: '评论已发布', icon: 'success' });
      } else {
        wx.showToast({ title: res.message || '评论发布失败', icon: 'none' });
      }
    } catch (error) {
      console.error('提交作品评论失败:', error);
      wx.showToast({ title: '评论发布失败', icon: 'none' });
    } finally {
      this.setData({ commentSubmitting: false });
    }
  },

  exportRecord() {
    const record = this.data.currentRecord;
    if (!record) return;
    const feedback = record.ai_feedback || {};
    const suggestions = Array.isArray(feedback.suggestions)
      ? feedback.suggestions.join('\n- ')
      : feedback.suggestion || '';
    const exportText = [
      '英语辩论作品集',
      `标题：${record.title}`,
      `辩题：${record.topic_title || '自主思考'}`,
      `立场：${record.positionLabel || ''}`,
      `类型：${record.contentTypeLabel || ''}`,
      `评分：${record.recordScore != null ? `${record.recordScore}/100` : '待评价'}`,
      '',
      '我的思考：',
      record.content || '',
      feedback.judge_comment ? `\nAI 评语：\n${feedback.judge_comment}` : '',
      suggestions ? `\n改进建议：\n- ${suggestions}` : '',
    ].filter(Boolean).join('\n');

    wx.setClipboardData({
      data: exportText,
      success: () => wx.showToast({ title: '已复制，可直接分享', icon: 'success' }),
      fail: () => wx.showToast({ title: '导出失败，请重试', icon: 'none' }),
    });
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
