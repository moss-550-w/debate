/**
 * 辩题与立论相关逻辑
 * 从后端 API 加载真实辩题数据
 */

// 分类中文映射
const CATEGORY_LABELS = {
  society: '社会',
  education: '教育',
  tech: '科技',
  environment: '环境',
};

// 难度中文映射
const DIFFICULTY_LABELS = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
};

// 难度颜色
const DIFFICULTY_COLORS = {
  easy: '#10b981',
  medium: '#f59e0b',
  hard: '#ef4444',
};

// 缓存辩题数据
let allTopics = [];
let currentTopicPage = 1;

document.addEventListener('DOMContentLoaded', () => {
  loadTopics();
  document.getElementById('generateBtn').addEventListener('click', handleGenerate);
});

/**
 * 从 API 加载辩题列表
 */
async function loadTopics() {
  try {
    const res = await apiRequest('/topics?size=100');
    if (res && res.code === 200) {
      allTopics = res.data.list;
      renderTopicSelect(allTopics);
      renderTopicTable(allTopics);
    } else {
      throw new Error('获取辩题失败');
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
  select.innerHTML = '<option value="">-- 请选择辩题 --</option>';
  topics.forEach(t => {
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
    return;
  }

  tbody.innerHTML = topics.map(t => {
    const catLabel = CATEGORY_LABELS[t.category] || t.category;
    const diffLabel = DIFFICULTY_LABELS[t.difficulty] || t.difficulty;
    const diffColor = DIFFICULTY_COLORS[t.difficulty] || '#6b7280';
    return `
      <tr>
        <td>
          <div class="topic-title">${t.title}</div>
          ${t.background ? `<div class="topic-bg">${t.background.slice(0, 60)}${t.background.length > 60 ? '...' : ''}</div>` : ''}
        </td>
        <td><span class="tag tag-${t.category}">${catLabel}</span></td>
        <td><span style="color:${diffColor};font-weight:600;">${diffLabel}</span></td>
        <td><span class="status-badge status-active">已上架</span></td>
        <td><button class="btn-primary" style="padding:4px 12px;font-size:13px;" onclick="alert('编辑功能将在后续版本实现')">编辑</button></td>
      </tr>
    `;
  }).join('');

  // 更新统计
  document.getElementById('topicCount').textContent = topics.length;
}

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
  btn.textContent = '⏳ 生成中（约30秒）...';

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
          ${data.points.map((p, i) => `
            <div style="background:#f8fafc;padding:12px;border-radius:8px;margin-bottom:8px;">
              <strong>${i + 1}. ${p.title}</strong>
              <p style="margin-top:4px;">${p.sentence}</p>
              <p style="font-size:13px;color:#6b7280;">${p.translation}</p>
            </div>
          `).join('')}
        </div>
        <div style="margin-bottom:16px;">
          <h4 style="color:#2563eb;margin-bottom:8px;">总结</h4>
          <p>${data.conclusion}</p>
        </div>
        <div>
          <h4 style="color:#2563eb;margin-bottom:8px;">完整逐字稿</h4>
          <div style="background:#f8fafc;padding:16px;border-radius:8px;font-size:15px;line-height:1.8;">
            ${data.full_text}
          </div>
        </div>
      `;

      resultDiv.style.display = '';
      resultDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
      showToast('立论生成成功', 'success');
    }
  } catch (err) {
    showToast('生成立论失败，请稍后重试', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '生成立论';
  }
}