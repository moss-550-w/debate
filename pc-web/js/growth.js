/**
 * 成长数据与看板逻辑（Sprint 3 — ECharts 雷达图 + 班级数据概览）
 */

document.addEventListener('DOMContentLoaded', () => {
  // 仅在已登录时加载看板数据
  if (localStorage.getItem('token')) {
    loadGrowthDashboard();
  }
});

/**
 * 加载由小程序练习记录聚合的班级看板数据
 */
async function loadGrowthDashboard() {
  try {
    const gradesRes = await apiRequest('/export/grades-json');
    if (gradesRes && gradesRes.code === 200 && gradesRes.data) {
      const { students, class_stats } = gradesRes.data;
      updateDashboardWithClassData(students, class_stats);
      renderRadarWithClassStats(class_stats);
      renderDimensionWithClassStats(class_stats);
      await loadManagedUsers();
      return;
    }
    throw new Error('未返回班级数据');
  } catch (err) {
    console.error('加载成长数据失败:', err);
    showToast('加载成长数据失败，请稍后重试', 'error');
  }
}

function getClassDimensions(stats) {
  return (stats.dimensions || []).map(dimension => ({
    ...dimension,
    value: Number(stats[`avg_${dimension.key}`]) || 0,
  }));
}

/**
 * 用班级数据更新看板卡片
 */
function updateDashboardWithClassData(students, stats) {
  document.getElementById('statUsers').textContent = stats.total_students;
  document.getElementById('statPractices').textContent = stats.total_practices;
  document.getElementById('statDuration').textContent = stats.total_duration_min;
  document.getElementById('statAvgScore').textContent = stats.avg_debate_score;

  const dims = getClassDimensions(stats);
  dims.sort((a, b) => b.value - a.value);
  document.getElementById('statStrongest').textContent = dims[0].key;
  document.getElementById('statWeakest').textContent = dims[dims.length - 1].key;

  const maxPractices = Math.max(...students.map(s => s.practice_count), 1);
  const completionRate = Math.round((students.length
    ? students.reduce((sum, s) => sum + s.practice_count, 0) / (students.length * maxPractices)
    : 0) * 100);
  document.getElementById('statCompletionRate').textContent = completionRate + '%';

  document.getElementById('statImprovement').textContent = stats.avg_debate_score;

  // 渲染用户列表表格
  renderUserTable(students);
}

/**
 * 渲染用户列表表格
 */
function renderUserTable(students) {
  const tbody = document.getElementById('userTableBody');
  if (!tbody) return;

  if (!students || students.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-row">暂无数据</td></tr>';
    return;
  }

  const roleLabels = { pupil: '学生', teacher: '老师', admin: '管理员' };

    tbody.innerHTML = students.map(s => `
    <tr>
      <td>${escapeHtml(s.name || '未命名')}</td>
      <td>${roleLabels[s.role] || '学生'}</td>
      <td>${escapeHtml(s.grade || '-')}</td>
      <td>-</td>
      <td>${s.practice_count ?? 0}</td>
      <td>${s.total_duration_min ?? 0}</td>
      <td>${s.registered_at || '-'}</td>
      <td>正常</td>
      <td>-</td>
    </tr>
  `).join('');
}

async function loadManagedUsers() {
  initializeTeacherAuthorization();
  const result = await apiRequest('/users');
  if (result && result.code === 200 && result.data) {
    renderManagedUsers(result.data.list || []);
  }
}

let managedUsersStreamActive = false;
async function connectManagedUsersStream() {
  if (managedUsersStreamActive || !localStorage.getItem('token')) return;
  managedUsersStreamActive = true;
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/users/stream`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!response.ok || !response.body) throw new Error(`实时连接失败（${response.status}）`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (localStorage.getItem('token')) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const messages = buffer.split('\n\n');
      buffer = messages.pop();
      messages.forEach(message => {
        const line = message.split('\n').find(item => item.startsWith('data: '));
        if (!line) return;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'users_changed') loadManagedUsers();
        } catch (err) { console.warn('用户实时消息解析失败', err); }
      });
    }
  } catch (err) {
    console.warn('用户实时连接中断', err);
  } finally {
    managedUsersStreamActive = false;
    if (localStorage.getItem('token')) setTimeout(connectManagedUsersStream, 5000);
  }
}

document.addEventListener('DOMContentLoaded', connectManagedUsersStream);

function initializeTeacherAuthorization() {
  const panel = document.getElementById('teacherAuthorizationPanel');
  const button = document.getElementById('authorizeTeachersBtn');
  if (!panel || !button) return;
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const isDeveloper = ['developer', 'admin'].includes(currentUser.role);
  panel.style.display = isDeveloper ? '' : 'none';
  if (button.dataset.bound === 'true') return;
  button.dataset.bound = 'true';
  button.addEventListener('click', authorizeTeachers);
}

async function authorizeTeachers() {
  const input = document.getElementById('teacherPhonesInput');
  const resultNode = document.getElementById('teacherAuthorizationResult');
  const button = document.getElementById('authorizeTeachersBtn');
  const phones = input.value.trim();
  if (!phones) {
    showToast('请输入至少一个手机号', 'error');
    return;
  }
  button.disabled = true;
  resultNode.textContent = '授权中...';
  const result = await apiRequest('/users/authorize-teachers', {
    method: 'POST',
    body: JSON.stringify({ phones }),
  });
  button.disabled = false;
  if (result && result.code === 200) {
    const items = result.data?.results || [];
    const created = items.filter(item => item.action === 'created').length;
    const promoted = items.filter(item => item.action === 'promoted').length;
    const enabled = items.filter(item => item.action === 'enabled').length;
    resultNode.textContent = `完成：${created}个新建，${promoted}个升为教师，${enabled}个已启用`;
    showToast('教师授权完成', 'success');
    input.value = '';
    await loadManagedUsers();
  } else {
    resultNode.textContent = '';
    showToast(result?.message || '教师授权失败', 'error');
  }
}

function renderManagedUsers(users) {
  const tbody = document.getElementById('userTableBody');
  if (!tbody) return;
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="12" class="empty-row">暂无可管理用户</td></tr>';
    return;
  }
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const canEdit = ['developer', 'admin'].includes(currentUser.role);
  const roleLabels = { developer: '开发者', admin: '开发者', teacher: '教师', student: '学生', pupil: '学生' };
  const teachers = users.filter(user => user.role === 'teacher' || user.role === 'admin');
  tbody.innerHTML = users.map(user => {
    const role = user.role || 'student';
    const nextRole = role === 'student' ? 'teacher' : 'student';
    const roleAction = canEdit && role !== 'developer' ? `<button class="btn-secondary" onclick="changeUserRole('${escapeAttr(user._id)}','${nextRole}')">设为${nextRole === 'teacher' ? '教师' : '学生'}</button>` : '';
    const statusAction = canEdit && role !== 'developer' ? `<button class="btn-secondary" onclick="toggleUserStatus('${escapeAttr(user._id)}','${user.status === 'disabled' ? 'active' : 'disabled'}')">${user.status === 'disabled' ? '启用' : '停用'}</button>` : '';
    const teacherControl = canEdit && role === 'student' ? `<select class="form-select" onchange="assignTeacher('${escapeAttr(user._id)}',this.value)"><option value="">未分配</option>${teachers.map(teacher => `<option value="${escapeAttr(teacher._id)}" ${teacher._id === user.teacher_id ? 'selected' : ''}>${escapeHtml(teacher.nickname || teacher.phone || '教师')}</option>`).join('')}</select>` : escapeHtml(user.teacher_name || '-');
    return `<tr>
      <td>${escapeHtml(user.nickname || '小辩手')}</td>
      <td>${escapeHtml(user.phone || '-')}</td>
      <td>${roleLabels[role] || '学生'}</td>
      <td>${escapeHtml(user.grade || '-')}</td>
      <td>${escapeHtml([user.school, user.class_name].filter(Boolean).join(' / ') || '-')}</td>
      <td>${teacherControl}</td>
      <td>${user.practice_count ?? 0}</td>
      <td>${user.total_duration_min ?? 0}</td>
      <td>${user.created_at ? formatDate(user.created_at) : '-'}</td>
      <td>${user.last_login_at ? formatDate(user.last_login_at) : '-'}</td>
      <td>${user.phone_verified ? '已绑定' : '未绑定'}</td>
      <td>${user.status === 'disabled' ? '已停用' : '正常'}</td>
      <td>${roleAction}${statusAction}</td>
    </tr>`;
  }).join('');
}

async function assignTeacher(userId, teacherId) {
  const result = await apiRequest(`/users/${userId}/teacher`, { method: 'PATCH', body: JSON.stringify({ teacher_id: teacherId }) });
  if (result && result.code === 200) {
    showToast(teacherId ? '教师已分配' : '已解除教师分配', 'success');
    await loadManagedUsers();
  } else {
    showToast(result?.message || '分配教师失败', 'error');
  }
}

async function changeUserRole(userId, role) {
  const result = await apiRequest(`/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
  if (result && result.code === 200) {
    showToast('角色已更新', 'success');
    await loadManagedUsers();
  } else {
    showToast(result?.message || '更新角色失败', 'error');
  }
}

async function toggleUserStatus(userId, status) {
  const result = await apiRequest(`/users/${userId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
  if (result && result.code === 200) {
    showToast(status === 'active' ? '用户已启用' : '用户已停用', 'success');
    await loadManagedUsers();
  } else {
    showToast(result?.message || '更新状态失败', 'error');
  }
}

/**
 * 用班级统计数据渲染雷达图
 */
function renderRadarWithClassStats(stats) {
  const dom = document.getElementById('radarChart');
  if (!dom) return;
  const chart = echarts.init(dom);

  const dimensions = getClassDimensions(stats);
  const option = {
    legend: { data: ['班级平均水平'], bottom: 0 },
    radar: {
      indicator: dimensions.map(dimension => ({ name: dimension.label, max: 100 })),
      shape: 'polygon',
      splitNumber: 5,
      axisName: { color: '#333', fontSize: 13 },
    },
    series: [{
      type: 'radar',
      data: [{
        value: dimensions.map(dimension => dimension.value),
        name: '班级平均水平',
        lineStyle: { color: '#3b82f6', width: 2 },
        areaStyle: { color: 'rgba(59, 130, 246, 0.15)' },
        itemStyle: { color: '#3b82f6' },
      }],
    }],
  };
  chart.setOption(option);
  window.addEventListener('resize', () => chart.resize());
}

/**
 * 用班级统计数据渲染维度柱状图
 */
function renderDimensionWithClassStats(stats) {
  try {
    const dom = document.getElementById('dimensionChart');
    if (!dom) return;
    const chart = echarts.init(dom);

    const dimensions = getClassDimensions(stats);

    const option = {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '3%', right: '4%', bottom: '10%', top: '3%', containLabel: true },
      xAxis: { type: 'category', data: dimensions.map(dimension => dimension.label), axisLabel: { color: '#6b7280', fontSize: 13 } },
      yAxis: { type: 'value', min: 0, max: 100, axisLabel: { color: '#9ca3af' }, splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } } },
      series: [{
        type: 'bar',
        data: dimensions.map(dimension => dimension.value),
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#3b82f6' },
            { offset: 1, color: '#93c5fd' },
          ]),
          borderRadius: [4, 4, 0, 0],
        },
        barWidth: '40%',
        label: { show: true, position: 'top', color: '#3b82f6', fontSize: 12, formatter: (p) => Math.round(p.value) },
      }],
    };
    chart.setOption(option);
    window.addEventListener('resize', () => chart.resize());
  } catch (err) {
    console.error('渲染维度柱状图失败:', err);
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
