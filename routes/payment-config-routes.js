/**
 * 微信支付配置路由
 * 用于保存和读取微信支付配置；证书上传会同步到对象存储，启动时可从存储恢复
 */

const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const axios = require('axios');
const { authenticateToken } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');
const wxCloudStorage = require('../services/wxCloudStorage');
const cosStorage = require('../services/cosStorage');

const router = express.Router();

const CERT_CERT_NAME = 'apiclient_cert.pem';
const CERT_KEY_NAME = 'apiclient_key.pem';
const CLOUD_CERT_PREFIX = 'cert';

// 证书存储目录（与默认 WX_PAY_CERT_PATH / WX_PAY_KEY_PATH 一致）
const CERT_DIR = path.join(__dirname, '../cert');
if (!fs.existsSync(CERT_DIR)) {
    fs.mkdirSync(CERT_DIR, { recursive: true });
}

const certStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, CERT_DIR);
    },
    filename: function (req, file, cb) {
        const fieldName = file.fieldname || '';
        if (fieldName === 'keyFile') {
            cb(null, 'apiclient_key.pem');
        } else {
            cb(null, 'apiclient_cert.pem');
        }
    }
});
const uploadCert = multer({
    storage: certStorage,
    limits: { fileSize: 512 * 1024 },
    fileFilter: function (req, file, cb) {
        const name = (file.originalname || '').toLowerCase();
        if (!name.endsWith('.pem')) {
            return cb(new Error('仅支持 .pem 证书文件'));
        }
        cb(null, true);
    }
});

// 证书包 zip 上传（内存，解压后写入 CERT_DIR）
const uploadZip = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        const name = (file.originalname || '').toLowerCase();
        if (!name.endsWith('.zip')) {
            return cb(new Error('仅支持 .zip 证书包'));
        }
        cb(null, true);
    }
});

// 配置存储路径（使用 JSON 文件存储，实际生产环境建议使用数据库）
const CONFIG_FILE_PATH = path.join(__dirname, '../config/wechat-payment-config.json');

// 确保配置目录存在
const configDir = path.dirname(CONFIG_FILE_PATH);
if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
}

/**
 * 读取配置
 */
function readConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE_PATH)) {
            const data = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('[PaymentConfig] 读取配置失败:', error);
    }
    return {};
}

/**
 * 保存配置
 */
function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('[PaymentConfig] 保存配置失败:', error);
        return false;
    }
}

function maskSecret(secret) {
    if (!secret) return '';
    return '***已保存***';
}

/**
 * 将本地证书文件上传到对象存储，优先云托管，其次 COS
 * @param {string} localPath - 本地文件路径
 * @param {string} cloudName - 云上文件名，如 apiclient_cert.pem
 * @returns {Promise<{ type: 'wxcloud'|'cos', ref: string }|null>}
 */
async function uploadCertToStorage(localPath, cloudName) {
    if (!fs.existsSync(localPath)) return null;
    const cloudPath = `${CLOUD_CERT_PREFIX}/${cloudName}`;
    if (wxCloudStorage.isConfigured()) {
        try {
            const fileId = await wxCloudStorage.uploadFromPath(localPath, cloudPath);
            return { type: 'wxcloud', ref: fileId };
        } catch (e) {
            console.warn('[PaymentConfig] 云托管证书上传失败:', e.message);
        }
    }
    if (cosStorage.isConfigured()) {
        try {
            const objectKey = `${CLOUD_CERT_PREFIX}/${cloudName}`;
            const url = await cosStorage.uploadFromPath(localPath, objectKey);
            return { type: 'cos', ref: objectKey };
        } catch (e) {
            console.warn('[PaymentConfig] COS 证书上传失败:', e.message);
        }
    }
    if (!wxCloudStorage.isConfigured() && !cosStorage.isConfigured()) {
        console.warn('[PaymentConfig] 未配置对象存储（WX_CLOUD_ENV/CBR_ENV_ID 或 COS_BUCKET+COS_REGION），证书无法同步到对象存储，重启后需重新上传证书');
    }
    return null;
}

/**
 * 从对象存储下载证书到本地（用于实例启动时恢复）
 * @param {string} type - 'wxcloud'|'cos'
 * @param {string} ref - file_id 或 objectKey
 * @param {string} localPath - 写入的本地路径
 * @returns {Promise<boolean>}
 */
async function downloadCertFromStorage(type, ref, localPath) {
    let url = '';
    if (type === 'wxcloud' && ref) {
        try {
            url = await wxCloudStorage.getTempDownloadUrl(ref, 3600);
        } catch (e) {
            console.warn('[PaymentConfig] 获取云托管证书下载链接失败:', e.message);
            return false;
        }
    } else if (type === 'cos' && ref) {
        try {
            url = await cosStorage.getSignedUrl(ref, 3600);
        } catch (e) {
            console.warn('[PaymentConfig] 获取 COS 证书签名链接失败:', e.message);
            return false;
        }
    }
    if (!url) return false;
    try {
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
        const dir = path.dirname(localPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(localPath, res.data, { mode: 0o600 });
        return true;
    } catch (e) {
        console.warn('[PaymentConfig] 下载证书到本地失败:', e.message);
        return false;
    }
}

/**
 * 若本地证书不存在且配置中有对象存储引用，则从存储恢复到 cert 目录（供启动时调用）
 */
async function ensureCertFromStorage() {
    const config = readConfig();
    const certPath = path.join(CERT_DIR, CERT_CERT_NAME);
    const keyPath = path.join(CERT_DIR, CERT_KEY_NAME);
    let restored = false;
    if (!fs.existsSync(certPath) && config.certStorageRef && config.certStorageType) {
        const ok = await downloadCertFromStorage(config.certStorageType, config.certStorageRef, certPath);
        if (ok) {
            process.env.WX_PAY_CERT_PATH = certPath;
            restored = true;
            console.log('[PaymentConfig] 已从对象存储恢复商户证书');
        }
    }
    if (!fs.existsSync(keyPath) && config.keyStorageRef && config.keyStorageType) {
        const ok = await downloadCertFromStorage(config.keyStorageType, config.keyStorageRef, keyPath);
        if (ok) {
            process.env.WX_PAY_KEY_PATH = keyPath;
            restored = true;
            console.log('[PaymentConfig] 已从对象存储恢复商户私钥');
        }
    }
    return restored;
}

function normalizeBaseUrl(url) {
    if (typeof url !== 'string') return '';
    const s = url.trim();
    if (!s) return '';
    return s.replace(/\/+$/, '');
}

function deriveNotifyUrl(baseUrl) {
    const b = normalizeBaseUrl(baseUrl);
    if (!b) return '';
    return `${b}/api/payment/wechat/notify`;
}

/**
 * 获取配置
 * GET /api/payment-config/get
 */
router.get('/get', authenticateToken, async (req, res) => {
    try {
        const config = readConfig();
        
        // 合并环境变量中的配置（优先级更高）
        const mergedConfig = {
            wxAppId: process.env.WX_APPID || config.wxAppId || '',
            wxMchId: process.env.WX_MCHID || config.wxMchId || '',
            // 不把真实密钥回传到前端（只返回是否已配置）
            wxPayKey: maskSecret(process.env.WX_PAY_KEY || config.wxPayKey || ''),
            // APIv3Key（用于回调解密），优先单独字段；兼容旧的 wxPayKey/WX_PAY_KEY
            wxApiV3Key: maskSecret(process.env.WX_PAY_API_V3_KEY || config.wxApiV3Key || ''),
            wxCertSerialNo: process.env.WX_PAY_CERT_SERIAL_NO || config.wxCertSerialNo || '',
            wxNotifyUrl: process.env.WX_PAY_NOTIFY_URL || config.wxNotifyUrl || '',
            baseUrl: process.env.BASE_URL || config.baseUrl || '',
            sandbox: process.env.WX_PAY_SANDBOX === 'true' || config.sandbox || false,
            certPath: process.env.WX_PAY_CERT_PATH || config.certPath || '/app/cert/apiclient_cert.pem',
            keyPath: process.env.WX_PAY_KEY_PATH || config.keyPath || '/app/cert/apiclient_key.pem'
        };
        // 提供一个“推荐回调地址”（不强制保存），便于没有 HTTPS 时先看效果/后续补齐
        mergedConfig.suggestedNotifyUrl = deriveNotifyUrl(mergedConfig.baseUrl);

        res.json({
            code: 0,
            message: '获取配置成功',
            data: mergedConfig
        });
    } catch (error) {
        console.error('[PaymentConfig] 获取配置失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取配置失败',
            error: error.message
        });
    }
});

/**
 * 保存配置
 * POST /api/payment-config/save
 */
router.post('/save', authenticateToken, async (req, res) => {
    try {
        const existing = readConfig();
        const {
            mode,
            wxAppId,
            wxMchId,
            wxPayKey,
            wxApiV3Key,
            wxCertSerialNo,
            wxNotifyUrl,
            baseUrl,
            sandbox,
            certPath,
            keyPath
        } = req.body;

        const saveMode = (typeof mode === 'string' && mode.trim()) ? mode.trim() : 'all';

        // 以 existing 为基准做增量更新：未提供的字段不覆盖
        const next = { ...existing };

        // 处理密钥：空字符串代表“不修改”
        // - wxPayKey: 兼容旧字段（历史上用于 APIv3Key）
        // - wxApiV3Key: 新增字段，优先用于回调解密
        const currentPayKey = process.env.WX_PAY_KEY || existing.wxPayKey || '';
        const payKeyProvided = (typeof wxPayKey === 'string' && wxPayKey.trim().length > 0);
        const nextPayKey = payKeyProvided ? wxPayKey.trim() : currentPayKey;

        const currentApiV3Key = process.env.WX_PAY_API_V3_KEY || existing.wxApiV3Key || '';
        const apiV3KeyProvided = (typeof wxApiV3Key === 'string' && wxApiV3Key.trim().length > 0);
        const nextApiV3Key = apiV3KeyProvided ? wxApiV3Key.trim() : currentApiV3Key;

        // ====== 按分组写入 ======
        if (saveMode === 'all' || saveMode === 'basic') {
            if (typeof wxAppId === 'string') next.wxAppId = wxAppId.trim();
            if (typeof wxMchId === 'string') next.wxMchId = wxMchId.trim();
            next.wxPayKey = nextPayKey; // 兼容保留
            next.wxApiV3Key = nextApiV3Key; // 新字段：APIv3Key
            if (typeof wxCertSerialNo === 'string') next.wxCertSerialNo = wxCertSerialNo.trim();

            // 基础配置保存时才做“必填校验”
            // 这里要求配置 APIv3Key；兼容：若未填新字段但旧字段有值，也视为已配置
            const effectiveApiV3Key = next.wxApiV3Key || next.wxPayKey;
            if (!next.wxAppId || !next.wxMchId || !effectiveApiV3Key) {
                return res.status(400).json({
                    code: 1,
                    message: '基础配置不完整：请填写小程序AppID、商户号；并配置 APIv3 密钥（首次保存必须填写）'
                });
            }
        }

        if (saveMode === 'all' || saveMode === 'callback') {
            if (typeof baseUrl === 'string') next.baseUrl = normalizeBaseUrl(baseUrl);

            if (typeof wxNotifyUrl === 'string') {
                next.wxNotifyUrl = wxNotifyUrl.trim();
            } else if (next.baseUrl && !next.wxNotifyUrl) {
                // 未显式提供 notifyUrl 时，给一个默认派生（方便只填 baseUrl）
                next.wxNotifyUrl = deriveNotifyUrl(next.baseUrl);
            }

            // 校验 URL 格式（允许为空：你现在可以先不配回调，只保存其它配置）
            if (next.baseUrl && !next.baseUrl.startsWith('http')) {
                return res.status(400).json({
                    code: 1,
                    message: '基础URL必须是有效的URL（以 http:// 或 https:// 开头）'
                });
            }
            if (next.wxNotifyUrl && !next.wxNotifyUrl.startsWith('http')) {
                return res.status(400).json({
                    code: 1,
                    message: '回调地址必须是有效的URL（以 http:// 或 https:// 开头）'
                });
            }
        }

        if (saveMode === 'all' || saveMode === 'env') {
            if (typeof sandbox === 'boolean') next.sandbox = sandbox;
            else if (sandbox === 'true' || sandbox === 'false') next.sandbox = sandbox === 'true';
        }

        if (saveMode === 'all' || saveMode === 'paths') {
            if (typeof certPath === 'string' && certPath.trim()) next.certPath = certPath.trim();
            if (typeof keyPath === 'string' && keyPath.trim()) next.keyPath = keyPath.trim();
        }

        // 补默认值
        next.wxCertSerialNo = next.wxCertSerialNo || '';
        next.wxNotifyUrl = next.wxNotifyUrl || '';
        next.baseUrl = next.baseUrl || '';
        next.sandbox = !!next.sandbox;
        next.certPath = next.certPath || '/app/cert/apiclient_cert.pem';
        next.keyPath = next.keyPath || '/app/cert/apiclient_key.pem';
        next.wxApiV3Key = next.wxApiV3Key || '';
        next.updatedAt = new Date().toISOString();

        // 保存配置到文件
        saveConfig(next);

        // 更新环境变量（仅当前进程，重启后需要重新配置）
        // 注意：这里只是提示，实际需要手动配置环境变量或重启服务
        if (next.wxAppId) process.env.WX_APPID = next.wxAppId;
        if (next.wxMchId) process.env.WX_MCHID = next.wxMchId;
        if (next.wxPayKey) process.env.WX_PAY_KEY = next.wxPayKey;
        if (next.wxApiV3Key) process.env.WX_PAY_API_V3_KEY = next.wxApiV3Key;
        if (next.wxCertSerialNo) process.env.WX_PAY_CERT_SERIAL_NO = next.wxCertSerialNo;
        if (next.wxNotifyUrl) process.env.WX_PAY_NOTIFY_URL = next.wxNotifyUrl;
        if (next.baseUrl) process.env.BASE_URL = next.baseUrl;
        process.env.WX_PAY_SANDBOX = next.sandbox ? 'true' : 'false';
        if (next.certPath) process.env.WX_PAY_CERT_PATH = next.certPath;
        if (next.keyPath) process.env.WX_PAY_KEY_PATH = next.keyPath;

        console.log('[PaymentConfig] 配置已更新（当前进程）');

        res.json({
            code: 0,
            message: '配置保存成功！已写入本地配置文件，并更新当前进程环境变量。',
            data: {
                ...next,
                // 不返回敏感信息
                wxPayKey: next.wxPayKey ? '***已保存***' : '',
                wxApiV3Key: next.wxApiV3Key ? '***已保存***' : ''
            },
            warning: next.wxNotifyUrl
                ? '已写入 config/wechat-payment-config.json（本地联调用）。生产环境建议用环境变量/密钥管理，不建议落盘。'
                : '已保存基础配置。回调地址未配置：你可以先用“假回调”联调业务；正式下单/真回调需要可访问的（通常为HTTPS）回调地址。'
        });
    } catch (error) {
        console.error('[PaymentConfig] 保存配置失败:', error);
        res.status(500).json({
            code: 1,
            message: '保存配置失败',
            error: error.message
        });
    }
});

/**
 * 测试连接
 * POST /api/payment-config/test
 */
router.post('/test', authenticateToken, async (req, res) => {
    try {
        const config = readConfig();
        const wxAppId = process.env.WX_APPID || config.wxAppId;
        const wxMchId = process.env.WX_MCHID || config.wxMchId;
        const wxPayKey = process.env.WX_PAY_KEY || config.wxPayKey;
        const wxApiV3Key = process.env.WX_PAY_API_V3_KEY || config.wxApiV3Key || '';

        // 检查基本配置
        if (!wxAppId || !wxMchId || !(wxApiV3Key || wxPayKey)) {
            return res.status(400).json({
                code: 1,
                message: '配置不完整，请先配置小程序AppID、商户号和 APIv3 密钥'
            });
        }

        // 检查证书文件是否存在
        const certPath = process.env.WX_PAY_CERT_PATH || config.certPath || '/app/cert/apiclient_cert.pem';
        const keyPath = process.env.WX_PAY_KEY_PATH || config.keyPath || '/app/cert/apiclient_key.pem';

        const certExists = fs.existsSync(certPath);
        const keyExists = fs.existsSync(keyPath);

        // 服务状态：当前为运行时读 env，无 appId/mchId 实例属性，用 env 判断
        const serviceReady = !!(wxAppId && wxMchId && wxPayKey);
        const serviceStatus = serviceReady ? '已就绪（运行时读 env）' : '未就绪';

        const result = {
            configComplete: !!(wxAppId && wxMchId && (wxApiV3Key || wxPayKey)),
            certExists,
            keyExists,
            serviceStatus,
            wxAppId: wxAppId ? '已配置' : '未配置',
            wxMchId: wxMchId ? '已配置' : '未配置',
            wxApiV3Key: (wxApiV3Key || wxPayKey) ? '已配置' : '未配置',
            sandbox: (process.env.WX_PAY_SANDBOX === 'true') || !!config.sandbox
        };

        // 基础配置完整即视为“连接测试通过”；证书缺失时仅提示，不判失败
        if (result.configComplete) {
            res.json({
                code: 0,
                message: certExists && keyExists
                    ? '配置检查通过，可发起支付'
                    : '基础配置可用；证书/私钥未就绪时无法发起真实下单，可先使用假回调联调',
                data: result,
                warning: (!certExists || !keyExists)
                    ? '证书或私钥文件未找到，请上传至服务器后发起支付将正常可用。'
                    : undefined
            });
        } else {
            res.json({
                code: 1,
                message: '配置不完整，请先配置小程序AppID、商户号和 APIv3 密钥',
                data: result,
                issues: ['请填写小程序AppID、商户号、APIv3密钥（首次保存必须填写）']
            });
        }
    } catch (error) {
        console.error('[PaymentConfig] 测试连接失败:', error);
        res.status(500).json({
            code: 1,
            message: '测试连接失败',
            error: error.message
        });
    }
});

/**
 * 上传证书文件
 * POST /api/payment-config/upload-cert
 * multipart: certFile (apiclient_cert.pem), keyFile (apiclient_key.pem)，可只传其中一个
 */
router.post('/upload-cert', authenticateToken, (req, res, next) => {
    uploadCert.fields([
        { name: 'certFile', maxCount: 1 },
        { name: 'keyFile', maxCount: 1 }
    ])(req, res, (err) => {
        if (err) {
            const msg = err instanceof multer.MulterError
                ? (err.code === 'LIMIT_FILE_SIZE' ? '文件大小不能超过 512KB' : err.message)
                : (err.message || '上传失败');
            return res.status(400).json({ code: 1, message: msg });
        }
        next();
    });
}, async (req, res) => {
    try {
        const files = req.files || {};
        const certFile = Array.isArray(files.certFile) ? files.certFile[0] : files.certFile;
        const keyFile = Array.isArray(files.keyFile) ? files.keyFile[0] : files.keyFile;

        if (!certFile && !keyFile) {
            return res.status(400).json({
                code: 1,
                message: '请至少选择一个证书文件（商户证书或商户私钥）'
            });
        }

        const certPath = path.join(CERT_DIR, CERT_CERT_NAME);
        const keyPath = path.join(CERT_DIR, CERT_KEY_NAME);
        const certSaved = !!certFile;
        const keySaved = !!keyFile;

        // 同步到对象存储并写入配置引用，便于实例重启后恢复
        const config = readConfig();
        if (certSaved) {
            const certStorage = await uploadCertToStorage(certPath, CERT_CERT_NAME);
            if (certStorage) {
                config.certStorageType = certStorage.type;
                config.certStorageRef = certStorage.ref;
            }
        }
        if (keySaved) {
            const keyStorage = await uploadCertToStorage(keyPath, CERT_KEY_NAME);
            if (keyStorage) {
                config.keyStorageType = keyStorage.type;
                config.keyStorageRef = keyStorage.ref;
            }
        }
        if ((certSaved || keySaved) && (config.certStorageRef || config.keyStorageRef)) {
            saveConfig(config);
        }

        process.env.WX_PAY_CERT_PATH = certPath;
        process.env.WX_PAY_KEY_PATH = keyPath;

        const messages = [];
        if (certSaved) messages.push('商户证书已上传');
        if (keySaved) messages.push('商户私钥已上传');
        if (config.certStorageRef || config.keyStorageRef) messages.push('已同步至对象存储');

        res.json({
            code: 0,
            message: messages.join('；'),
            data: {
                certPath,
                keyPath,
                certSaved,
                keySaved
            }
        });
    } catch (error) {
        console.error('[PaymentConfig] 上传证书失败:', error);
        res.status(500).json({
            code: 1,
            message: '上传证书失败',
            error: error.message
        });
    }
});

/**
 * 上传证书包（zip）并解压，从中提取 apiclient_cert.pem、apiclient_key.pem 写入 cert 目录
 * POST /api/payment-config/upload-cert-zip
 * multipart: certZip (单个 .zip 文件)
 */
function findEntryByName(zip, baseName) {
    const lower = baseName.toLowerCase();
    const entries = zip.getEntries();
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (e.isDirectory) continue;
        const name = path.basename(e.entryName).toLowerCase();
        if (name === lower) return e;
    }
    return null;
}

router.post('/upload-cert-zip', authenticateToken, (req, res, next) => {
    uploadZip.single('certZip')(req, res, (err) => {
        if (err) {
            const msg = err instanceof multer.MulterError
                ? (err.code === 'LIMIT_FILE_SIZE' ? '证书包大小不能超过 2MB' : err.message)
                : (err.message || '上传失败');
            return res.status(400).json({ code: 1, message: msg });
        }
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({
                code: 1,
                message: '请选择证书包（.zip）文件'
            });
        }

        let zip;
        try {
            zip = new AdmZip(req.file.buffer);
        } catch (e) {
            return res.status(400).json({
                code: 1,
                message: '无法解析 zip 文件，请确认是有效的证书包'
            });
        }

        const certEntry = findEntryByName(zip, 'apiclient_cert.pem');
        const keyEntry = findEntryByName(zip, 'apiclient_key.pem');

        if (!certEntry && !keyEntry) {
            return res.status(400).json({
                code: 1,
                message: '证书包中未找到 apiclient_cert.pem 或 apiclient_key.pem，请使用微信支付商户平台下载的证书包'
            });
        }

        const certPath = path.join(CERT_DIR, CERT_CERT_NAME);
        const keyPath = path.join(CERT_DIR, CERT_KEY_NAME);

        if (certEntry) {
            fs.writeFileSync(certPath, certEntry.getData(), { mode: 0o600 });
        }
        if (keyEntry) {
            fs.writeFileSync(keyPath, keyEntry.getData(), { mode: 0o600 });
        }

        const config = readConfig();
        if (certEntry) {
            const certStorage = await uploadCertToStorage(certPath, CERT_CERT_NAME);
            if (certStorage) {
                config.certStorageType = certStorage.type;
                config.certStorageRef = certStorage.ref;
            }
        }
        if (keyEntry) {
            const keyStorage = await uploadCertToStorage(keyPath, CERT_KEY_NAME);
            if (keyStorage) {
                config.keyStorageType = keyStorage.type;
                config.keyStorageRef = keyStorage.ref;
            }
        }
        if ((certEntry || keyEntry) && (config.certStorageRef || config.keyStorageRef)) {
            saveConfig(config);
        }

        process.env.WX_PAY_CERT_PATH = certPath;
        process.env.WX_PAY_KEY_PATH = keyPath;

        const parts = [];
        if (certEntry) parts.push('商户证书');
        if (keyEntry) parts.push('商户私钥');
        if (config.certStorageRef || config.keyStorageRef) parts.push('已同步至对象存储');

        res.json({
            code: 0,
            message: '证书包已解压，已提取：' + parts.join('、'),
            data: {
                certPath,
                keyPath,
                certSaved: !!certEntry,
                keySaved: !!keyEntry
            }
        });
    } catch (error) {
        console.error('[PaymentConfig] 上传证书包失败:', error);
        res.status(500).json({
            code: 1,
            message: '上传证书包失败',
            error: error.message
        });
    }
});

module.exports = router;
module.exports.ensureCertFromStorage = ensureCertFromStorage;
