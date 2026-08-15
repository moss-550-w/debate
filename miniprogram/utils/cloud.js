/**
 * 云函数调用封装
 */
function callFunction(name, data = {}) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name,
      data,
      success: (res) => {
        if (res.result && res.result.code === 200) {
          resolve(res.result.data);
        } else {
          console.error(`云函数 ${name} 调用失败:`, res.result);
          wx.showToast({ title: res.result?.message || '请求失败', icon: 'none' });
          reject(res.result);
        }
      },
      fail: (err) => {
        console.error(`云函数 ${name} 调用异常:`, err);
        wx.showToast({ title: '网络异常', icon: 'none' });
        reject(err);
      },
    });
  });
}

module.exports = { callFunction };