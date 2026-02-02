/**
 * 小程序认证中间件
 * 处理小程序登录和身份验证
 */

const axios = require('axios');
const { Member, MemberLevel } = require('../db');

// ==================== 微信登录相关 ====================

/**
 * 通过 code 换取 openid
 * @param {string} code - 微信登录凭证
 * @returns {Promise<object>} 包含 openid 和 session_key
 */
async function code2Session(code) {
  try {
    const appid = process.env.WX_APPID;
    const secret = process.env.WX_APPSECRET;
    
    if (!appid || !secret) {
      throw new Error('未配置微信小程序 AppID 或 AppSecret');
    }
    
    const response = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
      params: {
        appid: appid,
        secret: secret,
        js_code: code,
        grant_type: 'authorization_code'
      },
      timeout: 10000
    });

    console.log('[MiniappAuth] code2Session 响应:', response.data);

    if (response.data.errcode) {
      throw new Error(response.data.errmsg || '微信登录失败');
    }

    return {
      openid: response.data.openid,
      session_key: response.data.session_key,
      unionid: response.data.unionid
    };
  } catch (error) {
    console.error('[MiniappAuth] code2Session 失败:', error);
    throw error;
  }
}

/**
 * 小程序登录接口
 * 接收小程序端的 code，换取 openid，并创建或查询会员
 */
async function miniappLogin(req, res) {
  try {
    const { code, referrerId, userInfo = {}, nickname: bodyNickname, avatar: bodyAvatar } = req.body;

    if (!code) {
      return res.status(400).json({ 
        success: false, 
        message: '缺少登录凭证 code' 
      });
    }

    console.log('[MiniappAuth] 小程序登录请求, code:', code);

    // 1. 调用微信接口换取 openid
    const sessionData = await code2Session(code);
    const { openid, session_key, unionid } = sessionData;

    console.log('[MiniappAuth] 获取到 openid:', openid);

    const nicknameFromBody = (userInfo.nickName || bodyNickname || '').trim();
    const avatarFromBody = userInfo.avatarUrl || bodyAvatar || null;
    const safeNickname = nicknameFromBody || `微信用户${openid ? openid.slice(-6) : ''}`;

    // 2. 查询或创建会员
    let member = await Member.findOne({ 
      where: { openid: openid },
      include: [{
        model: MemberLevel,
        as: 'memberLevel'
      }]
    });

    if (!member) {
      console.log('[MiniappAuth] 新用户，创建会员记录');
      
      // 查找默认会员等级
      let defaultLevel = await MemberLevel.findOne({ 
        where: { isDefault: true } 
      });

      // 如果没有默认等级，查找第一个可用的等级
      if (!defaultLevel) {
        defaultLevel = await MemberLevel.findOne({ 
          where: { status: 'active' },
          order: [['level', 'ASC']]
        });
      }

      // 如果还是没有，使用第一个等级（即使状态不是active）
      if (!defaultLevel) {
        defaultLevel = await MemberLevel.findOne({ 
          order: [['id', 'ASC']]
        });
      }

      // 如果数据库中没有任何会员等级，使用 null（需要数据库允许 memberLevelId 为 null）
      const memberLevelId = defaultLevel ? defaultLevel.id : null;

      // 处理推荐人
      let referrerId_parsed = null;
      if (referrerId) {
        try {
          const referrer = await Member.findByPk(referrerId);
          if (referrer) {
            referrerId_parsed = referrerId;
            console.log('[MiniappAuth] 推荐人ID:', referrerId);
          }
        } catch (err) {
          console.warn('[MiniappAuth] 查找推荐人失败:', err.message);
        }
      }

      // 生成会员编号（作为推荐码使用）
      const memberCode = 'M' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();

      // 创建会员
      member = await Member.create({
        nickname: safeNickname,
        openid: openid,
        unionid: unionid,
        sessionKey: session_key,
        avatar: avatarFromBody,
        memberLevelId: memberLevelId,
        referrerId: referrerId_parsed,
        memberCode: memberCode,
        status: 'active',
        totalCommission: 0,
        availableCommission: 0,
        totalSales: 0,
        directSales: 0,
        indirectSales: 0,
        availablePoints: 0,
        lastActiveAt: new Date()
      });

      // 重新查询，包含关联数据
      member = await Member.findByPk(member.id, {
        include: [{
          model: MemberLevel,
          as: 'memberLevel'
        }]
      });

      console.log('[MiniappAuth] 会员创建成功, ID:', member.id);
    } else {
      console.log('[MiniappAuth] 已有会员, ID:', member.id);
      
      // 更新最后登录时间
      await member.update({
        lastLoginAt: new Date(),
        sessionKey: session_key,
        unionid: unionid || member.unionid,
        nickname: member.nickname || safeNickname,
        avatar: member.avatar || avatarFromBody
      });
    }

    // 3. 返回登录结果
    res.json({
      success: true,
      message: '登录成功',
      openid: openid,
      memberId: member.id,
      member: {
        id: member.id,
        nickname: member.nickname,
        avatar: member.avatar,
        phone: member.phone,
        realName: member.realName,
        memberLevelId: member.memberLevelId,
        levelName: member.memberLevel ? member.memberLevel.name : '普通会员',
        memberCode: member.memberCode,
        availablePoints: member.availablePoints,
        availableCommission: member.availableCommission
      }
    });

  } catch (error) {
    console.error('[MiniappAuth] 小程序登录失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '登录失败：' + error.message 
    });
  }
}

// ==================== 认证中间件 ====================

/**
 * 小程序请求认证中间件
 * 验证请求头中的 openid，并加载会员信息
 */
async function authenticateMiniappUser(req, res, next) {
  try {
    const openid = req.headers['openid'] || req.headers['x-openid'];

    if (!openid) {
      return res.status(401).json({ 
        success: false, 
        message: '未登录，缺少 openid' 
      });
    }

    console.log('[MiniappAuth] 验证用户 openid:', openid);

    // 查询会员信息
    const member = await Member.findOne({ 
      where: { openid: openid },
      include: [{
        model: MemberLevel,
        as: 'memberLevel'
      }]
    });

    if (!member) {
      return res.status(401).json({ 
        success: false, 
        message: '用户不存在' 
      });
    }

    if (member.status !== 'active') {
      return res.status(403).json({ 
        success: false, 
        message: '账号已被禁用' 
      });
    }

    // 将会员信息挂载到 req 对象
    req.member = member;
    req.memberId = member.id;

    console.log('[MiniappAuth] 用户验证成功, 会员ID:', member.id);

    next();

  } catch (error) {
    console.error('[MiniappAuth] 认证失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '认证失败：' + error.message 
    });
  }
}

/**
 * 可选认证中间件
 * 如果有 openid 就加载会员信息，没有也不拦截
 */
async function optionalAuthenticate(req, res, next) {
  const start = Date.now();
  const requestId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  console.log(`[MiniappAuth] [${requestId}] optionalAuthenticate 开始处理: ${req.method} ${req.originalUrl}`);
  
  try {
    const openid = req.headers['openid'] || req.headers['x-openid'];
    console.log(`[MiniappAuth] [${requestId}] openid: ${openid || '未提供'}`);

    if (openid) {
      console.log(`[MiniappAuth] [${requestId}] 开始查询会员信息`);
      const member = await Member.findOne({ 
        where: { openid: openid },
        include: [{
          model: MemberLevel,
          as: 'memberLevel'
        }]
      });
      console.log(`[MiniappAuth] [${requestId}] 会员查询完成: ${member ? `找到会员ID=${member.id}` : '未找到会员'}`);

      if (member && member.status === 'active') {
        req.member = member;
        req.memberId = member.id;
        console.log(`[MiniappAuth] [${requestId}] 设置 req.memberId=${member.id}`);
      }
    }

    const duration = Date.now() - start;
    console.log(`[MiniappAuth] [${requestId}] optionalAuthenticate 完成，耗时: ${duration}ms，调用 next()`);
    next();

  } catch (error) {
    const duration = Date.now() - start;
    console.error(`[MiniappAuth] [${requestId}] 可选认证失败，耗时: ${duration}ms:`, error);
    next(); // 继续执行，不中断
  }
}

// ==================== 导出 ====================

module.exports = {
  code2Session,
  miniappLogin,
  authenticateMiniappUser,
  optionalAuthenticate
};