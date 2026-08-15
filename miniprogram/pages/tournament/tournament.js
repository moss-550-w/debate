const { request } = require('../../utils/request');

const FORMAT_LABELS = {
  round_robin: '循环赛',
  points: '积分赛',
};

Page({
  data: {
    tournaments: [],
    selectedTournament: null,
    showDetail: false,
    showRegister: false,
    showTeamMatch: false,
    registerForm: {
      team_name: '',
      members: [''],
      member_styles: [''],
    },
    styleOptions: [
      { value: 'data_driven', label: '数据驱动型' },
      { value: 'value_driven', label: '价值驱动型' },
      { value: 'logic_focused', label: '逻辑导向型' },
      { value: 'balanced', label: '均衡型' },
    ],
    matchRecommendations: null,
    loading: true,
    activeTab: 'list', // list | detail | teams
  },

  onShow() {
    this.loadTournaments();
  },

  async loadTournaments() {
    this.setData({ loading: true });
    try {
      const res = await request('/tournament/list?size=50');
      if (res.code === 200) {
        const tournaments = (res.data.tournaments || []).map(t => ({
          ...t,
          formatLabel: FORMAT_LABELS[t.format] || t.format,
          topicCount: (t.topic_ids && t.topic_ids.length) || 0,
        }));
        this.setData({ tournaments });
      }
    } catch (err) {
      console.error('加载赛事列表失败:', err);
    } finally {
      this.setData({ loading: false });
    }
  },

  async viewDetail(e) {
    const id = e.currentTarget.dataset.id;
    try {
      wx.showLoading({ title: '加载中...' });
      const res = await request(`/tournament/${id}`);
      wx.hideLoading();
      if (res.code === 200) {
        const d = res.data;
        const teams = d.teams || [];
        const st = {
          _id: d._id || '',
          name: d.name || '',
          formatLabel: FORMAT_LABELS[d.format] || d.format || '',
          teamCount: d.team_count || 0,
          maxTeams: d.max_teams || 0,
          teamSize: d.team_size || 0,
          status: d.status || 'closed',
          statusLabel: d.status === 'open' ? '报名中' : '已结束',
          hasRules: !!(d.rules),
          rules: d.rules || '',
          teams: teams,
          teamsCount: teams.length,
          isOpen: d.status === 'open',
        };
        this.setData({
          selectedTournament: st,
          showDetail: true,
        });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  closeDetail() {
    this.setData({ showDetail: false, selectedTournament: null });
  },

  openRegister() {
    this.setData({
      showRegister: true,
      registerForm: { team_name: '', members: [''], member_styles: [''] },
    });
  },

  closeRegister() {
    this.setData({ showRegister: false });
  },

  inputChange(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ ['registerForm.' + field]: e.detail.value });
  },

  memberInputChange(e) {
    const { index, field } = e.currentTarget.dataset;
    const key = field === 'name' ? 'members' : 'member_styles';
    const list = [...this.data.registerForm[field === 'name' ? 'members' : 'member_styles']];
    list[index] = e.detail.value;
    this.setData({ ['registerForm.' + (field === 'name' ? 'members' : 'member_styles')]: list });
  },

  addMember() {
    const members = [...this.data.registerForm.members, ''];
    const styles = [...this.data.registerForm.member_styles, ''];
    this.setData({ 'registerForm.members': members, 'registerForm.member_styles': styles });
  },

  removeMember() {
    if (this.data.registerForm.members.length <= 1) return;
    const members = this.data.registerForm.members.slice(0, -1);
    const styles = this.data.registerForm.member_styles.slice(0, -1);
    this.setData({ 'registerForm.members': members, 'registerForm.member_styles': styles });
  },

  selectStyle(e) {
    const { index, value } = e.currentTarget.dataset;
    const styles = [...this.data.registerForm.member_styles];
    styles[index] = value;
    this.setData({ ['registerForm.member_styles']: styles });
  },

  async submitRegister() {
    const form = this.data.registerForm;
    if (!form.team_name || form.members.some(m => !m.trim())) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' });
      return;
    }
    try {
      wx.showLoading({ title: '报名中...' });
      const res = await request(`/tournament/${this.data.selectedTournament._id}/register`, {
        method: 'POST',
        data: {
          team_name: form.team_name,
          members: form.members.filter(m => m.trim()),
          member_styles: form.member_styles.filter(s => s),
        },
      });
      wx.hideLoading();
      if (res.code === 200) {
        wx.showToast({ title: '报名成功', icon: 'success' });
        this.setData({ showRegister: false });
        this.viewDetail({ currentTarget: { dataset: { id: this.data.selectedTournament._id } } });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '报名失败', icon: 'none' });
    }
  },

  async getTeamMatch() {
    try {
      wx.showLoading({ title: '分析中...' });
      const res = await request('/tournament/auto-match', {
        method: 'POST',
        data: {
          preferred_styles: ['data_driven'],
        },
      });
      wx.hideLoading();
      if (res.code === 200) {
        const d = res.data;
        const mr = {
          yourStyleLabel: (d.your_style && d.your_style.label) || '分析中',
          recommendations: d.recommendations || [],
        };
        this.setData({
          showTeamMatch: true,
          matchRecommendations: mr,
        });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '分析失败', icon: 'none' });
    }
  },

  closeTeamMatch() {
    this.setData({ showTeamMatch: false, matchRecommendations: null });
  },

  goBack() {
    wx.navigateBack();
  },
});