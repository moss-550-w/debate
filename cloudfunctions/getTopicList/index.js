// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 获取辩题列表云函数
 * @param {object} event
 * @param {string} event.category - 分类筛选（可选）
 * @param {string} event.difficulty - 难度筛选（可选）
 * @param {number} event.page - 页码，默认1
 * @param {number} event.size - 每页条数，默认10
 * @returns {object} { total, list }
 */
exports.main = async (event, context) => {
  const { category, difficulty, page = 1, size = 10 } = event;

  try {
    let query = db.collection('topics').where({ status: 1 });
    let countQuery = db.collection('topics').where({ status: 1 });

    // 分类筛选
    if (category) {
      query = query.where({ category });
      countQuery = countQuery.where({ category });
    }

    // 难度筛选
    if (difficulty) {
      query = query.where({ difficulty });
      countQuery = countQuery.where({ difficulty });
    }

    // 获取总数
    const countRes = await countQuery.count();
    const total = countRes.total;

    // 分页查询
    const res = await query
      .orderBy('difficulty', 'asc')
      .skip((page - 1) * size)
      .limit(size)
      .get();

    return {
      code: 200,
      message: 'ok',
      data: {
        total,
        list: res.data,
        page,
        size,
      },
    };
  } catch (err) {
    return {
      code: 500,
      message: `查询失败: ${err.message}`,
      data: null,
    };
  }
};