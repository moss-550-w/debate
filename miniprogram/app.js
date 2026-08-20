const API_MODE = 'cloud-function';
const API_BASE_URLS = {
  local: 'http://127.0.0.1:3000/api',
  lan: 'http://192.168.3.99:3000/api',
  cloud: 'https://debate-api-297740-11-1469475059.sh.run.tcloudbase.com/api',
  'cloud-function': '',
};

App({
  globalData: {
    userInfo: null,
    openid: '',
    apiBaseUrl: API_BASE_URLS[API_MODE],
    apiMode: API_MODE,
    cloudFunctionName: 'apiGateway',
  },

  onLaunch() {
    wx.cloud.init({
      env: 'cloud1-d8g0k0m526d61652a',
      traceUser: true,
    });
    this.autoLogin();
  },

  autoLogin() {
    let openid = wx.getStorageSync('openid');
    let userInfo = wx.getStorageSync('userInfo');
    if (!openid) {
      openid = 'mp_user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      userInfo = {
        _id: openid,
        openid: openid,
        nickname: '小辩手',
        role: 'student',
        grade: 'G5',
        ability_baseline: { pronunciation: 55, fluency: 50, logic: 45, vocabulary: 60, reaction: 40 },
        ability_latest: { pronunciation: 78, fluency: 72, logic: 68, vocabulary: 80, reaction: 70 },
        total_count: 15,
        total_duration: 1800,
        status: 'active',
        created_at: new Date().toISOString(),
        agreement_version: 'v1',
      };
      wx.setStorageSync('openid', openid);
      wx.setStorageSync('token', openid);
      wx.setStorageSync('userInfo', userInfo);
    }
    this.globalData.openid = openid;
    this.globalData.userInfo = userInfo;
    this.syncMiniProfile();
  },

  syncMiniProfile() {
    const token = wx.getStorageSync('token');
    const userInfo = this.globalData.userInfo || {};
    wx.cloud.callFunction({
      name: this.globalData.cloudFunctionName,
      data: {
        method: 'POST',
        path: '/api/auth/mini-profile',
        body: { nickname: userInfo.nickname, grade: userInfo.grade },
        headers: { Authorization: `Bearer ${token}` },
      },
      fail: err => {
        console.error('同步用户资料失败:', err);
      },
    });
  },
});
