'use strict';

/**
 * 赛事页面功能
 */

document.addEventListener('DOMContentLoaded', () => {
  loadTournamentList();

  document.getElementById('createTournamentBtn').addEventListener('click', () => {
    document.getElementById('tournamentForm').style.display = '';
  });
  document.getElementById('cancelTournamentBtn').addEventListener('click', () => {
    document.getElementById('tournamentForm').style.display = 'none';
  });
  document.getElementById('saveTournamentBtn').addEventListener('click', handleCreateTournament);
});

/**
 * 创建赛事
 */
async function handleCreateTournament() {
  const name = document.getElementById('tournamentName').value.trim();
  const format = document.getElementById('tournamentFormat').value;
  const maxTeams = parseInt(document.getElementById('tournamentMaxTeams').value, 10);
  const deadline = document.getElementById('tournamentDeadline').value;

  if (!name || !format || !maxTeams || !deadline) {
    showToast('请填写完整信息', 'error');
    return;
  }

  const btn = document.getElementById('saveTournamentBtn');
  btn.disabled = true;
  btn.textContent = '保存中...';

  try {
    const res = await apiRequest('/tournament/create', {
      method: 'POST',
      body: JSON.stringify({ name, format, max_teams: maxTeams, deadline }),
    });

    if (res && res.code === 200) {
      showToast('赛事创建成功', 'success');
      document.getElementById('tournamentForm').style.display = 'none';
      document.getElementById('tournamentName').value = '';
      document.getElementById('tournamentMaxTeams').value = '';
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
      renderTournamentList(res.data?.list || res.data || []);
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
    single_elimination: '单败淘汰',
    double_elimination: '双败淘汰',
    round_robin: '循环赛',
    swiss: '瑞士轮',
  };

  const statusLabels = {
    registering: '报名中',
    ongoing: '进行中',
    finished: '已结束',
  };

  const statusColors = {
    registering: '#3b82f6',
    ongoing: '#1e40af',
    finished: '#64748b',
  };

  container.innerHTML = list.map(item => `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h4 style="margin:0;color:#1e293b;">${item.name}</h4>
        <span style="color:${statusColors[item.status] || '#6b7280'};font-weight:600;font-size:13px;">${statusLabels[item.status] || item.status}</span>
      </div>
      <div style="display:flex;gap:16px;font-size:13px;color:#6b7280;margin-bottom:12px;">
        <span>赛制：${formatLabels[item.format] || item.format}</span>
        <span>队伍：${item.current_teams || 0}/${item.max_teams}</span>
        <span>报名截止：${formatDate(item.deadline)}</span>
      </div>
      <button class="btn-primary" style="padding:6px 16px;font-size:13px;" onclick="viewTournamentTeams('${item._id}')">查看队伍</button>
    </div>
  `).join('');
}

/**
 * 查看赛事队伍
 * @param {string} tournamentId
 */
async function viewTournamentTeams(tournamentId) {
  try {
    const res = await apiRequest(`/tournament/${tournamentId}/teams`);
    if (res && res.code === 200) {
      const teams = res.data?.list || res.data || [];
      let html = `
        <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;">
          <div style="background:#fff;border-radius:16px;padding:24px;max-width:600px;width:90%;max-height:80vh;overflow-y:auto;">
            <h3 style="margin-bottom:16px;color:#1e293b;">参赛队伍</h3>
      `;

      if (teams.length === 0) {
        html += '<p style="color:#6b7280;">暂无队伍</p>';
      } else {
        html += teams.map(t => `
          <div style="background:#f8fafc;border-radius:8px;padding:12px;margin-bottom:8px;">
            <div style="font-weight:600;color:#1e293b;margin-bottom:4px;">${t.name}</div>
            ${t.style_analysis ? `<div style="font-size:13px;color:#6b7280;">风格分析：${t.style_analysis}</div>` : ''}
          </div>
        `).join('');
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
      showToast(res?.message || '加载队伍失败', 'error');
    }
  } catch (err) {
    showToast('加载队伍失败，请稍后重试', 'error');
  }
}