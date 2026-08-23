'use strict';

/**
 * 赛事页面功能
 */

document.addEventListener('DOMContentLoaded', () => {
  loadTournamentList();
  loadTournamentTopicOptions();

  document.getElementById('createTournamentBtn').addEventListener('click', () => {
    document.getElementById('tournamentForm').style.display = '';
    loadTournamentTopicOptions();
  });
  document.getElementById('cancelTournamentBtn').addEventListener('click', () => {
    document.getElementById('tournamentForm').style.display = 'none';
  });
  document.getElementById('saveTournamentBtn').addEventListener('click', handleCreateTournament);
});

/**
 * 加载辩题到赛事辩题池多选框
 */
async function loadTournamentTopicOptions() {
  try {
    const res = await apiRequest('/topics?size=100');
    if (res && res.code === 200) {
      const topics = res.data?.list || [];
      const select = document.getElementById('tournamentTopics');
      select.innerHTML = '';
      topics.filter(t => t.status === 1).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t._id;
        opt.textContent = t.title;
        select.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('加载辩题池失败:', err);
  }
}

/**
 * 创建赛事
 */
async function handleCreateTournament() {
  const name = document.getElementById('tournamentName').value.trim();
  const format = document.getElementById('tournamentFormat').value;
  const maxTeams = parseInt(document.getElementById('tournamentMaxTeams').value, 10);
  const teamSize = parseInt(document.getElementById('tournamentTeamSize').value, 10) || 2;
  const deadline = document.getElementById('tournamentDeadline').value;
  const topicIds = Array.from(document.getElementById('tournamentTopics').selectedOptions).map(o => o.value);

  if (!name || !format || !maxTeams) {
    showToast('请填写赛事名称、赛制和最大队伍数', 'error');
    return;
  }
  if (topicIds.length === 0) {
    showToast('请至少选择 1 个辩题（按住 Ctrl 多选）', 'error');
    return;
  }

  const btn = document.getElementById('saveTournamentBtn');
  btn.disabled = true;
  btn.textContent = '保存中...';

  try {
    const res = await apiRequest('/tournament/create', {
      method: 'POST',
      body: JSON.stringify({
        name,
        format,
        topic_ids: topicIds,
        max_teams: maxTeams,
        team_size: teamSize,
        registration_deadline: deadline || null,
      }),
    });

    if (res && res.code === 200) {
      showToast('赛事创建成功', 'success');
      document.getElementById('tournamentForm').style.display = 'none';
      document.getElementById('tournamentName').value = '';
      document.getElementById('tournamentMaxTeams').value = '8';
      document.getElementById('tournamentDeadline').value = '';
      loadTournamentList();
    } else {
      showToast(res?.message || '创建失败', 'error');
    }
  } catch (err) {
    showToast('创建失败，请稍后重试', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '保存赛事';
  }
}

/**
 * 加载赛事列表
 */
async function loadTournamentList() {
  try {
    const res = await apiRequest('/tournament/list');
    if (res && res.code === 200) {
      const list = res.data?.tournaments || res.data?.list || [];
      renderTournamentList(Array.isArray(list) ? list : []);
    } else {
      document.getElementById('tournamentList').innerHTML = '<div class="empty-row">暂无赛事数据</div>';
    }
  } catch (err) {
    console.error('加载赛事列表失败:', err);
    document.getElementById('tournamentList').innerHTML = '<div class="empty-row">加载失败</div>';
  }
}

/**
 * 渲染赛事卡片列表
 * @param {Array} list
 */
function renderTournamentList(list) {
  const container = document.getElementById('tournamentList');
  if (!list || list.length === 0) {
    container.innerHTML = '<div class="empty-row">暂无赛事数据</div>';
    return;
  }

  const formatLabels = {
    round_robin: '循环赛',
    points: '积分赛',
    single_elimination: '单败淘汰',
    double_elimination: '双败淘汰',
    swiss: '瑞士轮',
  };

  const statusLabels = {
    open: '报名中',
    registering: '报名中',
    ongoing: '进行中',
    finished: '已结束',
  };

  const statusColors = {
    open: '#3b82f6',
    registering: '#3b82f6',
    ongoing: '#1e40af',
    finished: '#64748b',
  };

  container.innerHTML = list.map(item => `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:12px;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h4 style="margin:0;color:#0f172a;">${escapeHtml(item.name)}</h4>
        <span style="color:${statusColors[item.status] || '#64748b'};font-weight:600;font-size:13px;">${statusLabels[item.status] || item.status}</span>
      </div>
      <div style="display:flex;gap:16px;font-size:13px;color:#475569;margin-bottom:12px;flex-wrap:wrap;">
        <span>赛制：${formatLabels[item.format] || item.format}</span>
        <span>辩题：${(item.topic_ids || []).length} 个</span>
        <span>每队：${item.team_size || 2} 人</span>
        <span>队伍上限：${item.max_teams}</span>
        ${item.registration_deadline ? `<span>报名截止：${formatDate(item.registration_deadline)}</span>` : ''}
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button class="btn-primary" style="padding:6px 16px;font-size:13px;" onclick="viewTournamentTeams('${item._id}')">查看队伍</button>
        <button class="btn-danger" style="padding:6px 16px;font-size:13px;" onclick="deleteTournament('${item._id}')">删除赛事</button>
      </div>
    </div>
  `).join('');
}

/**
 * 删除赛事及其报名队伍
 * @param {string} tournamentId
 */
async function deleteTournament(tournamentId) {
  if (!tournamentId) return;
  const confirmed = window.confirm('确定删除该赛事吗？赛事及其报名队伍将一并删除，删除后无法恢复。');
  if (!confirmed) return;

  const res = await apiRequest(`/tournament/${encodeURIComponent(tournamentId)}`, {
    method: 'DELETE',
  });
  if (res && res.code === 200) {
    showToast('赛事已删除', 'success');
    await loadTournamentList();
  } else {
    showToast(res?.message || '删除赛事失败', 'error');
  }
}

/**
 * 查看赛事队伍
 * @param {string} tournamentId
 */
async function viewTournamentTeams(tournamentId) {
  try {
    const res = await apiRequest(`/tournament/${tournamentId}/teams`);
    if (res && res.code === 200) {
      const teams = res.data?.teams || [];
      let html = `
        <div id="teamsModalOverlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;">
          <div style="background:#fff;border-radius:16px;padding:24px;max-width:600px;width:90%;max-height:80vh;overflow-y:auto;">
            <h3 style="margin-bottom:16px;color:#0f172a;">参赛队伍（${res.data.tournament || ''}）</h3>
      `;

      if (teams.length === 0) {
        html += '<p style="color:#64748b;">暂无队伍报名</p>';
      } else {
        html += teams.map(t => `
          <div style="background:#f8fafc;border-radius:8px;padding:12px;margin-bottom:8px;">
            <div style="font-weight:600;color:#0f172a;margin-bottom:4px;">${escapeHtml(t.team_name || t.name || '')}</div>
            <div style="font-size:13px;color:#475569;">成员：${(t.members || []).join('、') || '-'}</div>
            ${t.compatibility ? `<div style="font-size:13px;color:#2563eb;margin-top:4px;">互补评分：${t.compatibility.compatibility_score ?? '-'}</div>` : ''}
          </div>
        `).join('');
      }

      html += `
            <div style="text-align:right;margin-top:16px;">
              <button class="btn-primary" onclick="document.getElementById('teamsModalOverlay').remove()" style="padding:8px 24px;">关闭</button>
            </div>
          </div>
        </div>
      `;

      const wrapper = document.createElement('div');
      wrapper.innerHTML = html;
      document.body.appendChild(wrapper.firstElementChild);
    } else {
      showToast(res?.message || '加载队伍失败', 'error');
    }
  } catch (err) {
    showToast('加载队伍失败，请稍后重试', 'error');
  }
}
