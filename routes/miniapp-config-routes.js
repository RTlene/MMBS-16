const express = require('express');
const axios = require('axios');
const configStore = require('../services/configStore');
const { mergeAxiosHttpsOpts } = require('../utils/wechatHttpsAgent');
const { optionalAuthenticate } = require('../middleware/miniapp-auth');

const router = express.Router();
const WX_TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token';
const WX_CODE_UNLIMITED_URL = 'https://api.weixin.qq.com/wxa/getwxacodeunlimit';
let miniappAccessTokenCache = { token: '', expireAt: 0 };
const homeQrcodeCache = new Map();
const HOME_QRCODE_TTL_MS = 30 * 60 * 1000;

async function getMiniappAccessToken() {
  const now = Date.now();
  if (miniappAccessTokenCache.token && miniappAccessTokenCache.expireAt - now > 60 * 1000) {
    return miniappAccessTokenCache.token;
  }
  const appid = String(process.env.WX_APPID || '').trim();
  const secret = String(process.env.WX_APPSECRET || '').trim();
  if (!appid || !secret) throw new Error('缺少 WX_APPID 或 WX_APPSECRET');
  const resp = await axios.get(
    WX_TOKEN_URL,
    mergeAxiosHttpsOpts({
      params: { grant_type: 'client_credential', appid, secret },
      timeout: 10000
    })
  );
  const data = resp.data || {};
  if (!data.access_token) throw new Error(data.errmsg || '获取小程序 access_token 失败');
  const expiresIn = Number(data.expires_in || 7200);
  miniappAccessTokenCache = {
    token: data.access_token,
    expireAt: Date.now() + expiresIn * 1000
  };
  return data.access_token;
}

/**
 * 小程序公开配置（无需鉴权）
 * GET /api/miniapp/config
 */
router.get('/config', async (req, res) => {
  try {
    const system = configStore.getSection('system') || {};
    const mallName = system.mallName != null ? String(system.mallName).trim() : '';
    res.json({
      code: 0,
      message: '获取成功',
      data: {
        mallName
      }
    });
  } catch (e) {
    console.error('[MiniappConfig] 获取失败:', e.message);
    res.status(500).json({ code: 1, message: '获取配置失败', error: e.message });
  }
});

/**
 * 首页分享小程序码（可带推荐人）
 * GET /api/miniapp/share/home-qrcode?referrerId=123
 */
router.get('/share/home-qrcode', optionalAuthenticate, async (req, res) => {
  try {
    const reqReferrer = parseInt(req.query.referrerId, 10);
    const referrerId = Number.isFinite(req.memberId)
      ? req.memberId
      : (Number.isFinite(reqReferrer) ? reqReferrer : null);
    const scene = referrerId ? `h=1&r=${referrerId}` : 'h=1';
    const cached = homeQrcodeCache.get(scene);
    const wantsJson = String(req.query.format || '').toLowerCase() === 'json';
    console.log('[MiniappConfig] home-qrcode request:', {
      scene,
      wantsJson,
      hasMemberId: Number.isFinite(req.memberId),
      queryReferrerId: req.query.referrerId || null
    });
    if (cached && cached.expireAt > Date.now() && cached.buffer) {
      console.log('[MiniappConfig] home-qrcode cache hit:', {
        scene,
        wantsJson,
        bytes: cached.buffer.length
      });
      if (wantsJson) {
        const imageBase64 = cached.buffer.toString('base64');
        return res.json({
          code: 0,
          message: '获取成功',
          data: {
            imageBase64,
            source: 'cache',
            imageBase64Length: imageBase64.length
          }
        });
      }
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'private, max-age=600');
      return res.send(cached.buffer);
    }
    const accessToken = await getMiniappAccessToken();
    const wxResp = await axios.post(
      `${WX_CODE_UNLIMITED_URL}?access_token=${encodeURIComponent(accessToken)}`,
      {
        scene,
        page: 'pages/index/index',
        check_path: false,
        env_version: process.env.WX_MINIPROGRAM_ENV_VERSION || 'release',
        width: 430,
        auto_color: true
      },
      mergeAxiosHttpsOpts({
        responseType: 'arraybuffer',
        timeout: 15000
      })
    );
    const contentType = String(wxResp.headers['content-type'] || '');
    console.log('[MiniappConfig] home-qrcode wechat response:', {
      scene,
      contentType,
      byteLength: wxResp && wxResp.data ? Buffer.from(wxResp.data).length : 0
    });
    if (contentType.includes('application/json')) {
      const txt = Buffer.from(wxResp.data).toString('utf8');
      let obj = {};
      try { obj = JSON.parse(txt); } catch (_) {}
      return res.status(500).json({
        code: 1,
        message: `生成首页小程序码失败: ${obj.errcode || ''} ${obj.errmsg || ''}`.trim()
      });
    }
    const pngBuffer = Buffer.from(wxResp.data);
    homeQrcodeCache.set(scene, {
      buffer: pngBuffer,
      expireAt: Date.now() + HOME_QRCODE_TTL_MS
    });
    // 简单清理，防止 Map 增长
    if (homeQrcodeCache.size > 500) {
      for (const [k, v] of homeQrcodeCache.entries()) {
        if (!v || v.expireAt <= Date.now()) {
          homeQrcodeCache.delete(k);
        }
      }
    }
    if (wantsJson) {
      const imageBase64 = pngBuffer.toString('base64');
      return res.json({
        code: 0,
        message: '获取成功',
        data: {
          imageBase64,
          source: 'wechat',
          imageBase64Length: imageBase64.length
        }
      });
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.send(pngBuffer);
  } catch (e) {
    console.error('[MiniappConfig] 生成首页小程序码失败:', e.message);
    res.status(500).json({ code: 1, message: '生成首页小程序码失败', error: e.message });
  }
});

module.exports = router;

