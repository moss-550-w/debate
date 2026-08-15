'use strict';

/**
 * 对练页面功能
 */

let sparringSessionId = null;
let sparringMessages = [];

document.addEventListener('DOMContentLoaded', () => {
  loadTopics();
  loadSparringHistory();

  document.querySelectorAll('.style-card').forEach(card => {
    card.addEventListener('click', handleStyleCardClick);
  });

  document.getElementById('startSparringBtn').addEventListener('click', handleStartSparring);
  document.getElementById('endSparringBtn').addEventListener('click', handleEndSparring);
});

/**
 * 加载辩题到下拉框
 */
async function loadTopics() {
  try {
    const res = await apiRequest('/topics');
    if (res && res.code === 200) {
      const topics = res.data.list || res.data || [];
      const select = document.getElementById('sparringTopic');
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
 * 对手风格卡片点击
 */
function handleStyleCardClick() {
  document.querySelectorAll('.style-card').forEach(c => {
    c.classList.remove('active');
    c.style.border = '1px solid #e5e7eb';
  });
  this.classList.add('active');
  this.style.border = '2px solid var(--primary)';
}

/**
 * 开始对练
 */
async function handleStartSparring() {
  const topic = document.getElementById('sparringTopic').value;
  const styleCard = document.querySelector('.style-card.active');
  const position = document.querySelector('input[name="sparringPosition"]:checked');

  if (!topic) {
    showToast('请选择辩题', 'error');
    return;
  }
  if (!styleCard) {
    showToast('请选择对手风格', 'error');
    return;
  }
  if (!position) {
    showToast('请选择持方', 'error');
    return;
  }

  const btn = document.getElementById('startSparringBtn');
  btn.disabled = true;
  btn.textContent = '开始中...';

  try {
    const res = await apiRequest('/debate/start', {
      method: 'POST',
      body: JSON.stringify({
        topic_id: topic,
        style: styleCard.dataset.style,
        position: position.value,
      }),
    });

    if (res && res.code === 200) {
      sparringSessionId = res.data.session_id;
      sparringMessages = [];

      document.getElementById('sparringSetup').style.display = 'none';
      document.getElementById('sparringArea').style.display = '';

      const chat = document.getElementById('sparringChat');
      chat.innerHTML = '';

      appendMessage('ai', res.data.opening || '让我们开始辩论吧！');
      showToast('对练开始', 'success');
    } else {
      showToast(res?.message || '开始对练失败', 'error');
    }
  } catch (err) {
    showToast('开始对练失败，请稍后重试', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '开始对练';
  }
}

/**
 * 发送消息（全局可访问，供 onkeydown 调用）
 */
async function sendSparringMessage() {
  const input = document.getElementById('sparringInput');
  const text = input.value.trim();

  if (!text) return;
  if (!sparringSessionId) {
    showToast('请先开始对练', 'error');
    return;
  }

  input.value = '';
  appendMessage('user', text);

  try {
    const res = await apiRequest('/debate', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sparringSessionId,
        message: text,
      }),
    });

    if (res && res.code === 200) {
      appendMessage('ai', res.data.reply || '');

      if (res.data.rebuttal_rate !== undefined) {
        document.getElementById('sparringRebuttalRate').textContent = res.data.rebuttal_rate;
      }
      if (res.data.stall_count !== undefined) {
        document.getElementById('sparringStallCount').textContent = res.data.stall_count;
      }
    } else {
      showToast(res?.message || '发送失败', 'error');
    }
  } catch (err) {
    showToast('发送失败，请稍后重试', 'error');
  }
}

/**
 * 追加消息到对话区域
 * @param {'user'|'ai'} role
 * @param {string} content
 */
function appendMessage(role, content) {
  const chat = document.getElementById('sparringChat');
  const isUser = role === 'user';

  const div = document.createElement('div');
  div.style.cssText = `
    display:flex;${isUser ? 'justify-content:flex-end' : 'justify-content:flex-start'};
    margin-bottom:12px;
  `;

  const bubble = document.createElement('div');
  bubble.style.cssText = `
    max-width:70%;padding:12px 16px;border-radius:12px;line-height:1.6;
    font-size:14px;
    background:${isUser ? '#2563eb' : '#fff'};
    color:${isUser ? '#fff' : '#374151'};
    border:${isUser ? 'none' : '1px solid #e5e7eb'};
  `;

  if (!isUser) {
    const styleIcon = document.querySelector('.style-card.active');
    const iconHtml = styleIcon ? `<span style="margin-right:6px;">${styleIcon.dataset.icon || '🤖'}</span>` : '<span style="margin-right:6px;">🤖</span>';
    const nameHtml = styleIcon ? `<span style="font-weight:600;margin-right:8px;">${styleIcon.dataset.name || 'AI'}</span>` : '';
    bubble.innerHTML = iconHtml + nameHtml + content;
  } else {
    bubble.textContent = content;
  }

  div.appendChild(bubble);
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

/**
 * 结束对练
 */
function handleEndSparring() {
  sparringSessionId = null;
  sparringMessages = [];

  document.getElementById('sparringArea').style.display = 'none';
  document.getElementById('sparringSetup').style.display = '';
  document.getElementById('sparringChat').innerHTML = '';
  document.getElementById('sparringRebuttalRate').textContent = '0';
  document.getElementById('sparringStallCount').textContent = '0';

  showToast('对练已结束', 'info');
  loadSparringHistory();
}

/**
 * 加载对练历史
 */
async function loadSparringHistory() {
  try {
    const res = await apiRequest('/debate/sessions/admin_demo');
    if (res && res.code === 200) {
      renderSparringHistory(res.data?.list || res.data || []);
    }
  } catch (err) {
    console.error('加载对练历史失败:', err);
  }
}

/**
 * 渲染对练历史列表
 * @param {Array} list
 */
function renderSparringHistory(list) {
  const container = document.getElementById('sparringHistoryList');
  if (!list || list.length === 0) {
    container.innerHTML = '<div class="empty-row">暂无对练历史</div>';
    return;
  }

  container.innerHTML = list.map(item => `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-weight:600;color:#374151;">${item.topic_title || '辩题'}</span>
        <span style="font-size:13px;color:#6b7280;">${formatDate(item.created_at)}</span>
      </div>
      <div style="display:flex;gap:16px;font-size:13px;color:#6b7280;">
        <span>对手风格：${item.style || '未知'}</span>
        <span>消息数：${item.message_count || 0}</span>
      </div>
    </div>
  `).join('');
}