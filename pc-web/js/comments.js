'use strict';

/**
 * 评论页面功能
 */

// 缓存辩题映射 topic_id -> title
let assignmentTopicMap = {};

document.addEventListener('DOMContentLoaded', () => {
  loadAssignments();

  document.getElementById('createAssignmentBtn').addEventListener('click', () => {
    document.getElementById('assignmentForm').style.display = '';
    loadAssignmentTopics();
  });
  document.getElementById('cancelAssignmentBtn').addEventListener('click', () => {
    document.getElementById('assignmentForm').style.display = 'none';
  });
  document.getElementById('saveAssignmentBtn').addEventListener('click', handleCreateAssignment);
});

/**
 * 加载辩题到议题下拉框
 */
async function loadAssignmentTopics() {
  try {
    const res = await apiRequest('/topics?size=200');
    if (res && res.code === 200) {
      const topics = res.data.list || res.data || [];
      assignmentTopicMap = {};
      const select = document.getElementById('assignmentTopic');
      select.innerHTML = '<option value="">-- 请选择辩题 --</option>';
      topics.forEach(t => {
        assignmentTopicMap[t._id] = t.title;
        const opt = document.createElement('option');
        opt.value = t._id;
        opt.textContent = t.title;
        select.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('加载辩题失败:', err);
  }
}

/**
 * 创建议题
 */
async function handleCreateAssignment() {
  const title = document.getElementById('assignmentTitle').value.trim();
  const topic = document.getElementById('assignmentTopic').value;
  const requirement = document.getElementById('assignmentRequirements').value.trim();
  const deadline = document.getElementById('assignmentDeadline').value;

  if (!title || !topic || !requirement) {
    showToast('请填写议题标题、辩题和要求说明', 'error');
    return;
  }

  const btn = document.getElementById('saveAssignmentBtn');
  btn.disabled = true;
  btn.textContent = '保存中...';

  try {
    const res = await apiRequest('/comments/teacher-assignment', {
      method: 'POST',
      body: JSON.stringify({
        title,
        topic_id: topic,
        description: requirement,
        requirements: requirement,
        deadline: deadline || null,
      }),
    });

    if (res && res.code === 200) {
      showToast('议题发布成功', 'success');
      document.getElementById('assignmentForm').style.display = 'none';
      document.getElementById('assignmentTitle').value = '';
      document.getElementById('assignmentRequirements').value = '';
      document.getElementById('assignmentDeadline').value = '';
      loadAssignments();
    } else {
      showToast(res?.message || '发布失败', 'error');
    }
  } catch (err) {
    showToast('发布失败，请稍后重试', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '发布';
  }
}

/**
 * 加载议题列表
 */
async function loadAssignments() {
  try {
    // 确保辩题映射已加载（用于渲染辩题标题）
    if (Object.keys(assignmentTopicMap).length === 0) {
      await loadAssignmentTopics();
    }
    const res = await apiRequest('/comments/assignments');
    if (res && res.code === 200) {
      const list = res.data?.assignments || res.data?.list || [];
      renderAssignmentList(Array.isArray(list) ? list : []);
    } else {
      document.getElementById('assignmentList').innerHTML = '<div class="empty-row">暂无议题数据</div>';
    }
  } catch (err) {
    console.error('加载议题列表失败:', err);
    document.getElementById('assignmentList').innerHTML = '<div class="empty-row">加载失败</div>';
  }
}

/**
 * 渲染议题卡片列表
 * @param {Array} list
 */
function renderAssignmentList(list) {
  const container = document.getElementById('assignmentList');
  if (!list || list.length === 0) {
    container.innerHTML = '<div class="empty-row">暂无议题数据</div>';
    return;
  }

  container.innerHTML = list.map(item => `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:12px;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h4 style="margin:0;color:#0f172a;">${escapeHtml(item.title)}</h4>
        <span style="font-size:13px;color:${item.is_open ? '#1e40af' : '#64748b'};font-weight:600;">${item.is_open ? '开放中' : '已截止'}</span>
      </div>
      <div style="font-size:13px;color:#475569;margin-bottom:4px;">
        辩题：${escapeHtml(assignmentTopicMap[item.topic_id] || item.topic_id || '未知')}
      </div>
      <div style="font-size:13px;color:#475569;margin-bottom:4px;">
        要求：${escapeHtml((item.requirements || item.description || '').slice(0, 80))}
      </div>
      <div style="font-size:13px;color:#475569;margin-bottom:12px;">
        ${item.deadline ? `截止日期：${formatDate(item.deadline)}` : '无截止日期'}
      </div>
      <button class="btn-primary" style="padding:6px 16px;font-size:13px;" onclick="viewSubmissions('${item._id}')">查看提交</button>
    </div>
  `).join('');
}

/**
 * 查看提交列表
 * @param {string} assignmentId
 */
async function viewSubmissions(assignmentId) {
  try {
    const res = await apiRequest(`/comments/assignment/${assignmentId}/submissions`);
    if (res && res.code === 200) {
      const submissions = res.data?.submissions || [];
      let html = `
        <div id="submissionsModalOverlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;">
          <div style="background:#fff;border-radius:16px;padding:24px;max-width:600px;width:90%;max-height:80vh;overflow-y:auto;">
            <h3 style="margin-bottom:16px;color:#0f172a;">提交列表（${res.data.assignment?.title || ''}，共 ${res.data.total} 条）</h3>
      `;

      if (submissions.length === 0) {
        html += '<p style="color:#64748b;">暂无提交</p>';
      } else {
        html += submissions.map(s => {
          const reviewStatus = s.has_teacher_review
            ? '<span style="color:#1e40af;font-weight:600;">已点评</span>'
            : '<span style="color:#64748b;font-weight:600;">待点评</span>';
          const aiScore = s.ai_analysis?.judge_score;
          return `
            <div style="background:#f8fafc;border-radius:8px;padding:12px;margin-bottom:8px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <span style="font-weight:600;color:#0f172a;">${escapeHtml(s.nickname || s.user_id || '匿名')}</span>
                ${reviewStatus}
              </div>
              <div style="font-size:13px;color:#475569;margin-bottom:4px;">${escapeHtml((s.notes || '').slice(0, 60))}${s.notes && s.notes.length > 60 ? '...' : ''}</div>
              <div style="font-size:13px;color:#2563eb;font-weight:600;">AI评分：${aiScore || '待评分'}</div>
            </div>
          `;
        }).join('');
      }

      html += `
            <div style="text-align:right;margin-top:16px;">
              <button class="btn-primary" onclick="document.getElementById('submissionsModalOverlay').remove()" style="padding:8px 24px;">关闭</button>
            </div>
          </div>
        </div>
      `;

      const wrapper = document.createElement('div');
      wrapper.innerHTML = html;
      document.body.appendChild(wrapper.firstElementChild);
    } else {
      showToast(res?.message || '加载提交失败', 'error');
    }
  } catch (err) {
    showToast('加载提交失败，请稍后重试', 'error');
  }
}