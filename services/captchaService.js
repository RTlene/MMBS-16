/**
 * 后台登录图形验证码（无状态 JWT，多副本/负载均衡下任意实例均可校验）
 *
 * 原理：将「正确答案」的 HMAC 签入短期 JWT；登录时用用户输入再算 HMAC 比对。
 * 不依赖进程内存或 Redis，只要各实例使用相同的 JWT_SECRET。
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

let svgCaptcha;
try {
    svgCaptcha = require('svg-captcha');
} catch (e) {
    console.warn('[Captcha] svg-captcha 未安装，验证码接口将不可用');
}

function getJwtSecret() {
    return process.env.JWT_SECRET || 'your-secret-key-change-this';
}

function hmacAnswer(textNorm) {
    return crypto
        .createHmac('sha256', getJwtSecret())
        .update(textNorm, 'utf8')
        .digest('hex');
}

/**
 * 生成验证码，返回 { captchaToken, imageDataUrl }
 */
function createCaptcha() {
    if (!svgCaptcha) {
        throw new Error('svg-captcha 未安装');
    }
    const cap = svgCaptcha.create({
        size: 4,
        ignoreChars: '0oO1ilI',
        noise: 2,
        color: true,
        background: '#f4f4f5',
        width: 120,
        height: 40
    });
    const textNorm = String(cap.text || '')
        .trim()
        .toLowerCase();
    const h = hmacAnswer(textNorm);
    const captchaToken = jwt.sign(
        { typ: 'captcha', ver: 1, h },
        getJwtSecret(),
        { expiresIn: '5m' }
    );
    const b64 = Buffer.from(cap.data, 'utf8').toString('base64');
    return {
        captchaToken,
        imageDataUrl: `data:image/svg+xml;base64,${b64}`
    };
}

/**
 * 校验验证码 token 与用户输入（不区分大小写）；JWT 过期或错误则失败
 */
function verifyCaptchaToken(captchaToken, userInput) {
    if (!captchaToken || userInput == null) {
        return false;
    }
    const u = String(userInput).trim().toLowerCase();
    if (!u) {
        return false;
    }
    let payload;
    try {
        payload = jwt.verify(captchaToken, getJwtSecret());
    } catch (e) {
        return false;
    }
    if (payload.typ !== 'captcha' || payload.ver !== 1 || !payload.h) {
        return false;
    }
    const userH = hmacAnswer(u);
    try {
        const a = Buffer.from(payload.h, 'hex');
        const b = Buffer.from(userH, 'hex');
        if (a.length !== b.length) {
            return false;
        }
        return crypto.timingSafeEqual(a, b);
    } catch (e) {
        return false;
    }
}

function isAvailable() {
    return !!svgCaptcha;
}

module.exports = {
    createCaptcha,
    verifyCaptchaToken,
    isAvailable
};
