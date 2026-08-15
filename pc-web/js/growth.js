/**
 * 成长数据与看板逻辑
 */

document.addEventListener('DOMContentLoaded', () => {
  // 加载看板数据
  loadDashboard();
});

/**
 * 加载看板统计
 */
async function loadDashboard() {
  try {
    // 模拟数据
    const mockStats = {
      totalUsers: 12,
      totalPractices: 45,
      totalDuration: 3600,
      avgScore: 76,
    };

    document.getElementById('statUsers').textContent = mockStats.totalUsers;
    document.getElementById('statPractices').textContent = mockStats.totalPractices;
    document.getElementById('statDuration').textContent = Math.round(mockStats.totalDuration / 60);
    document.getElementById('statAvgScore').textContent = mockStats.avgScore;

    // 加载用户列表
    loadUsers();
  } catch (err) {
    console.error('加载看板数据失败:', err);
  }
}

/**
 * 加载用户列表
 */
async function loadUsers() {
  const mockUsers = [
    { nickname: '小明', role: 'pupil', grade: 'G5', total_count: 15, total_duration: 1200, created_at: '2026-08-01' },
    { nickname: '小红', role: 'pupil', grade: 'G4', total_count: 20, total_duration: 1800, created_at: '2026-08-02' },
    { nickname: '李老师', role: 'college', grade: '', total_count: 10, total_duration: 600, created_at: '2026-08-03' },
  ];

  const tbody = document.getElementById('userTableBody');
  tbody.innerHTML = mockUsers.map(u => `
    <tr>
      <td>${u.nickname || '未设置'}</td>
      <td>${u.role === 'pupil' ? '小学生' : '大学生'}</td>
      <td>${u.grade || '-'}</td>
      <td>${u.total_count}</td>
      <td>${Math.round(u.total_duration / 60)}分钟</td>
      <td>${formatDate(u.created_at)}</td>
    </tr>
  `).join('');
}