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
  },

  onLoad() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    this.setData({ userInfo });
  },

  onShow() {
    this.loadGrowthData();
  },

  async loadGrowthData() {
    const openid = wx.getStorageSync('openid');
    if (!openid) return;

    try {
      const res = await request(`/growth/${openid}`);
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
