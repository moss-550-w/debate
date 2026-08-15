'use strict';

/**
 * 作品集页面功能
 */

document.addEventListener('DOMContentLoaded', () => {
  loadTopics();
  loadPortfolio();

  document.getElementById('portfolioSubmitBtn').addEventListener('click', handlePortfolioSubmit);
  document.getElementById('portfolioAnalysisBtn').addEventListener('click', handlePortfolioAnalysis);
});

/**
 * 加载辩题到下拉框
 */
async function loadTopics() {
  try {
    const res = await apiRequest('/topics');
    if (res && res.code === 200) {
      const topics = res.data.list || res.data || [];
      const select = document.getElementById('portfolioTopic');
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
 * 提交作品集记录
 */
async function handlePortfolioSubmit() {
  const topic = document.getElementById('portfolioTopic').value;
  const type = document.getElementById('portfolioType').value;
  const position = document.getElementById('portfolioPosition').value;
  const content = document.getElementById('portfolioContent').value;

  if (!topic || !type || !position || !content) {
    showToast('请填写完整信息', 'error');
    return;
  }

  const btn = document.getElementById('portfolioSubmitBtn');
  btn.disabled = true;
  btn.textContent = '提交中...';

  try {
    const res = await apiRequest('/portfolio', {
      method: 'POST',
      body: JSON.stringify({ topic, type, position, content }),
    });

    if (res && res.code === 200) {
      document.getElementById('portfolioFeedback').innerHTML = `
        <div style="background:#f0fdf4;padding:16px;border-radius:8px;border:1px solid #bbf7d0;">
          <h4 style="color:#16a34a;margin-bottom:8px;">AI 反馈</h4>
          <p>${res.data?.feedback || res.message || '提交成功'}</p>
        </div>
      `;
      showToast('作品提交成功', 'success');
      loadPortfolio();
    } else {
      showToast(res?.message || '提交失败', 'error');
    }
  } catch (err) {
    showToast('提交失败，请稍后重试', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '提交作品';
  }
}

/**
 * 加载作品集列表
 */
async function loadPortfolio() {
  try {
    const res = await apiRequest('/portfolio/admin_demo');
    if (res && res.code === 200) {
      renderPortfolioList(res.data?.list || res.data || []);
    } else {
      document.getElementById('portfolioList').innerHTML = '<div class="empty-row">暂无作品数据</div>';
    }
  } catch (err) {
    console.error('加载作品集失败:', err);
    document.getElementById('portfolioList').innerHTML = '<div class="empty-row">加载失败</div>';
  }
}

/**
 * 渲染作品集卡片列表
 * @param {Array} list
 */
function renderPortfolioList(list) {
  const container = document.getElementById('portfolioList');
  if (!list || list.length === 0) {
    container.innerHTML = '<div class="empty-row">暂无作品数据</div>';
    return;
  }

  container.innerHTML = list.map(item => {
    const typeLabel = item.type === 'argument' ? '立论' : item.type === 'rebuttal' ? '驳论' : item.type || '其他';
    return `
      <div class="portfolio-card" style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="background:#dbeafe;color:#1d4ed8;padding:2px 10px;border-radius:12px;font-size:12px;">${typeLabel}</span>
          <span style="font-size:13px;color:#6b7280;">${formatDate(item.created_at)}</span>
        </div>
        <p style="color:#374151;margin-bottom:8px;line-height:1.5;">${(item.content || '').slice(0, 100)}${item.content && item.content.length > 100 ? '...' : ''}</p>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;">
          <span style="color:#f59e0b;font-weight:600;">评分：${item.score || '待评分'}</span>
          <span style="color:#6b7280;">${item.ai_feedback ? (item.ai_feedback.slice(0, 30) + (item.ai_feedback.length > 30 ? '...' : '')) : '暂无反馈'}</span>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * 风格分析
 */
async function handlePortfolioAnalysis() {
  const btn = document.getElementById('portfolioAnalysisBtn');
  btn.disabled = true;
  btn.textContent = '分析中...';

  try {
    const res = await apiRequest('/portfolio/admin_demo/analysis');
    if (res && res.code === 200) {
      const data = res.data;
      const container = document.getElementById('portfolioAnalysis');
      container.innerHTML = `
        <div style="background:#f8fafc;padding:20px;border-radius:12px;border:1px solid #e2e8f0;">
          <div style="margin-bottom:16px;">
            <h4 style="color:#2563eb;margin-bottom:8px;">风格标签</h4>
            <div>${(data.tags || []).map(t => `<span style="display:inline-block;background:#dbeafe;color:#1d4ed8;padding:4px 12px;border-radius:16px;font-size:13px;margin-right:6px;margin-bottom:6px;">${t}</span>`).join('')}</div>
          </div>
          <div style="margin-bottom:16px;">
            <h4 style="color:#16a34a;margin-bottom:8px;">优势</h4>
            <ul style="margin:0;padding-left:20px;">
              ${(data.strengths || []).map(s => `<li style="color:#374151;margin-bottom:4px;">${s}</li>`).join('')}
            </ul>
          </div>
          <div style="margin-bottom:16px;">
            <h4 style="color:#dc2626;margin-bottom:8px;">待改进</h4>
            <ul style="margin:0;padding-left:20px;">
              ${(data.weaknesses || []).map(w => `<li style="color:#374151;margin-bottom:4px;">${w}</li>`).join('')}
            </ul>
          </div>
          <div>
            <h4 style="color:#7c3aed;margin-bottom:8px;">推荐任务</h4>
            <ul style="margin:0;padding-left:20px;">
              ${(data.recommendations || []).map(r => `<li style="color:#374151;margin-bottom:4px;">${r}</li>`).join('')}
            </ul>
          </div>
        </div>
      `;
      showToast('分析完成', 'success');
    } else {
      showToast(res?.message || '分析失败', 'error');
    }
  } catch (err) {
    showToast('分析失败，请稍后重试', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '风格分析';
  }
}