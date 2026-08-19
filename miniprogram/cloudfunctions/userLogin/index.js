// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 用户登录云函数
 * @param {object} event
 * @param {string} event.code - wx.login 获取的临时 code
 * @param {string} event.phone - 手机号（可选，PC端绑定用）
 * @returns {object} { openid, user }
 */
exports.main = async (event, context) => {
  const { code, phone } = event;

  try {
    // 获取 openid
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;

    if (!openid) {
      return { code: 0, message: '获取 openid 失败', data: null };
    }

    // 查询是否已有用户
    let user = null;
    const userRes = await db.collection('users')
      .where({ openid })
      .limit(1)
      .get();

    if (userRes.data.length > 0) {
      user = userRes.data[0];
      // 如有手机号则更新绑定
      if (phone && user.phone !== phone) {
        await db.collection('users').doc(user._id).update({
          data: { phone },
        });
        user.phone = phone;
      }
    } else {
      // 创建新用户
      const newUser = {
        openid,
        phone: phone || '',
        role: 'pupil', // 默认小学生
        nickname: '',
        grade: '',
        guardian_phone: '',
        ability_baseline: { pronunciation: 0, fluency: 0, logic: 0, vocabulary: 0, reaction: 0 },
        ability_latest: { pronunciation: 0, fluency: 0, logic: 0, vocabulary: 0, reaction: 0 },
        total_duration: 0,
        total_count: 0,
        agreement_version: 'v1',
        created_at: db.serverDate(),
      };

      const res = await db.collection('users').add({ data: newUser });
      newUser._id = res._id;
      user = newUser;
    }

    return {
      code: 200,
      message: 'ok',
      data: { openid, user },
    };
  } catch (err) {
    return {
      code: 500,
      message: `登录失败: ${err.message}`,
      data: null,
    };
  }
};