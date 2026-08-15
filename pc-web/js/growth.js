/**
 * 成长数据与看板逻辑（Sprint 3 — ECharts 雷达图）
 */

document.addEventListener('DOMContentLoaded', () => {
  loadGrowthDashboard();
});

/**
 * 加载成长看板数据
 */
async function loadGrowthDashboard() {
  try {
    const res = await apiRequest('/growth/admin_demo');
    if (res.code !== 200 || !res.data) {
      showToast('加载成长数据失败', 'error');
      return;
    }

    const data = res.data;

    // 1. 渲染雷达图
    renderRadarChart(data.baseline, data.latest);

    // 2. 渲染各维度强弱项柱状图
    renderDimensionChart(data.baseline, data.latest);

    // 3. 渲染统计数据
    renderStats(data);

    // 4. 渲染练习记录列表
    renderHistory(data.history);
  } catch (err) {
    console.error('加载成长数据失败:', err);
    showToast('加载成长数据失败，请稍后重试', 'error');
  }
}

/**
 * 渲染 ECharts 双雷达对比图
 * @param {object} baseline - 基准水平五维数据
 * @param {object} latest - 当前水平五维数据
 */
function renderRadarChart(baseline, latest) {
  const dom = document.getElementById('radarChart');
  if (!dom) return;

  const chart = echarts.init(dom);

  const option = {
    legend: {
      data: ['基准水平', '当前水平'],
      bottom: 0,
    },
    radar: {
      indicator: [
        { name: '发音', max: 100 },
        { name: '流利度', max: 100 },
        { name: '逻辑', max: 100 },
        { name: '词汇', max: 100 },
        { name: '反应', max: 100 },
      ],
      shape: 'polygon',
      splitNumber: 5,
      axisName: {
        color: '#333',
        fontSize: 13,
      },
    },
    series: [
      {
        type: 'radar',
        data: [
          {
            value: [
              baseline.pronunciation,
              baseline.fluency,
              baseline.logic,
              baseline.vocabulary,
              baseline.reaction,
            ],
            name: '基准水平',
            lineStyle: {
              color: '#9ca3af',
              type: 'dashed',
              width: 2,
            },
            areaStyle: {
              color: 'rgba(156, 163, 175, 0.1)',
            },
            itemStyle: {
              color: '#9ca3af',
            },
          },
          {
            value: [
              latest.pronunciation,
              latest.fluency,
              latest.logic,
              latest.vocabulary,
              latest.reaction,
            ],
            name: '当前水平',
            lineStyle: {
              color: '#3b82f6',
              type: 'solid',
              width: 2,
            },
            areaStyle: {
              color: 'rgba(59, 130, 246, 0.15)',
            },
            itemStyle: {
              color: '#3b82f6',
            },
          },
        ],
      },
    ],
  };

  chart.setOption(option);

  // 响应窗口缩放
  window.addEventListener('resize', () => chart.resize());
}

/**
 * 渲染统计数据到看板卡片
 * @param {object} data - API 返回的数据对象
 */
function renderStats(data) {
  // 计算所有历史记录的平均分
  let avgScore = 0;
  if (data.history.length > 0) {
    let totalAvg = 0;
    data.history.forEach((h) => {
      const scores = Object.values(h.score).filter((v) => typeof v === 'number');
      totalAvg += scores.reduce((a, b) => a + b, 0) / scores.length;
    });
    avgScore = Math.round(totalAvg / data.history.length);
  }

  document.getElementById('statUsers').textContent = 1;
  document.getElementById('statPractices').textContent = data.stats.totalCount;
  document.getElementById('statDuration').textContent = Math.round(data.stats.totalDuration / 60);
  document.getElementById('statAvgScore').textContent = avgScore;

  // 全班完成率（假设目标30条记录）
  const targetCount = 30;
  const completionRate = Math.min(100, Math.round((data.history.length / targetCount) * 100));
  document.getElementById('statCompletionRate').textContent = completionRate + '%';

  // 找出最强/最弱维度
  if (data.latest) {
    const dims = [
      { key: '发音', value: data.latest.pronunciation },
      { key: '流利度', value: data.latest.fluency },
      { key: '逻辑', value: data.latest.logic },
      { key: '词汇', value: data.latest.vocabulary },
      { key: '反应', value: data.latest.reaction },
    ];
    dims.sort((a, b) => b.value - a.value);
    document.getElementById('statStrongest').textContent = dims[0].key;
    document.getElementById('statWeakest').textContent = dims[dims.length - 1].key;
  }

  // 提升幅度（latest 各维度平均分 - baseline 各维度平均分）
  if (data.baseline && data.latest) {
    const dimKeys = ['pronunciation', 'fluency', 'logic', 'vocabulary', 'reaction'];
    const baselineAvg = dimKeys.reduce((sum, k) => sum + (data.baseline[k] || 0), 0) / dimKeys.length;
    const latestAvg = dimKeys.reduce((sum, k) => sum + (data.latest[k] || 0), 0) / dimKeys.length;
    const improvement = Math.round((latestAvg - baselineAvg) * 10) / 10;
    const sign = improvement >= 0 ? '+' : '';
    document.getElementById('statImprovement').textContent = sign + improvement.toFixed(1);
  }
}

/**
 * 渲染各维度强弱项柱状图
 * @param {object} baseline - 基准水平五维数据
 * @param {object} latest - 当前水平五维数据
 */
function renderDimensionChart(baseline, latest) {
  try {
    const dom = document.getElementById('dimensionChart');
    if (!dom || !baseline || !latest) return;

    const chart = echarts.init(dom);

    const dimensions = ['发音', '流利度', '逻辑', '词汇', '反应'];
    const dimKeys = ['pronunciation', 'fluency', 'logic', 'vocabulary', 'reaction'];

    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
      },
      legend: {
        data: ['基准水平', '当前水平'],
        bottom: 0,
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '14%',
        top: '3%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: dimensions,
        axisLabel: {
          color: '#6b7280',
          fontSize: 13,
        },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLabel: {
          color: '#9ca3af',
        },
        splitLine: {
          lineStyle: {
            color: '#e5e7eb',
            type: 'dashed',
          },
        },
      },
      series: [
        {
          name: '基准水平',
          type: 'bar',
          data: dimKeys.map((k) => baseline[k] || 0),
          itemStyle: {
            color: '#9ca3af',
            borderRadius: [4, 4, 0, 0],
          },
          barWidth: '30%',
          barGap: '20%',
          label: {
            show: true,
            position: 'top',
            color: '#9ca3af',
            fontSize: 12,
            formatter: (p) => Math.round(p.value),
          },
        },
        {
          name: '当前水平',
          type: 'bar',
          data: dimKeys.map((k) => latest[k] || 0),
          itemStyle: {
            color: '#3b82f6',
            borderRadius: [4, 4, 0, 0],
          },
          barWidth: '30%',
          label: {
            show: true,
            position: 'top',
            color: '#3b82f6',
            fontSize: 12,
            formatter: (p) => Math.round(p.value),
          },
        },
      ],
    };

    chart.setOption(option);

    // 响应窗口缩放
    window.addEventListener('resize', () => chart.resize());
  } catch (err) {
    console.error('渲染维度柱状图失败:', err);
  }
}

/**
 * 渲染练习记录列表
 * @param {Array} history - 历史记录数组
 */
function renderHistory(history) {
  const tbody = document.getElementById('userTableBody');
  if (!tbody) return;

  if (!history || history.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row">暂无数据</td></tr>';
    return;
  }

  tbody.innerHTML = history
    .map((h) => {
      const scores = Object.values(h.score).filter((v) => typeof v === 'number');
      const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      const typeLabel = h.type === 'argument' ? '立论练习' : '演讲练习';
      const scoreDetail = `发音${h.score.pronunciation} 流利度${h.score.fluency} 逻辑${h.score.logic} 词汇${h.score.vocabulary} 反应${h.score.reaction}`;

      return `
        <tr>
          <td>${typeLabel}</td>
          <td>${avg}分</td>
          <td>${scoreDetail}</td>
          <td>1</td>
          <td>-</td>
          <td>${formatDate(h.created_at)}</td>
        </tr>
      `;
    })
    .join('');
}