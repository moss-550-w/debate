// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 获取云存储上传凭证
 * @param {object} event
 * @param {string} event.path - 存储路径（可选）
 * @returns {object} 上传凭据
 */
exports.main = async (event, context) => {
  try {
    const { path } = event;

    // 生成上传凭证
    const result = await cloud.uploadFile({
      cloudPath: path || `uploads/${Date.now()}_${Math.random().toString(36).slice(2)}`,
      fileContent: '', // 实际文件由前端上传
    });

    return {
      code: 200,
      message: 'ok',
      data: {
        fileID: result.fileID,
      },
    };
  } catch (err) {
    return {
      code: 500,
      message: `获取上传凭证失败: ${err.message}`,
      data: null,
    };
  }
};