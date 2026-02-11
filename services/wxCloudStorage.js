/**
 * 微信云托管自带对象存储
 * 使用 tcb/uploadfile、tcb/batchdownloadfile，需在控制台开通「开放接口服务」并配置 /tcb/uploadfile、/tcb/batchdownloadfile 权限。
 * 环境变量：WX_CLOUD_ENV 或 CBR_ENV_ID（云托管环境 ID）
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const WX_API = 'http://api.weixin.qq.com';

function getEnv() {
    return process.env.WX_CLOUD_ENV || process.env.CBR_ENV_ID || '';
}

/**
 * 是否已配置云托管存储（配置后上传将写入云托管对象存储，返回 file_id：cloud://xxx）
 */
function isConfigured() {
    return !!getEnv().trim();
}

/**
 * 云上路径：products/{productId}/{filename}，不要以 / 开头
 */
function getCloudPath(productId, filename) {
    const prefix = (process.env.COS_PREFIX || process.env.WX_CLOUD_STORAGE_PREFIX || 'products').replace(/^\/+/, '').replace(/\/+$/, '');
    return `${prefix}/${productId}/${filename}`;
}

/**
 * 1. 调用 tcb/uploadfile 获取上传 URL 和凭证
 * 2. 将本地文件 POST 到该 URL
 * 返回 file_id（cloud://xxx），用于存入数据库；展示时需通过 getTempDownloadUrl 换临时链接（H5）或小程序直接用 file_id
 */
async function uploadFromPath(localFilePath, cloudPath) {
    const env = getEnv().trim();
    if (!env) return Promise.reject(new Error('未配置 WX_CLOUD_ENV 或 CBR_ENV_ID'));
    if (!fs.existsSync(localFilePath)) return Promise.reject(new Error('本地文件不存在: ' + localFilePath));

    const cloudPathNorm = cloudPath.replace(/^\/+/, '');
    const res = await axios.post(`${WX_API}/tcb/uploadfile`, { env, path: cloudPathNorm }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
        validateStatus: () => true
    });

    let data = res.data;
    // 部分网关/SDK 可能返回字符串，做一次兼容解析
    if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (_) {}
    }
    // 有些接口会把数据包在 respdata 中
    const payload = (data && data.respdata) ? data.respdata : data;

    if (payload && payload.errcode != null && payload.errcode !== 0) {
        throw new Error(payload.errmsg || 'tcb/uploadfile 失败: ' + JSON.stringify(payload));
    }

    const { url: uploadUrl, token, authorization, cos_file_id, file_id } = payload || {};
    if (!uploadUrl || !cos_file_id || !file_id) {
        console.warn('[wxCloudStorage] tcb/uploadfile 返回结构异常，HTTP status=', res.status, '完整响应:', JSON.stringify(data));
        throw new Error('tcb/uploadfile 返回缺少 url/cos_file_id/file_id（若为云托管环境请检查开放接口与 tcb 权限）');
    }

    const FormData = require('form-data');
    const form = new FormData();
    form.append('key', cloudPathNorm);
    form.append('Signature', authorization || '');
    form.append('x-cos-security-token', token || '');
    form.append('x-cos-meta-fileid', cos_file_id);
    form.append('file', fs.createReadStream(localFilePath), { filename: path.basename(cloudPathNorm) });

    const uploadRes = await axios.post(uploadUrl, form, {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 60000,
        validateStatus: () => true
    });

    // COS 表单上传成功常见返回 204 No Content（也可能是 200/201）
    if (![200, 201, 204].includes(uploadRes.status)) {
        throw new Error('上传到 COS 失败: status ' + uploadRes.status);
    }

    return file_id;
}

/**
 * 根据 file_id（cloud://xxx）换取临时下载链接，供 H5/后台展示
 * @param {string} fileId - cloud://xxx
 * @param {number} maxAge - 链接有效期（秒），默认 86400
 * @returns {Promise<string>} 临时 download_url
 */
async function getTempDownloadUrl(fileId, maxAge = 86400) {
    const env = getEnv().trim();
    if (!env) return Promise.reject(new Error('未配置 WX_CLOUD_ENV 或 CBR_ENV_ID'));

    const res = await axios.post(
        `${WX_API}/tcb/batchdownloadfile`,
        { env, file_list: [{ fileid: fileId, max_age: maxAge }] },
        { headers: { 'Content-Type': 'application/json' }, timeout: 10000, validateStatus: () => true }
    );

    const data = res.data;
    if (data.errcode != null && data.errcode !== 0) {
        throw new Error(data.errmsg || 'tcb/batchdownloadfile 失败');
    }
    const list = data.file_list;
    if (!Array.isArray(list) || list.length === 0 || list[0].status !== 0) {
        throw new Error(list && list[0] ? (list[0].errmsg || '获取下载链接失败') : '返回无 file_list');
    }
    return list[0].download_url || '';
}

module.exports = {
    isConfigured,
    getCloudPath,
    uploadFromPath,
    getTempDownloadUrl
};
