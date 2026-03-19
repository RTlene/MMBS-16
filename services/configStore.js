/**
 * 统一配置存储：所有配置加密后写入对象存储（COS），启动时加载并解密
 * 加密密钥：CONFIG_ENCRYPTION_KEY（32 字节）或由 JWT_SECRET 派生
 */

const crypto = require('crypto');
const cosStorage = require('./cosStorage');

const CONFIG_OBJECT_KEY = 'config/app-config.enc';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getEncryptionKey() {
    let key = process.env.CONFIG_ENCRYPTION_KEY;
    if (key && typeof key === 'string' && key.length >= KEY_LENGTH) {
        return Buffer.from(key.slice(0, KEY_LENGTH), 'utf8');
    }
    const fallback = process.env.JWT_SECRET || 'default-config-secret-change-in-production';
    return crypto.createHash('sha256').update(fallback).digest();
}

function encrypt(plainText) {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    const enc = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, enc]);
}

function decrypt(cipherBuffer) {
    const key = getEncryptionKey();
    if (cipherBuffer.length < IV_LENGTH + AUTH_TAG_LENGTH) {
        throw new Error('配置密文无效');
    }
    const iv = cipherBuffer.subarray(0, IV_LENGTH);
    const authTag = cipherBuffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const enc = cipherBuffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    return decipher.update(enc) + decipher.final('utf8');
}

/**
 * 从对象存储读取完整配置（密文）
 * @returns {Promise<object>}
 */
async function read() {
    if (!cosStorage.isConfigured()) {
        console.warn('[ConfigStore] COS 未配置，无法读取统一配置');
        return {};
    }
    const maxAttempts = 5;
    for (let i = 1; i <= maxAttempts; i++) {
        try {
            const buf = await cosStorage.getObjectBuffer(CONFIG_OBJECT_KEY);
            const plain = decrypt(buf);
            const data = JSON.parse(plain);
            console.log('[ConfigStore] 已从对象存储加载加密配置');
            return data;
        } catch (e) {
            if (e.statusCode === 404 || (e.message && e.message === 'NOT_FOUND')) {
                console.log('[ConfigStore] 对象存储中暂无配置');
                return {};
            }
            if (i < maxAttempts) {
                console.warn(`[ConfigStore] 从对象存储读取失败(第${i}次)，准备重试:`, e.message);
                await new Promise(r => setTimeout(r, 500 * i));
                continue;
            }
            console.warn('[ConfigStore] 从对象存储读取失败:', e.message);
            return {};
        }
    }
    return {};
}

/**
 * 写入完整配置到对象存储（加密）
 * @param {object} data - 完整配置对象
 */
async function write(data) {
    if (!cosStorage.isConfigured()) {
        throw new Error('COS 未配置，无法持久化配置');
    }
    const jsonStr = JSON.stringify(data, null, 2);
    const encrypted = encrypt(jsonStr);
    await cosStorage.putObjectBuffer(CONFIG_OBJECT_KEY, encrypted);
    console.log('[ConfigStore] 已写入对象存储（加密）');
}

/**
 * 获取某一分区配置
 * @param {string} section - 如 'payment' | 'withdrawal'
 * @returns {object}
 */
function getSection(section) {
    if (!configStore._cache) return {};
    return configStore._cache[section] || {};
}

/**
 * 更新某一分区并持久化
 * @param {string} section
 * @param {object} sectionData
 */
async function setSection(section, sectionData) {
    const full = configStore._cache || {};
    full[section] = sectionData;
    await write(full);
    configStore._cache = full;
}

const configStore = {
    _cache: null,
    read,
    write,
    getSection,
    setSection,
    getEncryptionKey: () => getEncryptionKey().length
};

module.exports = configStore;
