const { request } = require('../../utils/request');

const INDICATORS = [
  { name: '发音', key: 'pronunciation', max: 100 },
  { name: '流利度', key: 'fluency', max: 100 },
  { name: '完整度', key: 'integrity', max: 100 },
];

Page({
  data: {
    userInfo: {},
    baseline: { pronunciation: 0, fluency: 0, integrity: 0, overall: 0 },
    latest: { pronunciation: 0, fluency: 0, integrity: 0, overall: 0 },
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
        this.setData({
          baseline: data.baseline,
          latest: data.latest,
          history: data.history || [],
          stats: {
            totalCount: data.stats.totalCount,
            totalDuration: data.stats.totalDuration,
            avgScore: data.stats.avgScore,
            daysActive: data.stats.daysActive,
          },
        });
        // 延迟绘制，等 canvas 节点渲染完成
        setTimeout(() => this.drawRadar(), 100);
      }
    } catch (err) {
      console.error('加载成长数据失败:', err);
      this.setData({
        baseline: { pronunciation: 0, fluency: 0, integrity: 0, overall: 0 },
        latest: { pronunciation: 0, fluency: 0, integrity: 0, overall: 0 },
        history: [],
        stats: {
          totalCount: 0,
          totalDuration: 0,
          avgScore: 0,
          daysActive: 0,
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
        // 使用新API获取像素比，兼容旧基础库
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
