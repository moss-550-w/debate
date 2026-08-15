// app.js
App({
  globalData: {
    userInfo: null,
    openid: '',
    cloudEnv: 'your-cloud-env-id', // 替换为实际云环境ID
    apiBaseUrl: 'http://localhost:3000/api', // 替换为实际服务器地址
  },

  onLaunch() {
    wx.cloud.init({
      env: this.globalData.cloudEnv,
      traceUser: true,
    });
  },
});