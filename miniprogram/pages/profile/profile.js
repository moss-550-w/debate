const { request } = require('../../utils/request');

const INDICATORS = [
  { name: '论点结构', key: 'argument_structure', max: 100 },
  { name: '论据质量', key: 'evidence_quality', max: 100 },
  { name: '逻辑推理', key: 'logic', max: 100 },
  { name: '反驳回应', key: 'rebuttal', max: 100 },
  { name: '表达组织', key: 'expression', max: 100 },
];

const EMPTY_DEBATE = {
  hasData: false,
  overall: 0,
  dimensionLabels: INDICATORS.map(({ key, name }) => ({ key, label: name })),
  dimensions: { argument_structure: 0, evidence_quality: 0, logic: 0, rebuttal: 0, expression: 0 },
  stats: { practiceCount: 0, portfolioCount: 0, sparringSessions: 0, sparringRounds: 0, effectiveRebuttalRate: 0, avgScore: 0, daysActive: 0 },
  recommendations: [],
  history: [],
};

Page({
  data: {
    userInfo: {},
    debate: EMPTY_DEBATE,
    speech: { stats: { totalCount: 0, totalDuration: 0, avgScore: 0, daysActive: 0 } },
    speechMinutes: 0,
    canvasWidth: 0,
    canvasHeight: 0,
    profileForm: { nickname: '', grade: '', school: '', class_name: '', gender: '', birth_date: '', bio: '' },
    showProfileEditor: false,
    bindPhone: '',
    bindCode: '',
    bindCountdown: 0,
  },

  onLoad() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    this.setData({ userInfo, profileForm: { ...this.data.profileForm, ...userInfo } });
  },

  openProfileEditor() {
    this.setData({ showProfileEditor: true, profileForm: { ...this.data.profileForm, ...this.data.userInfo } });
  },

  closeProfileEditor() { this.setData({ showProfileEditor: false }); },

  noop() {},

  onProfileInput(e) {
    const key = e.currentTarget.dataset.field;
    this.setData({ [`profileForm.${key}`]: e.detail.value });
  },

  async saveProfile() {
    if (!this.ensurePrivacyConsent()) return;
    const app = getApp();
    if (app.globalData.userReady) await app.globalData.userReady.catch(() => {});
    try {
      const res = await request('/auth/profile', { method: 'PATCH', data: this.data.profileForm });
      if (res.code !== 200) throw new Error(res.message || '资料更新失败');
      const userInfo = { ...this.data.userInfo, ...res.data.user };
      wx.setStorageSync('userInfo', userInfo);
      app.globalData.userInfo = userInfo;
      this.setData({ userInfo, showProfileEditor: false });
      wx.showToast({ title: '资料已保存', icon: 'success' });
    } catch (err) { wx.showToast({ title: err.message || '保存失败', icon: 'none' }); }
  },

  onBindPhoneInput(e) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }); },

  ensurePrivacyConsent() {
    const app = getApp();
    if (app.hasPrivacyConsent()) return true;
    wx.showModal({
      title: '需要隐私授权',
      content: '手机号绑定和短信登录会处理手机号，请先阅读并同意隐私保护指引。',
      confirmText: '查看协议',
      success: result => {
        if (result.confirm) wx.navigateTo({ url: '/pages/privacy/privacy' });
      },
    });
    return false;
  },

  async sendBindCode() {
    if (!this.ensurePrivacyConsent()) return;
    const phone = String(this.data.bindPhone || '').trim();
    if (!/^1[3-9]\d{9}$/.test(phone)) return wx.showToast({ title: '请输入正确手机号', icon: 'none' });
    try {
      const res = await request('/auth/send-code', { method: 'POST', data: { phone } });
      if (res.code !== 200) throw new Error(res.message || '验证码发送失败');
      if (res.data.dev_code) this.setData({ bindCode: res.data.dev_code });
      this.setData({ bindCountdown: 60 });
      const timer = setInterval(() => { const value = this.data.bindCountdown - 1; if (value <= 0) clearInterval(timer); this.setData({ bindCountdown: Math.max(0, value) }); }, 1000);
    } catch (err) { wx.showToast({ title: err.message || '验证码发送失败', icon: 'none' }); }
  },

  async submitBindPhone() {
    if (!this.ensurePrivacyConsent()) return;
    try {
      const res = await request('/auth/bind-phone', { method: 'POST', data: { phone: this.data.bindPhone, code: this.data.bindCode } });
      if (res.code !== 200) throw new Error(res.message || '绑定失败');
      const userInfo = { ...this.data.userInfo, ...res.data.user };
      wx.setStorageSync('userInfo', userInfo);
      getApp().globalData.userInfo = userInfo;
      this.setData({ userInfo, bindPhone: '', bindCode: '' });
      wx.showToast({ title: '手机号已绑定', icon: 'success' });
    } catch (err) { wx.showToast({ title: err.message || '绑定失败', icon: 'none' }); }
  },

  async miniLoginBySms() {
    if (!this.ensurePrivacyConsent()) return;
    const phone = String(this.data.bindPhone || '').trim();
    const code = String(this.data.bindCode || '').trim();
    if (!/^1[3-9]\d{9}$/.test(phone) || !/^\d{6}$/.test(code)) return wx.showToast({ title: '请输入手机号和6位验证码', icon: 'none' });
    try {
      const res = await request('/auth/mini-login', { method: 'POST', data: { phone, code } });
      if (res.code !== 200) throw new Error(res.message || '短信登录失败');
      wx.setStorageSync('token', res.data.token);
      wx.setStorageSync('userInfo', res.data.user);
      const app = getApp();
      app.globalData.userInfo = res.data.user;
      app.globalData.userReady = Promise.resolve(res.data.user);
      this.setData({ userInfo: res.data.user, bindPhone: '', bindCode: '' });
      wx.showToast({ title: '短信登录成功', icon: 'success' });
    } catch (err) { wx.showToast({ title: err.message || '短信登录失败', icon: 'none' }); }
  },

  onShow() {
    this.loadGrowthData();
  },

  async loadGrowthData() {
    const app = getApp();
    if (app.globalData.userReady) await app.globalData.userReady.catch(() => {});
    const userId = wx.getStorageSync('userId') || app.globalData.userId;
    if (!userId) return;

    try {
      const res = await request(`/growth/${userId}`);
      if (res.code !== 200 || !res.data) throw new Error(res.message || '成长数据不可用');

      const debate = { ...EMPTY_DEBATE, ...(res.data.debate || {}) };
      const speech = res.data.speech || {
        stats: res.data.stats || { totalCount: 0, totalDuration: 0, avgScore: 0, daysActive: 0 },
      };
      this.setData({
        debate,
        speech,
        speechMinutes: Math.round((speech.stats.totalDuration || 0) / 60),
      });
      setTimeout(() => this.drawRadar(), 100);
    } catch (err) {
      console.error('加载辩论能力失败:', err);
      this.setData({ debate: EMPTY_DEBATE, speechMinutes: 0 });
      setTimeout(() => this.drawRadar(), 100);
    }
  },

  drawRadar() {
    const query = wx.createSelectorQuery();
    query.select('#radarCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) return;

      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      let dpr = 1;
      try {
        const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        dpr = windowInfo.pixelRatio || 1;
      } catch (e) {
        dpr = 1;
      }

      const width = res[0].width;
      const height = res[0].height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);

      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) * 0.34;
      const pointAt = (index, distance) => {
        const angle = (Math.PI * 2 * index) / INDICATORS.length - Math.PI / 2;
        return {
          x: centerX + distance * Math.cos(angle),
          y: centerY + distance * Math.sin(angle),
        };
      };

      ctx.clearRect(0, 0, width, height);
      for (let level = 1; level <= 5; level += 1) {
        const levelRadius = (radius / 5) * level;
        ctx.beginPath();
        INDICATORS.forEach((item, index) => {
          const point = pointAt(index, levelRadius);
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.closePath();
        ctx.strokeStyle = level === 5 ? '#cbd5e1' : '#e5e7eb';
        ctx.lineWidth = level === 5 ? 1.5 : 1;
        ctx.stroke();
      }

      INDICATORS.forEach((item, index) => {
        const end = pointAt(index, radius);
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(end.x, end.y);
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      ctx.fillStyle = '#475569';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      INDICATORS.forEach((item, index) => {
        const point = pointAt(index, radius + 22);
        ctx.fillText(item.name, point.x, point.y);
      });

      const values = this.data.debate.dimensions || {};
      ctx.beginPath();
      INDICATORS.forEach((item, index) => {
        const value = Math.max(0, Math.min(100, Number(values[item.key]) || 0));
        const point = pointAt(index, (value / item.max) * radius);
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
      ctx.fillStyle = 'rgba(37, 99, 235, 0.18)';
      ctx.fill();
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  },

  formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  },

  formatHistoryType(type) {
    return { portfolio: '作品集', debate: 'AI 对练' }[type] || '辩论练习';
  },
});
