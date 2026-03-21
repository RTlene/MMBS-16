/**
 * 访问 api.weixin.qq.com 时的 HTTPS 选项。
 * 云托管 / 部分出网环境会经自签名证书代理，Node 默认校验会报「self-signed certificate」；
 * 与 middleware/miniapp-auth.js 原行为一致：默认跳过校验。
 *
 * 若在可直连公网的环境希望严格校验证书，可设置环境变量：WX_HTTPS_STRICT=1
 */
const https = require('https');

let _insecureAgent;

function getWechatHttpsAgent() {
    if (process.env.WX_HTTPS_STRICT === '1' || String(process.env.WX_HTTPS_STRICT || '').toLowerCase() === 'true') {
        return undefined;
    }
    if (!_insecureAgent) {
        _insecureAgent = new https.Agent({ rejectUnauthorized: false });
    }
    return _insecureAgent;
}

/** 合并到 axios 的 config（get/post 的第三个参数 / 第二个参数里的 config） */
function mergeAxiosHttpsOpts(extra = {}) {
    const agent = getWechatHttpsAgent();
    if (!agent) return extra;
    return { ...extra, httpsAgent: agent };
}

module.exports = {
    getWechatHttpsAgent,
    mergeAxiosHttpsOpts
};
