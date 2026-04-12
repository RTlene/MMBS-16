/**
 * 小程序码 / 扫码冷启动：自定义 scene 解析
 * 与后端约定：商品码 p=商品ID&r=推荐人ID；首页码 h=1&r=推荐人ID
 * 见 getwxacodeunlimit 的 scene 参数（与「分享 path 上的 query」不是同一路径）
 */

function parseLaunchSceneParams(options) {
  const out = {};
  if (!options || typeof options !== 'object') return out;

  let raw = options.scene;
  if ((raw === undefined || raw === null || raw === '') && options.query && typeof options.query === 'object') {
    const q = options.query;
    if (q.scene !== undefined && q.scene !== null && q.scene !== '') {
      raw = q.scene;
    }
  }

  if (raw === undefined || raw === null || raw === '') return out;
  if (typeof raw === 'number') return out;

  let s = String(raw).trim();
  if (!s) return out;

  try {
    s = decodeURIComponent(s.replace(/\+/g, '%20'));
  } catch (_) {
    // 保持原串
  }

  if (!s.includes('=')) return out;

  s.split('&').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx <= 0) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) out[k] = v;
  });
  return out;
}

/** 将 scene 中的 r 写入本地，供登录接口在首次注册时绑定推荐关系 */
function persistReferrerFromSceneParams(parsed) {
  if (!parsed || parsed.r === undefined || parsed.r === null) return;
  const rid = String(parsed.r).trim();
  if (!rid) return;
  try {
    wx.setStorageSync('referrerId', rid);
  } catch (_) {}
  try {
    const app = getApp();
    if (app && app.globalData) app.globalData.referrerId = rid;
  } catch (_) {}
}

module.exports = {
  parseLaunchSceneParams,
  persistReferrerFromSceneParams
};
