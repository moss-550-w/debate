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
    userId: '',
    userReady: null,
    apiBaseUrl: API_BASE_URLS[API_MODE],
    apiMode: API_MODE,
    cloudFunctionName: 'apiGateway',
  },

  onLaunch() {
    wx.cloud.init({
      env: 'cloud1-d8g0k0m526d61652a',
      traceUser: true,
    });
    this.globalData.userReady = this.autoLogin();
  },

  async autoLogin() {
    let userInfo = wx.getStorageSync('userInfo');
    const legacyOpenid = wx.getStorageSync('openid');
    if (legacyOpenid && legacyOpenid.startsWith('mp_user_')) {
      wx.removeStorageSync('openid');
      wx.removeStorageSync('token');
      wx.removeStorageSync('userId');
    }
    if (!userInfo) {
      userInfo = {
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
      wx.setStorageSync('userInfo', userInfo);
    }
    this.globalData.userInfo = userInfo;
    return this.syncMiniProfile();
  },

  syncMiniProfile() {
    const userInfo = this.globalData.userInfo || {};
    return new Promise((resolve, reject) => wx.cloud.callFunction({
      name: this.globalData.cloudFunctionName,
      data: {
        method: 'POST',
        path: '/api/auth/mini-profile',
        body: { nickname: userInfo.nickname, grade: userInfo.grade },
      },
      success: res => {
        const result = res.result || {};
        if (result.code !== 200 || !result.data) {
          reject(new Error(result.message || '同步用户资料失败'));
          return;
        }
        const user = result.data.user || {};
        const userId = result.data.user_id || user._id || '';
        this.globalData.userId = userId;
        this.globalData.openid = result.data.openid || user.openid || '';
        this.globalData.userInfo = { ...userInfo, ...user, _id: userId };
        wx.setStorageSync('userId', userId);
        wx.setStorageSync('openid', this.globalData.openid);
        wx.setStorageSync('userInfo', this.globalData.userInfo);
        resolve(this.globalData.userInfo);
      },
      fail: err => {
        console.error('同步用户资料失败:', err);
        reject(err);
      },
    }));
  },
});
