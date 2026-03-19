/**
 * 统一配置存储：加密后写入对象存储（COS），启动时加载并解密
 * 无 COS 时退化为本地 config/app-config.json
 * 加密密钥：CONFIG_ENCRYPTION_KEY（32 字节）或由 JWT_SECRET 派生
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cosStorage = require('./cosStorage');

const CONFIG_OBJECT_KEY = 'config/app-config.enc';
// system 分区单独持久化（明文），避免主配置因加密密钥/读取失败导致通用设置丢失
// 注意：仅用于“非敏感”的通用设置（如商城名称）。支付等敏感配置仍只写入加密文件。
const SYSTEM_OBJECT_KEY = 'config/system.json';
const LOCAL_CONFIG_PATH = path.join(__dirname, '../config/app-config.json');
const LOCAL_SYSTEM_PATH = path.join(__dirname, '../config/system.json');
const CONFIG_DIR = path.dirname(LOCAL_CONFIG_PATH);

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function ensureConfigDir() {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
}

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
 * 从对象存储或本地文件读取完整配置
 * @returns {Promise<object>}
 */
async function read() {
    const result = {};
    if (cosStorage.isConfigured()) {
        try {
            const buf = await cosStorage.getObjectBuffer(CONFIG_OBJECT_KEY);
            const plain = decrypt(buf);
            const data = JSON.parse(plain);
            console.log('[ConfigStore] 已从对象存储加载加密配置');
            Object.assign(result, data);
        } catch (e) {
            if (e.statusCode === 404 || (e.message && e.message === 'NOT_FOUND')) {
                console.log('[ConfigStore] 对象存储中暂无配置，尝试本地文件');
            } else {
                console.warn('[ConfigStore] 从对象存储读取失败:', e.message);
            }
        }
    }
    try {
        if (fs.existsSync(LOCAL_CONFIG_PATH)) {
            const data = JSON.parse(fs.readFileSync(LOCAL_CONFIG_PATH, 'utf8'));
            console.log('[ConfigStore] 已从本地文件加载配置');
            Object.assign(result, data);
        }
    } catch (e) {
        console.warn('[ConfigStore] 读取本地配置失败:', e.message);
    }

    // 兜底读取 system 分区（即使主配置为空/解密失败，也尽量恢复 mallName 等通用设置）
    try {
        let system = null;
        if (cosStorage.isConfigured()) {
            try {
                const buf = await cosStorage.getObjectBuffer(SYSTEM_OBJECT_KEY);
                system = JSON.parse(buf.toString('utf8'));
                console.log('[ConfigStore] 已从对象存储加载 system 配置');
            } catch (e) {
                if (!(e && (e.statusCode === 404 || e.message === 'NOT_FOUND'))) {
                    console.warn('[ConfigStore] 从对象存储读取 system 失败:', e.message);
                }
            }
        }
        if (!system && fs.existsSync(LOCAL_SYSTEM_PATH)) {
            system = JSON.parse(fs.readFileSync(LOCAL_SYSTEM_PATH, 'utf8'));
            console.log('[ConfigStore] 已从本地文件加载 system 配置');
        }
        if (system && typeof system === 'object') {
            result.system = { ...(result.system || {}), ...system };
        }
    } catch (e) {
        console.warn('[ConfigStore] 读取 system 兜底配置失败:', e.message);
    }

    return result;
}

/**
 * 写入完整配置到对象存储（加密）及本地（明文备份）
 * @param {object} data - 完整配置对象
 */
async function write(data) {
    const jsonStr = JSON.stringify(data, null, 2);
    ensureConfigDir();
    fs.writeFileSync(LOCAL_CONFIG_PATH, jsonStr, 'utf8');

    if (cosStorage.isConfigured()) {
        try {
            const encrypted = encrypt(jsonStr);
            await cosStorage.putObjectBuffer(CONFIG_OBJECT_KEY, encrypted);
            console.log('[ConfigStore] 已写入对象存储（加密）');
        } catch (e) {
            console.warn('[ConfigStore] 写入对象存储失败:', e.message);
        }
    }
}

/**
 * 仅写入 system 分区（明文），作为通用设置持久化兜底
 * @param {object} systemData
 */
async function writeSystem(systemData) {
    try {
        ensureConfigDir();
        const jsonStr = JSON.stringify(systemData || {}, null, 2);
        fs.writeFileSync(LOCAL_SYSTEM_PATH, jsonStr, 'utf8');
        if (cosStorage.isConfigured()) {
            await cosStorage.putObjectBuffer(SYSTEM_OBJECT_KEY, Buffer.from(jsonStr, 'utf8'));
            console.log('[ConfigStore] 已写入对象存储（system 明文兜底）');
        }
    } catch (e) {
        console.warn('[ConfigStore] 写入 system 兜底配置失败:', e.message);
    }
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
    configStore._cache = full;
    await write(full);
    if (section === 'system') {
        await writeSystem(sectionData);
    }
}

const configStore = {
    _cache: null,
    read,
    write,
    writeSystem,
    getSection,
    setSection,
    getEncryptionKey: () => getEncryptionKey().length
};

module.exports = configStore;
