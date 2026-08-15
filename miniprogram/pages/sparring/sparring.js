const { request } = require('../../utils/request');

const OPPONENT_STYLES = {
  data_monster: {
    name: '数据狂魔型',
    icon: '📊',
    description: '擅长用数据、统计和事实案例攻击你的论点',
    color: '#10b981',
  },
  value_emotional: {
    name: '价值煽情型',
    icon: '❤️',
    description: '擅长从道德、价值观和情感层面打动听众',
    color: '#f59e0b',
  },
  logic_deconstruction: {
    name: '逻辑拆解型',
    icon: '🔍',
    description: '擅长拆解对方逻辑漏洞，寻找论证缺陷',
    color: '#8b5cf6',
  },
};

const TOPICS = [
  { id: '1', title: 'Should AI be used in education?' },
  { id: '2', title: 'Is recycling important?' },
  { id: '3', title: 'Should students have homework?' },
  { id: '4', title: 'Is social media good for society?' },
  { id: '5', title: 'Should zoos be banned?' },
];

Page({
  data: {
    step: 'select', // select | battle | result
    selectedStyle: null,
    selectedTopic: null,
    selectedTopicId: '', // 展平属性，供WXML比较用
    sessionId: '',
    opponent: { icon: '🤖', name: 'AI对手' },
    messages: [],
    userInput: '',
    stats: { effective_rebuttal_rate: 0, stall_count: 0, total_rounds: 0 },
    sending: false,
    battleStartTime: 0,
    lastUserMsgTime: 0,
    battleTopic: '', // 展平辩题标题
    OPPONENT_STYLES: OPPONENT_STYLES,
    TOPICS: TOPICS,
  },

  selectStyle(e) {
    const style = e.currentTarget.dataset.style;
    this.setData({ selectedStyle: style });
  },

  selectTopic(e) {
    const topic = e.currentTarget.dataset.topic;
    this.setData({ selectedTopic: topic, selectedTopicId: topic.id });
  },

  async startBattle() {
    if (!this.data.selectedStyle || !this.data.selectedTopic) {
      wx.showToast({ title: '请选择对手风格和辩题', icon: 'none' });
      return;
    }
    try {
      wx.showLoading({ title: '正在准备对练...' });
      const res = await request('/debate/start', {
        method: 'POST',
        data: {
          topic_id: this.data.selectedTopic.id,
          topic_title: this.data.selectedTopic.title,
          position: 'pro',
          opponent_style: this.data.selectedStyle,
        },
      });
      wx.hideLoading();
      if (res.code === 200) {
        const style = this.data.selectedStyle;
        const msgs = [{ role: 'ai', content: res.data.opening, style, styleName: OPPONENT_STYLES[style].name }];
        this.setData({
          step: 'battle',
          sessionId: res.data.session_id,
          opponent: { name: res.data.opponent.name, icon: res.data.opponent.icon },
          messages: msgs,
          stats: { effective_rebuttal_rate: 0, stall_count: 0, total_rounds: 1 },
          battleStartTime: Date.now(),
          lastUserMsgTime: Date.now(),
          battleTopic: this.data.selectedTopic.title,
        });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '开始对练失败', icon: 'none' });
    }
  },

  inputChange(e) {
    this.setData({ userInput: e.detail.value });
  },

  async sendMessage() {
    const msg = this.data.userInput.trim();
    if (!msg || this.data.sending) return;
    this.setData({ userInput: '', sending: true });

    const now = Date.now();
    const responseTimeMs = now - this.data.lastUserMsgTime;

    // 添加用户消息到界面
    const messages = [...this.data.messages, { role: 'user', content: msg }];
    this.setData({ messages });

    try {
      const res = await request('/debate', {
        method: 'POST',
        data: {
          topic_id: this.data.selectedTopic.id,
          topic_title: this.data.selectedTopic.title,
          position: 'pro',
          user_speech: msg,
          opponent_style: this.data.selectedStyle,
          session_id: this.data.sessionId,
          response_time_ms: responseTimeMs,
        },
      });
      if (res.code === 200) {
        const aiMsg = { role: 'ai', content: res.data.ai_reply, style: this.data.selectedStyle, styleName: OPPONENT_STYLES[this.data.selectedStyle].name };
        this.setData({
          messages: [...this.data.messages, aiMsg],
          stats: res.data.stats,
          lastUserMsgTime: now,
        });
      }
    } catch (err) {
      console.error('发送消息失败:', err);
      const style = this.data.selectedStyle;
      // 模拟回复
      const mockReply = this.getMockReply(msg, style);
      this.setData({
        messages: [...this.data.messages, { role: 'ai', content: mockReply, style, styleName: OPPONENT_STYLES[style].name, _mock: true }],
        stats: {
          ...this.data.stats,
          total_rounds: this.data.stats.total_rounds + 1,
        },
        lastUserMsgTime: now,
      });
    } finally {
      this.setData({ sending: false });
    }
  },

  getMockReply(userMsg, style) {
    const replies = {
      data_monster: [
        'Interesting point. According to studies, 78% of data shows the opposite. Let me provide specific statistics to support my claim.',
        'I see your argument. However, recent research from 2024 indicates that 62% of cases contradict your position.',
        'Let me cite some data. A meta-analysis of 50 studies found that your claim only holds up in 30% of scenarios.',
      ],
      value_emotional: [
        'I hear what you are saying, but think about the bigger picture. The real question is about our values as a society.',
        'While your logic seems sound, we must consider the human impact. Stories of real people show us a different truth.',
        'At the heart of this debate is a fundamental question about what kind of world we want to live in.',
      ],
      logic_deconstruction: [
        'I see a logical flaw in your argument. Your premise A does not necessarily lead to conclusion B. Let me explain the gap.',
        'Your argument commits a fallacy of false cause. The correlation you mentioned does not imply causation.',
        'Let me deconstruct your reasoning. You make three assumptions, none of which are properly justified.',
      ],
    };
    const styleReplies = replies[style] || replies.logic_focused;
    return styleReplies[Math.floor(Math.random() * styleReplies.length)];
  },

  endBattle() {
    this.setData({ step: 'result' });
  },

  restartBattle() {
    this.setData({
      step: 'select',
      selectedStyle: null,
      selectedTopic: null,
      selectedTopicId: '',
      sessionId: '',
      opponent: { icon: '🤖', name: 'AI对手' },
      messages: [],
      userInput: '',
      stats: { effective_rebuttal_rate: 0, stall_count: 0, total_rounds: 0 },
      sending: false,
      battleTopic: '',
    });
  },

  goBack() {
    wx.navigateBack();
  },
});