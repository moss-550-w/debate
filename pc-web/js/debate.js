/**
 * 辩题管理与立论相关逻辑
 * 从后端 API 加载真实辩题数据，支持增删改查
 */

// 分类中文映射
const CATEGORY_LABELS = {
  society: '社会',
  education: '教育',
  tech: '科技',
  environment: '环境',
};

// 难度统一为深浅蓝色系（专业感）
const DIFFICULTY_LABELS = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
};
const DIFFICULTY_COLORS = {
  easy: '#60a5fa',     // 浅蓝（简单）
  medium: '#2563eb',   // 标准蓝（中等）
  hard: '#1e3a8a',     // 深蓝（困难）
};

// 缓存辩题数据
let allTopics = [];
let editingTopicId = null; // 当前正在编辑的辩题ID

document.addEventListener('DOMContentLoaded', () => {
  // 仅在已登录时加载数据
  if (localStorage.getItem('token')) {
    loadTopics();
  }
  document.getElementById('generateBtn').addEventListener('click', handleGenerate);

  // CSV导出
  document.getElementById('exportCsvBtn').addEventListener('click', exportTopicsCsv);

  // 新增辩题 → 打开弹窗
  document.getElementById('addTopicBtn').addEventListener('click', () => openTopicModal());

  // 保存辩题（新增/编辑）
  document.getElementById('saveTopicBtn').addEventListener('click', handleSaveTopic);

  // 成绩导出
  document.getElementById('exportGradesBtn').addEventListener('click', loadAndShowGrades);
  document.getElementById('exportGradesCsvBtn2').addEventListener('click', exportGradesCsv);
});

// ==================== 辩题 CRUD ====================

/**
 * 从 API 加载辩题列表（管理员模式，含下架）
 */
async function loadTopics() {
  try {
    const [topicsRes, assignmentRes] = await Promise.all([
      apiRequest('/topics?size=200&admin=1'),
      apiRequest('/assignments/current'),
    ]);

    if (topicsRes && topicsRes.code === 200) {
      allTopics = topicsRes.data.list;
      renderTopicSelect(allTopics);
      renderTopicTable(allTopics);
    } else {
      throw new Error('获取辩题失败');
    }

    // 显示当前已发布的任务横幅
    const banner = document.getElementById('currentAssignmentBanner');
    if (assignmentRes && assignmentRes.code === 200 && assignmentRes.data.is_active) {
      if (banner) {
        banner.style.display = 'flex';
        banner.querySelector('.banner-text').textContent = `当前任务：${assignmentRes.data.topic_title}`;
      }
    } else {
      if (banner) {
        banner.style.display = 'none';
      }
    }
  } catch (err) {
    console.error('加载辩题失败:', err);
    renderTopicTable([]);
  }
}

/**
 * 渲染辩题下拉选择框
 */
function renderTopicSelect(topics) {
  const select = document.getElementById('practiceTopic');
  if (!select) return;
  select.innerHTML = '<option value="">-- 请选择辩题 --</option>';
  topics.filter(t => t.status === 1).forEach(t => {
    const opt = document.createElement('option');
    opt.value = t._id;
    opt.textContent = `${t.title} [${DIFFICULTY_LABELS[t.difficulty] || t.difficulty}]`;
    select.appendChild(opt);
  });
}

/**
 * 渲染辩题管理表格
 */
function renderTopicTable(topics) {
  const tbody = document.getElementById('topicTableBody');
  if (!topics.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-row">暂无辩题数据</td></tr>';
    updateTopicCount(topics);
    return;
  }

  tbody.innerHTML = topics.map(t => {
    const catLabel = CATEGORY_LABELS[t.category] || t.category;
    const diffLabel = DIFFICULTY_LABELS[t.difficulty] || t.difficulty;
    const diffColor = DIFFICULTY_COLORS[t.difficulty] || '#6b7280';
    const isActive = t.status === 1;
    const statusText = isActive ? '已上架' : '已下架';
    const statusClass = isActive ? 'status-active' : 'status-inactive';
    return `
      <tr>
        <td>
          <div class="topic-title">${escapeHtml(t.title)}</div>
          ${t.background ? `<div class="topic-bg">${escapeHtml(t.background.slice(0, 60))}${t.background.length > 60 ? '...' : ''}</div>` : ''}
        </td>
        <td><span class="tag tag-${t.category}">${catLabel}</span></td>
        <td><span style="color:${diffColor};font-weight:600;">${diffLabel}</span></td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td style="white-space:nowrap;">
          <button class="btn-primary btn-sm" onclick="editTopic('${t._id}')">编辑</button>
          <button class="btn-secondary btn-sm" onclick="publishAssignment('${t._id}', '${escapeAttr(t.title)}')">布置</button>
          <button class="btn-secondary btn-sm" style="color:${isActive ? '#64748b' : '#1d4ed8'};" onclick="toggleTopicStatus('${t._id}', ${isActive ? 0 : 1})">${isActive ? '下架' : '上架'}</button>
          <button class="btn-secondary btn-sm" style="color:#64748b;" onclick="deleteTopic('${t._id}', '${escapeAttr(t.title)}')">删除</button>
        </td>
      </tr>
    `;
  }).join('');

  updateTopicCount(topics);
}

function updateTopicCount(topics) {
  const el = document.getElementById('topicCount');
  if (el) {
    const active = topics.filter(t => t.status === 1).length;
    el.textContent = `（共 ${topics.length} 条，上架 ${active} 条）`;
  }
}

// ==================== 辩题弹窗 ====================

/**
 * 打开新增/编辑弹窗
 * @param {string|null} topicId - 编辑时传入辩题ID
 */
function openTopicModal(topicId) {
  editingTopicId = topicId || null;
  const modal = document.getElementById('topicModal');
  const title = document.getElementById('topicModalTitle');

  if (topicId) {
    title.textContent = '编辑辩题';
    const topic = allTopics.find(t => t._id === topicId);
    if (topic) {
      document.getElementById('topicFormTitle').value = topic.title || '';
      document.getElementById('topicFormCategory').value = topic.category || '';
      document.getElementById('topicFormDifficulty').value = topic.difficulty || '';
      document.getElementById('topicFormBackground').value = topic.background || '';
      document.getElementById('topicFormVocab').value = (topic.vocab_list || []).join(', ');
    }
  } else {
    title.textContent = '新增辩题';
    document.getElementById('topicFormTitle').value = '';
    document.getElementById('topicFormCategory').value = '';
    document.getElementById('topicFormDifficulty').value = '';
    document.getElementById('topicFormBackground').value = '';
    document.getElementById('topicFormVocab').value = '';
  }

  modal.style.display = 'flex';
}

function closeTopicModal() {
  document.getElementById('topicModal').style.display = 'none';
  editingTopicId = null;
}

/**
 * 保存辩题（新增或更新）
 */
async function handleSaveTopic() {
  const title = document.getElementById('topicFormTitle').value.trim();
  const category = document.getElementById('topicFormCategory').value;
  const difficulty = document.getElementById('topicFormDifficulty').value;
  const background = document.getElementById('topicFormBackground').value.trim();
  const vocabRaw = document.getElementById('topicFormVocab').value.trim();

  if (!title || !category || !difficulty) {
    showToast('请填写辩题名称、分类和难度', 'error');
    return;
  }

  const body = {
    title,
    category,
    difficulty,
    background,
    vocab_list: vocabRaw ? vocabRaw.split(',').map(v => v.trim()).filter(Boolean) : [],
  };

  const btn = document.getElementById('saveTopicBtn');
  btn.disabled = true;
  btn.textContent = '保存中...';

  try {
    const url = editingTopicId ? `/topics/${editingTopicId}` : '/topics';
    const method = editingTopicId ? 'PUT' : 'POST';
    const res = await apiRequest(url, { method, body: JSON.stringify(body) });

    if (res && res.code === 200) {
      showToast(editingTopicId ? '辩题更新成功' : '辩题创建成功', 'success');
      closeTopicModal();
      loadTopics();
    } else {
      showToast(res?.message || '操作失败', 'error');
    }
  } catch (err) {
    showToast('保存失败，请稍后重试', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '保存';
  }
}

/**
 * 编辑辩题
 */
function editTopic(topicId) {
  openTopicModal(topicId);
}

/**
 * 删除辩题
 */
async function deleteTopic(topicId, topicTitle) {
  if (!confirm(`确定要删除辩题「${topicTitle}」吗？此操作不可撤销。`)) return;

  try {
    const res = await apiRequest(`/topics/${topicId}`, { method: 'DELETE' });
    if (res && res.code === 200) {
      showToast('辩题已删除', 'success');
      loadTopics();
    } else {
      showToast(res?.message || '删除失败', 'error');
    }
  } catch (err) {
    showToast('删除失败，请稍后重试', 'error');
  }
}

/**
 * 上下架辩题
 */
async function toggleTopicStatus(topicId, newStatus) {
  const action = newStatus === 1 ? '上架' : '下架';
  if (!confirm(`确定要${action}该辩题吗？`)) return;

  try {
    const res = await apiRequest(`/topics/${topicId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus }),
    });
    if (res && res.code === 200) {
      showToast(`辩题已${action}`, 'success');
      loadTopics();
    } else {
      showToast(res?.message || '操作失败', 'error');
    }
  } catch (err) {
    showToast('操作失败，请稍后重试', 'error');
  }
}

// ==================== 成绩导出 ====================

/**
 * 加载并展示学生成绩弹窗
 */
async function loadAndShowGrades() {
  try {
    const res = await apiRequest('/export/grades-json');
    if (res && res.code === 200) {
      const { students, class_stats } = res.data;
      renderGradesTable(students);
      // 更新看板数据
      updateDashboardWithGrades(students, class_stats);
      document.getElementById('gradesModal').style.display = 'flex';
    } else {
      showToast('加载成绩数据失败', 'error');
    }
  } catch (err) {
    showToast('加载成绩数据失败', 'error');
  }
}

function closeGradesModal() {
  document.getElementById('gradesModal').style.display = 'none';
}

function renderGradesTable(students) {
  const tbody = document.getElementById('gradesTableBody');
  tbody.innerHTML = students.map(s => `
    <tr>
      <td>${s.name}</td>
      <td>${s.grade}</td>
      <td>${s.practice_count}</td>
      <td>${s.avg_pronunciation}</td>
      <td>${s.avg_fluency}</td>
      <td>${s.avg_logic}</td>
      <td>${s.avg_vocabulary}</td>
      <td>${s.avg_reaction}</td>
      <td><strong>${s.avg_overall}</strong></td>
      <td>${s.total_duration_min}</td>
    </tr>
  `).join('');
}

function updateDashboardWithGrades(students, stats) {
  document.getElementById('statUsers').textContent = stats.total_students;
  document.getElementById('statPractices').textContent = stats.total_practices;
  document.getElementById('statDuration').textContent = stats.total_duration_min;
  document.getElementById('statAvgScore').textContent = stats.avg_overall;

  // 最强/最弱维度
  const dims = [
    { key: '发音', value: stats.avg_pronunciation },
    { key: '流利度', value: stats.avg_fluency },
    { key: '逻辑', value: stats.avg_logic },
    { key: '词汇', value: stats.avg_vocabulary },
    { key: '反应', value: stats.avg_reaction },
  ];
  dims.sort((a, b) => b.value - a.value);
  document.getElementById('statStrongest').textContent = dims[0].key;
  document.getElementById('statWeakest').textContent = dims[dims.length - 1].key;

  // 全班完成率
  const maxPractices = Math.max(...students.map(s => s.practice_count), 1);
  const completionRate = Math.round(
    (students.reduce((sum, s) => sum + s.practice_count, 0) / (students.length * maxPractices)) * 100
  );
  document.getElementById('statCompletionRate').textContent = completionRate + '%';
}

/**
 * 导出学生成绩 CSV（直接下载）
 */
async function exportGradesCsv() {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(CONFIG.API_BASE_URL + '/export/grades', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      showToast('导出失败，请重新登录', 'error');
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `学生成绩_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('成绩CSV已下载', 'success');
  } catch (err) {
    showToast('导出失败，请稍后重试', 'error');
  }
}

// ==================== 生成立论 ====================

/**
 * 生成立论
 */
async function handleGenerate() {
  const topicId = document.getElementById('practiceTopic').value;
  const position = document.querySelector('input[name="position"]:checked').value;

  if (!topicId) {
    showToast('请先选择辩题', 'error');
    return;
  }

  const btn = document.getElementById('generateBtn');
  btn.disabled = true;
  btn.textContent = '生成中（约30秒）...';

  try {
    const res = await apiRequest('/generate', {
      method: 'POST',
      body: JSON.stringify({
        topic_id: topicId,
        topic_title: allTopics.find(t => t._id === topicId)?.title || '',
        position,
        user_role: 'pupil',
      }),
    });

    if (res && res.code === 200) {
      const data = res.data;
      const resultDiv = document.getElementById('argumentResult');
      const contentDiv = document.getElementById('argumentContent');

      contentDiv.innerHTML = `
        <div style="margin-bottom:16px;">
          <h4 style="color:#2563eb;margin-bottom:8px;">论点列表</h4>
          ${(data.points || []).map((p, i) => `
            <div style="background:#f8fafc;padding:12px;border-radius:8px;margin-bottom:8px;">
              <strong>${i + 1}. ${escapeHtml(p.title)}</strong>
              <p style="margin-top:4px;">${escapeHtml(p.sentence)}</p>
              <p style="font-size:13px;color:#6b7280;">${escapeHtml(p.translation)}</p>
            </div>
          `).join('')}
        </div>
        <div style="margin-bottom:16px;">
          <h4 style="color:#2563eb;margin-bottom:8px;">总结</h4>
          <p>${escapeHtml(data.conclusion || '')}</p>
        </div>
        <div>
          <h4 style="color:#2563eb;margin-bottom:8px;">完整逐字稿</h4>
          <div style="background:#f8fafc;padding:16px;border-radius:8px;font-size:15px;line-height:1.8;">
            ${escapeHtml(data.full_text || '')}
          </div>
        </div>
      `;

      resultDiv.style.display = '';
      resultDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });

      const transcriptArea = document.getElementById('speechTranscriptArea');
      const transcriptText = document.getElementById('speechTranscriptText');
      if (data.full_text) {
        transcriptArea.style.display = '';
        transcriptText.textContent = data.full_text;
      } else {
        transcriptArea.style.display = 'none';
      }

      showToast('立论生成成功', 'success');
    }
  } catch (err) {
    showToast('生成立论失败，请稍后重试', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '生成立论';
  }
}

// ==================== 导出辩题 CSV ====================

/**
 * 导出辩题列表为 CSV 文件
 */
function exportTopicsCsv() {
  if (!allTopics.length) {
    showToast('暂无辩题数据可导出', 'error');
    return;
  }

  const headers = ['辩题ID', '辩题名称', '分类', '难度', '背景说明', '状态'];
  const rows = allTopics.map(t => [
    t._id,
    `"${(t.title || '').replace(/"/g, '""')}"`,
    CATEGORY_LABELS[t.category] || t.category,
    DIFFICULTY_LABELS[t.difficulty] || t.difficulty,
    `"${(t.background || '').replace(/"/g, '""')}"`,
    t.status === 1 ? '已上架' : '已下架',
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `辩题数据_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`已导出 ${allTopics.length} 条辩题`, 'success');
}

// ==================== 发布任务 ====================

/**
 * 发布任务（布置辩题）
 */
async function publishAssignment(topicId, topicTitle) {
  try {
    const res = await apiRequest('/assignments/publish', {
      method: 'POST',
      body: JSON.stringify({ topic_id: topicId, topic_title: topicTitle }),
    });

    if (res && res.code === 200) {
      showToast(`已发布任务：${topicTitle}`, 'success');
      const assignmentRes = await apiRequest('/assignments/current');
      const banner = document.getElementById('currentAssignmentBanner');
      if (assignmentRes && assignmentRes.code === 200 && assignmentRes.data.is_active && banner) {
        banner.style.display = 'flex';
        banner.querySelector('.banner-text').textContent = `当前任务：${assignmentRes.data.topic_title}`;
      }
    } else {
      showToast(res?.message || '发布任务失败', 'error');
    }
  } catch (err) {
    console.error('发布任务失败:', err);
    showToast('发布任务失败，请稍后重试', 'error');
  }
}

// ==================== 工具函数 ====================

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}