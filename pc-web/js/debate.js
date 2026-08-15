/**
 * 辩题与立论相关逻辑
 */

document.addEventListener('DOMContentLoaded', () => {
  // 加载辩题列表
  loadTopics();

  // 生成立论
  document.getElementById('generateBtn').addEventListener('click', handleGenerate);
});

/**
 * 加载辩题列表（用于下拉选择和表格）
 */
async function loadTopics() {
  try {
    const res = await apiRequest('/health');

    // 填充下拉选择
    const select = document.getElementById('practiceTopic');
    // 模拟辩题数据
    const mockTopics = [
      { _id: '1', title: 'Should AI be used in education?', category: 'tech', difficulty: 'medium' },
      { _id: '2', title: 'Is recycling important for the environment?', category: 'environment', difficulty: 'easy' },
      { _id: '3', title: 'Should students have homework every day?', category: 'education', difficulty: 'easy' },
    ];

    select.innerHTML = '<option value="">-- 请选择 --</option>';
    mockTopics.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t._id;
      opt.textContent = `${t.title} (${t.difficulty})`;
      select.appendChild(opt);
    });

    // 填充辩题表格
    const tbody = document.getElementById('topicTableBody');
    tbody.innerHTML = mockTopics.map(t => `
      <tr>
        <td>${t.title}</td>
        <td>${t.category}</td>
        <td>${t.difficulty}</td>
        <td><span class="status-badge status-active">已上架</span></td>
        <td><button class="btn-primary" style="padding:4px 12px;font-size:13px;">编辑</button></td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('加载辩题失败:', err);
  }
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
  btn.textContent = '生成中...';

  try {
    const res = await apiRequest('/generate', {
      method: 'POST',
      body: JSON.stringify({
        topic_id: topicId,
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
      showToast('立论生成成功', 'success');
    }
  } catch (err) {
    showToast('生成立论失败', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '生成立论';
  }
}