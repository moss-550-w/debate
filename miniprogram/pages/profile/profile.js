const { request } = require('../../utils/request');

const INDICATORS = [
  { name: '发音', key: 'pronunciation', max: 100 },
  { name: '流利度', key: 'fluency', max: 100 },
  { name: '逻辑性', key: 'logic', max: 100 },
  { name: '词汇量', key: 'vocabulary', max: 100 },
  { name: '反应力', key: 'reaction', max: 100 },
];

Page({
  data: {
    userInfo: {},
    baseline: { pronunciation: 55, fluency: 50, logic: 45, vocabulary: 60, reaction: 40 },
    latest: { pronunciation: 78, fluency: 72, logic: 68, vocabulary: 80, reaction: 70 },
    stats: {
      totalCount: 0,
      totalDuration: 0,
      avgScore: 0,
      daysActive: 0,
    },
    history: [],
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
      if (res.code === 200) {
        const data = res.data;
        const avgScore = Math.round(
          (data.latest.pronunciation + data.latest.fluency + data.latest.logic) / 3
        );
        this.setData({
          baseline: data.baseline,
          latest: data.latest,
          history: data.history || [],
          stats: {
            totalCount: data.stats.totalCount,
            totalDuration: data.stats.totalDuration,
            avgScore: avgScore,
            daysActive: Math.min((data.history || []).length, 30),
          },
        });
        // 延迟绘制，等 canvas 节点渲染完成
        setTimeout(() => this.drawRadar(), 100);
      }
    } catch (err) {
      console.error('加载成长数据失败:', err);
      // 使用本地默认数据
      const userInfo = wx.getStorageSync('userInfo') || {};
      const defaultBaseline = userInfo.ability_baseline || { pronunciation: 55, fluency: 50, logic: 45, vocabulary: 60, reaction: 40 };
      const defaultLatest = userInfo.ability_latest || { pronunciation: 78, fluency: 72, logic: 68, vocabulary: 80, reaction: 70 };
      this.setData({
        userInfo,
        baseline: defaultBaseline,
        latest: defaultLatest,
        history: [
          { _id: '1', type: 'argument', score: { overall: 75 }, created_at: new Date().toISOString() },
        ],
        stats: {
          totalCount: userInfo.total_count || 15,
          totalDuration: userInfo.total_duration || 1800,
          avgScore: Math.round((defaultLatest.pronunciation + defaultLatest.fluency + defaultLatest.logic) / 3),
          daysActive: 7,
        },
      });
      setTimeout(() => this.drawRadar(), 100);
    }
  },

  drawRadar() {
    const query = wx.createSelectorQuery();
    query.select('#radarCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          console.warn('Canvas 节点未找到');
          return;
        }

        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio;

        const width = res[0].width;
        const height = res[0].height;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        const centerX = width / 2;
        const centerY = height / 2 - 10;
        const radius = Math.min(width, height) * 0.38;

        // 清空画布
        ctx.clearRect(0, 0, width, height);

        // 绘制背景网格（5层）
        const levels = 5;
        for (let i = 1; i <= levels; i++) {
          const r = (radius / levels) * i;
          ctx.beginPath();
          for (let j = 0; j < INDICATORS.length; j++) {
            const angle = (Math.PI * 2 * j) / INDICATORS.length - Math.PI / 2;
            const x = centerX + r * Math.cos(angle);
            const y = centerY + r * Math.sin(angle);
            if (j === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.strokeStyle = i === levels ? '#d1d5db' : '#e5e7eb';
          ctx.lineWidth = i === levels ? 1.5 : 1;
          ctx.stroke();
          if (i === levels) {
            ctx.fillStyle = 'rgba(249, 250, 251, 0.5)';
            ctx.fill();
          }
        }

        // 绘制轴线
        for (let j = 0; j < INDICATORS.length; j++) {
          const angle = (Math.PI * 2 * j) / INDICATORS.length - Math.PI / 2;
          ctx.beginPath();
          ctx.moveTo(centerX, centerY);
          ctx.lineTo(
            centerX + radius * Math.cos(angle),
            centerY + radius * Math.sin(angle)
          );
          ctx.strokeStyle = '#e5e7eb';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // 绘制标签
        ctx.fillStyle = '#4b5563';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let j = 0; j < INDICATORS.length; j++) {
          const angle = (Math.PI * 2 * j) / INDICATORS.length - Math.PI / 2;
          const labelR = radius + 20;
          const x = centerX + labelR * Math.cos(angle);
          const y = centerY + labelR * Math.sin(angle);
          ctx.fillText(INDICATORS[j].name, x, y);
        }

        // 绘制数据区域的函数
        const drawData = (data, color, fillColor) => {
          ctx.beginPath();
          for (let j = 0; j < INDICATORS.length; j++) {
            const angle = (Math.PI * 2 * j) / INDICATORS.length - Math.PI / 2;
            const value = data[INDICATORS[j].key] || 0;
            const r = (value / INDICATORS[j].max) * radius;
            const x = centerX + r * Math.cos(angle);
            const y = centerY + r * Math.sin(angle);
            if (j === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fillStyle = fillColor;
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.stroke();

          // 绘制数据点
          for (let j = 0; j < INDICATORS.length; j++) {
            const angle = (Math.PI * 2 * j) / INDICATORS.length - Math.PI / 2;
            const value = data[INDICATORS[j].key] || 0;
            const r = (value / INDICATORS[j].max) * radius;
            const x = centerX + r * Math.cos(angle);
            const y = centerY + r * Math.sin(angle);
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
          }
        };

        // 绘制 baseline（灰色）
        drawData(this.data.baseline, '#9ca3af', 'rgba(156, 163, 175, 0.15)');
        // 绘制 latest（蓝色）
        drawData(this.data.latest, '#2563eb', 'rgba(37, 99, 235, 0.2)');
      });
  },

  formatDate(dateStr) {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  },
});
