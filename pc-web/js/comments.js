'use strict';

/**
 * 评论页面功能
 */

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
    const res = await apiRequest('/topics');
    if (res && res.code === 200) {
      const topics = res.data.list || res.data || [];
      const select = document.getElementById('assignmentTopic');
      select.innerHTML = '<option value="">-- 请选择辩题 --</option>';
      topics.forEach(t => {
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
  const requirement = document.getElementById('assignmentRequirement').value.trim();
  const deadline = document.getElementById('assignmentDeadline').value;

  if (!title || !topic || !requirement || !deadline) {
    showToast('请填写完整信息', 'error');
    return;
  }

  const btn = document.getElementById('saveAssignmentBtn');
  btn.disabled = true;
  btn.textContent = '保存中...';

  try {
    const res = await apiRequest('/comments/teacher-assignment', {
      method: 'POST',
      body: JSON.stringify({ title, topic_id: topic, requirement, deadline }),
    });

    if (res && res.code === 200) {
      showToast('议题发布成功', 'success');
      document.getElementById('assignmentForm').style.display = 'none';
      document.getElementById('assignmentTitle').value = '';
      document.getElementById('assignmentRequirement').value = '';
      document.getElementById('assignmentDeadline').value = '';
      loadAssignments();
    } else {
      showToast(res?.message || '发布失败', 'error');
    }
  } catch (err) {
    showToast('发布失败，请稍后重试', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '保存议题';
  }
}

/**
 * 加载议题列表
 */
async function loadAssignments() {
  try {
    const res = await apiRequest('/comments/assignments');
    if (res && res.code === 200) {
      renderAssignmentList(res.data?.list || res.data || []);
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
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h4 style="margin:0;color:#1e293b;">${item.title}</h4>
        <span style="font-size:13px;color:#6b7280;">提交数：${item.submission_count || 0}</span>
      </div>
      <div style="font-size:13px;color:#6b7280;margin-bottom:4px;">
        辩题：${item.topic_title || '未知'}
      </div>
      <div style="font-size:13px;color:#6b7280;margin-bottom:4px;">
        要求：${(item.requirement || '').slice(0, 80)}${item.requirement && item.requirement.length > 80 ? '...' : ''}
      </div>
      <div style="font-size:13px;color:#6b7280;margin-bottom:12px;">
        截止日期：${formatDate(item.deadline)}
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
      const submissions = res.data?.list || res.data || [];
      let html = `
        <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;">
          <div style="background:#fff;border-radius:16px;padding:24px;max-width:600px;width:90%;max-height:80vh;overflow-y:auto;">
            <h3 style="margin-bottom:16px;color:#1e293b;">提交列表</h3>
      `;

      if (submissions.length === 0) {
        html += '<p style="color:#6b7280;">暂无提交</p>';
      } else {
        html += submissions.map(s => {
          const reviewStatus = s.reviewed ? '<span style="color:#1e40af;font-weight:600;">已点评</span>' : '<span style="color:#64748b;font-weight:600;">待点评</span>';
          return `
            <div style="background:#f8fafc;border-radius:8px;padding:12px;margin-bottom:8px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <span style="font-weight:600;color:#1e293b;">${s.submitter || '匿名'}</span>
                ${reviewStatus}
              </div>
              <div style="font-size:13px;color:#6b7280;margin-bottom:4px;">${(s.content || '').slice(0, 60)}${s.content && s.content.length > 60 ? '...' : ''}</div>
              <div style="font-size:13px;color:#2563eb;font-weight:600;">AI评分：${s.ai_score || '待评分'}</div>
            </div>
          `;
        }).join('');
      }

      html += `
            <div style="text-align:right;margin-top:16px;">
              <button class="btn-primary" onclick="this.closest('div[style]').remove()" style="padding:8px 24px;">关闭</button>
            </div>
          </div>
        </div>
      `;

      const overlay = document.createElement('div');
      overlay.innerHTML = html;
      document.body.appendChild(overlay.firstElementChild);
    } else {
      showToast(res?.message || '加载提交失败', 'error');
    }
  } catch (err) {
    showToast('加载提交失败，请稍后重试', 'error');
  }
}