const express = require('express');
const axios = require('axios');
const { Op } = require('sequelize');
const { CustomPage } = require('../db');
const { optionalAuthenticate } = require('../middleware/miniapp-auth');
const { mergeAxiosHttpsOpts } = require('../utils/wechatHttpsAgent');

const router = express.Router();
const WX_TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token';
const WX_CODE_UNLIMITED_URL = 'https://api.weixin.qq.com/wxa/getwxacodeunlimit';
let miniappAccessTokenCache = { token: '', expireAt: 0 };
const customPageQrcodeCache = new Map();
const CUSTOM_PAGE_QRCODE_TTL_MS = 30 * 60 * 1000;

function sendQrcodeBase64Compat(res, imageBase64, source = 'wechat') {
  const base64 = String(imageBase64 || '').trim();
  res.setHeader('X-Qrcode-Source', source);
  res.setHeader('X-Qrcode-Base64-Length', String(base64.length));
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.send(base64);
}

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

router.get('/custom-pages/:slug', async (req, res) => {
  try {
    const rawSlug = String(req.params.slug || '').trim();
    if (!rawSlug) return res.status(400).json({ code: 1, message: '页面标识不能为空' });
    const numericId = parseInt(rawSlug, 10);
    const slugCandidates = [rawSlug];
    try {
      const d1 = decodeURIComponent(rawSlug);
      if (d1 && !slugCandidates.includes(d1)) slugCandidates.push(d1);
      try {
        const d2 = decodeURIComponent(d1);
        if (d2 && !slugCandidates.includes(d2)) slugCandidates.push(d2);
      } catch (_) {}
    } catch (_) {}
    const now = new Date();
    const candidateWhere = {
      [Op.or]: [
        { slug: { [Op.in]: slugCandidates } },
        // 兼容历史配置错误：把“页面名称”当成了 slug 传入
        { name: { [Op.in]: slugCandidates } },
        // 再兜底：部分历史配置可能传的是标题
        { title: { [Op.in]: slugCandidates } }
      ]
    };
    const onlineWhere = {
      status: 'published',
      [Op.and]: [
        { [Op.or]: [{ startTime: null }, { startTime: { [Op.lte]: now } }] },
        { [Op.or]: [{ endTime: null }, { endTime: { [Op.gte]: now } }] }
      ]
    };

    // 1) 首选：严格在线页（已发布 + 在有效期）且精确匹配
    let page = null;
    if (Number.isFinite(numericId) && numericId > 0) {
      page = await CustomPage.findOne({
        where: {
          id: numericId,
          ...onlineWhere
        }
      });
    }
    if (!page) {
      page = await CustomPage.findOne({
        where: {
          ...candidateWhere,
          ...onlineWhere
        }
      });
    }
    // 2) 兼容：历史 jumpTarget 可能缺少完整值，做一次模糊匹配（仍限定在线页）
    if (!page) {
      page = await CustomPage.findOne({
        where: {
          [Op.or]: [
            { slug: { [Op.like]: `%${rawSlug}%` } },
            { name: { [Op.like]: `%${rawSlug}%` } },
            { title: { [Op.like]: `%${rawSlug}%` } }
          ],
          ...onlineWhere
        },
        order: [['updatedAt', 'DESC'], ['id', 'DESC']]
      });
    }
    // 3) 最后兜底：用于活动跳转兼容老配置（忽略发布状态/时间）
    if (!page) {
      if (Number.isFinite(numericId) && numericId > 0) {
        page = await CustomPage.findByPk(numericId);
      }
      if (!page) {
        page = await CustomPage.findOne({
          where: candidateWhere,
          order: [['updatedAt', 'DESC'], ['id', 'DESC']]
        });
      }
    }
    if (!page) return res.status(404).json({ code: 1, message: '页面不存在或未发布' });
    return res.json({
      code: 0,
      message: '获取成功',
      data: {
        id: page.id,
        name: page.name,
        slug: page.slug,
        title: page.title || page.name,
        schemaJson: page.schemaJson || [],
        shareTitle: page.shareTitle || page.title || page.name,
        shareImage: page.shareImage || '',
        enableShare: page.enableShare !== false
      }
    });
  } catch (e) {
    console.error('小程序自定义页获取失败:', e);
    return res.status(500).json({ code: 1, message: '获取失败' });
  }
});

router.get('/custom-pages/:slug/share-qrcode', optionalAuthenticate, async (req, res) => {
  try {
    const rawSlug = String(req.params.slug || '').trim();
    if (!rawSlug) return res.status(400).json({ code: 1, message: '页面标识不能为空' });
    const page = await CustomPage.findOne({
      where: {
        [Op.or]: [
          { slug: rawSlug },
          { name: rawSlug },
          { title: rawSlug }
        ]
      },
      attributes: ['id']
    });
    if (!page) return res.status(404).json({ code: 1, message: '页面不存在' });
    const reqReferrer = parseInt(req.query.referrerId, 10);
    const referrerId = Number.isFinite(req.memberId) ? req.memberId : (Number.isFinite(reqReferrer) ? reqReferrer : null);
    const scene = referrerId ? `c=${page.id}&r=${referrerId}` : `c=${page.id}`;
    const wantsJson = String(req.query.format || '').toLowerCase() === 'json';
    const cacheKey = scene;
    const cached = customPageQrcodeCache.get(cacheKey);
    if (cached && cached.expireAt > Date.now() && cached.buffer) {
      if (wantsJson) {
        return sendQrcodeBase64Compat(res, cached.buffer.toString('base64'), 'cache');
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
        page: 'pages/custom-page/custom-page',
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
    if (contentType.includes('application/json')) {
      const txt = Buffer.from(wxResp.data).toString('utf8');
      let obj = {};
      try { obj = JSON.parse(txt); } catch (_) {}
      return res.status(500).json({
        code: 1,
        message: `生成活动页小程序码失败: ${obj.errcode || ''} ${obj.errmsg || ''}`.trim()
      });
    }
    const pngBuffer = Buffer.from(wxResp.data);
    customPageQrcodeCache.set(cacheKey, {
      buffer: pngBuffer,
      expireAt: Date.now() + CUSTOM_PAGE_QRCODE_TTL_MS
    });
    if (customPageQrcodeCache.size > 500) {
      for (const [k, v] of customPageQrcodeCache.entries()) {
        if (!v || v.expireAt <= Date.now()) customPageQrcodeCache.delete(k);
      }
    }
    if (wantsJson) {
      return sendQrcodeBase64Compat(res, pngBuffer.toString('base64'), 'wechat');
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=600');
    return res.send(pngBuffer);
  } catch (e) {
    console.error('[MiniappCustomPage] 生成分享小程序码失败:', e);
    return res.status(500).json({ code: 1, message: e.message || '生成分享小程序码失败' });
  }
});

module.exports = router;

