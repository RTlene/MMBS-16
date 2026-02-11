/**
 * 腾讯云 COS 对象存储上传
 * 配置后商品图片/视频将上传到 COS，再次编辑可正常加载。
 *
 * 环境变量（二选一）：
 * 1) 云托管自动注入：仅需 COS_BUCKET、COS_REGION，通过开放接口 getauth 获取临时密钥（无需填密钥）
 * 2) 自建 COS：COS_SECRET_ID、COS_SECRET_KEY、COS_BUCKET、COS_REGION
 * 可选：COS_PREFIX、COS_DOMAIN
 */

const path = require('path');
const fs = require('fs');
const axios = require('axios');

const WX_COS_AUTH_URL = 'http://api.weixin.qq.com/_/cos/getauth';

let cosClient = null;

/**
 * 是否仅使用云托管注入的 BUCKET+REGION（无 SECRET_ID/SECRET_KEY 时走 getauth 临时密钥）
 */
function useCloudRunTempKey() {
    const bucket = process.env.COS_BUCKET;
    const region = process.env.COS_REGION;
    const hasPermanent = process.env.COS_SECRET_ID && process.env.COS_SECRET_KEY;
    return !!(bucket && region && !hasPermanent);
}

function getClient() {
    if (cosClient) return cosClient;
    const SecretId = process.env.COS_SECRET_ID;
    const SecretKey = process.env.COS_SECRET_KEY;
    if (SecretId && SecretKey) {
        try {
            const COS = require('cos-nodejs-sdk-v5');
            cosClient = new COS({
                SecretId,
                SecretKey,
                Protocol: 'https:'
            });
            return cosClient;
        } catch (e) {
            console.warn('[COS] SDK 未安装或初始化失败:', e.message);
            return null;
        }
    }
    if (useCloudRunTempKey()) {
        try {
            const COS = require('cos-nodejs-sdk-v5');
            cosClient = new COS({
                getAuthorization: function (options, callback) {
                    axios.get(WX_COS_AUTH_URL, { timeout: 10000, validateStatus: () => true })
                        .then(res => {
                            const data = res.data;
                            if (data && data.TmpSecretId && data.TmpSecretKey) {
                                callback({
                                    TmpSecretId: data.TmpSecretId,
                                    TmpSecretKey: data.TmpSecretKey,
                                    SecurityToken: data.Token || '',
                                    ExpiredTime: data.ExpiredTime
                                });
                            } else {
                                callback(new Error('getauth 返回无效: ' + JSON.stringify(data)));
                            }
                        })
                        .catch(err => callback(err));
                },
                Protocol: 'https:'
            });
            return cosClient;
        } catch (e) {
            console.warn('[COS] 云托管临时密钥初始化失败:', e.message);
            return null;
        }
    }
    return null;
}

/**
 * 是否已配置 COS（有 BUCKET+REGION，且能拿到客户端：永久密钥或云托管 getauth）
 */
function isConfigured() {
    const bucket = process.env.COS_BUCKET;
    const region = process.env.COS_REGION;
    if (!bucket || !region) return false;
    return getClient() != null;
}

/**
 * 生成对象键：products/{productId}/{filename}
 */
function getObjectKey(productId, filename) {
    const prefix = (process.env.COS_PREFIX || 'products').replace(/\/$/, '');
    return `${prefix}/${productId}/${filename}`;
}

/**
 * 上传本地文件到 COS，返回公网可访问的 URL
 * @param {string} localFilePath - 本地文件路径
 * @param {string} objectKey - COS 对象键，如 products/2/xxx.jpg
 * @returns {Promise<string>} 公网 URL
 */
function uploadFromPath(localFilePath, objectKey) {
    const client = getClient();
    const Bucket = process.env.COS_BUCKET;
    const Region = process.env.COS_REGION;
    if (!client || !Bucket || !Region) {
        return Promise.reject(new Error('COS 未配置'));
    }
    if (!fs.existsSync(localFilePath)) {
        return Promise.reject(new Error('本地文件不存在: ' + localFilePath));
    }

    return new Promise((resolve, reject) => {
        const body = fs.createReadStream(localFilePath);
        client.putObject(
            {
                Bucket,
                Region,
                Key: objectKey,
                Body: body,
                ContentLength: fs.statSync(localFilePath).size
            },
            (err, data) => {
                if (err) {
                    reject(err);
                    return;
                }
                const url = getPublicUrl(objectKey);
                resolve(url);
            }
        );
    });
}

/**
 * 根据对象键得到公网访问 URL
 * 若配置了 COS_DOMAIN（如 CDN 域名），则返回 https://COS_DOMAIN/Key；否则使用 COS 默认域名
 */
function getPublicUrl(objectKey) {
    const customDomain = process.env.COS_DOMAIN; // 如 https://cdn.example.com
    if (customDomain) {
        const base = customDomain.replace(/\/$/, '');
        return `${base}/${objectKey}`;
    }
    const Bucket = process.env.COS_BUCKET;
    const Region = process.env.COS_REGION;
    return `https://${Bucket}.cos.${Region}.myqcloud.com/${objectKey}`;
}

module.exports = {
    isConfigured,
    getObjectKey,
    uploadFromPath,
    getPublicUrl
};
