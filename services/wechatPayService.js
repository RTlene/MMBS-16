/**
 * 微信支付服务
 * 支持微信支付 API v3
 */

const crypto = require('crypto');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');

// 云托管等环境出网可能经代理/SSL 拦截，请求微信支付 API 时需跳过证书校验
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

class WeChatPayService {
    constructor() {
        // 运行时动态读取 env（支持后台切换沙箱/生产后立即生效）
        this.certPath = null;
        this.keyPath = null;
        this.notifyUrl = null;

        // 加载证书（如果存在）
        this.privateKey = null;
        this.certSerialNo = null;
        this.refreshFromEnv();
    }

    refreshFromEnv() {
        const nextCertPath = process.env.WX_PAY_CERT_PATH || path.join(__dirname, '../cert/apiclient_cert.pem');
        const nextKeyPath = process.env.WX_PAY_KEY_PATH || path.join(__dirname, '../cert/apiclient_key.pem');
        this.notifyUrl = process.env.WX_PAY_NOTIFY_URL || `${process.env.BASE_URL || 'http://localhost:3000'}/api/payment/wechat/notify`;

        const pathChanged = (this.certPath !== nextCertPath) || (this.keyPath !== nextKeyPath);
        this.certPath = nextCertPath;
        this.keyPath = nextKeyPath;

        // 路径变更、私钥/序列号未加载或序列号为占位符时重新加载
        const needReload = pathChanged || !this.privateKey || !this.certSerialNo ||
            (this.certSerialNo === 'YOUR_CERT_SERIAL_NO');
        if (needReload) {
            this.loadCertificates();
        }
    }

    getBaseUrl() {
        const sandbox = process.env.WX_PAY_SANDBOX === 'true';
        return sandbox ? 'https://api.mch.weixin.qq.com/sandboxnew' : 'https://api.mch.weixin.qq.com';
    }

    /**
     * 从证书文件解析序列号（微信支付 v3 要求 serial_no 与签名证书一致）
     */
    _parseCertSerialNo(certPem) {
        try {
            if (typeof crypto.X509Certificate !== 'function') {
                return null;
            }
            const cert = new crypto.X509Certificate(certPem);
            const serial = cert.serialNumber; // Node 返回十六进制，可能带冒号
            if (!serial) return null;
            return serial.replace(/:/g, '').toUpperCase();
        } catch (e) {
            return null;
        }
    }

    /**
     * 加载证书
     */
    loadCertificates() {
        try {
            if (fs.existsSync(this.keyPath)) {
                this.privateKey = fs.readFileSync(this.keyPath, 'utf8');
                console.log('[WeChatPay] 私钥加载成功');
            } else {
                console.warn('[WeChatPay] 私钥文件不存在，将使用测试模式');
                this.privateKey = null;
            }

            if (fs.existsSync(this.certPath)) {
                const certPem = fs.readFileSync(this.certPath, 'utf8');
                const parsedSerial = this._parseCertSerialNo(certPem);
                this.certSerialNo = process.env.WX_PAY_CERT_SERIAL_NO || parsedSerial || this.certSerialNo || null;
                if (parsedSerial) {
                    console.log('[WeChatPay] 证书加载成功，序列号:', parsedSerial);
                } else if (this.certSerialNo) {
                    console.log('[WeChatPay] 证书加载成功，序列号(env):', this.certSerialNo);
                } else {
                    console.warn('[WeChatPay] 证书序列号未解析到，请在后台配置「证书序列号」或检查证书文件');
                    this.certSerialNo = null;
                }
            } else {
                console.warn('[WeChatPay] 证书文件不存在，将使用测试模式');
                this.certSerialNo = process.env.WX_PAY_CERT_SERIAL_NO || this.certSerialNo || null;
            }
        } catch (error) {
            console.error('[WeChatPay] 证书加载失败:', error.message);
        }
    }

    /** 是否已加载商户私钥（可发起统一下单与生成支付参数） */
    hasPrivateKey() {
        this.refreshFromEnv();
        return !!this.privateKey;
    }

    /**
     * 生成签名
     */
    generateSignature(method, url, timestamp, nonceStr, body) {
        if (!this.privateKey) {
            throw new Error('私钥未配置，无法生成签名');
        }

        const signStr = `${method}\n${url}\n${timestamp}\n${nonceStr}\n${body}\n`;
        
        const sign = crypto.createSign('RSA-SHA256');
        sign.update(signStr);
        sign.end();
        
        return sign.sign(this.privateKey, 'base64');
    }

    /**
     * 生成 Authorization 头（mchId / certSerialNo 从 env 或已加载的证书信息取）
     */
    generateAuthHeader(method, url, body) {
        const mchId = process.env.WX_MCHID || '';
        const serialNo = this.certSerialNo || process.env.WX_PAY_CERT_SERIAL_NO || '';
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const nonceStr = crypto.randomBytes(16).toString('hex');
        const signature = this.generateSignature(method, url, timestamp, nonceStr, body);
        return `WECHATPAY2-SHA256-RSA2048 mchid="${mchId}",nonce_str="${nonceStr}",signature="${signature}",timestamp="${timestamp}",serial_no="${serialNo}"`;
    }

    /**
     * 小程序统一下单
     * @param {Object} params - 订单参数
     * @param {string} params.outTradeNo - 商户订单号
     * @param {string} params.description - 商品描述
     * @param {number} params.total - 订单总金额（单位：分）
     * @param {string} params.openid - 用户openid
     * @param {string} params.attach - 附加数据（可选）
     */
    async createJsapiOrder(params) {
        const { outTradeNo, description, total, openid, attach } = params;

        this.refreshFromEnv();
        const appId = process.env.WX_APPID;
        const mchId = process.env.WX_MCHID;

        if (!appId || !mchId) {
            throw new Error('微信支付配置不完整，请检查 WX_APPID 和 WX_MCHID');
        }
        if (!this.certSerialNo) {
            throw new Error('证书序列号未配置，请上传 apiclient_cert.pem 或在后台填写证书序列号');
        }
        if (!this.privateKey) {
            throw new Error('商户私钥未配置，请上传 apiclient_key.pem');
        }

        const baseUrl = this.getBaseUrl();
        const url = `${baseUrl}/v3/pay/transactions/jsapi`;
        
        const requestBody = {
            appid: appId,
            mchid: mchId,
            description: description || '商品订单',
            out_trade_no: outTradeNo,
            notify_url: this.notifyUrl,
            amount: {
                total: Math.round(total), // 确保是整数（分）
                currency: 'CNY'
            },
            payer: {
                openid: openid
            }
        };

        if (attach) {
            requestBody.attach = attach;
        }

        const bodyStr = JSON.stringify(requestBody);
        const authHeader = this.generateAuthHeader('POST', '/v3/pay/transactions/jsapi', bodyStr);

        try {
            const response = await axios.post(url, requestBody, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authHeader,
                    'Accept': 'application/json',
                    'User-Agent': 'WeChatPay-APIv3-NodeJS'
                },
                timeout: 10000,
                httpsAgent
            });

            return {
                prepayId: response.data.prepay_id,
                ...response.data
            };
        } catch (error) {
            const status = error.response?.status;
            const wxData = error.response?.data;
            const code = wxData?.code || error.code;
            const message = wxData?.message || error.message;
            const isSandbox = process.env.WX_PAY_SANDBOX === 'true';

            console.error('[WeChatPay] 统一下单失败:', { code, message, status, detail: wxData });

            // 沙箱模式下 404：微信支付 APIv3 沙箱可能未开放或路径已变更，建议改用生产环境小额测试
            if (isSandbox && status === 404) {
                throw new Error(
                    '沙箱统一下单返回 404，当前微信支付 APIv3 沙箱可能不可用。建议：在后台切换为「生产模式」，使用 0.01 元订单进行真实支付测试；或使用 scripts/simulate-payment-notify.ps1 模拟支付回调验证流程。'
                );
            }
            throw new Error(message || '统一下单失败');
        }
    }

    /**
     * 生成小程序支付参数（微信支付 API v3）
     * @param {string} prepayId - 预支付交易会话ID
     */
    generateMiniProgramPayParams(prepayId) {
        this.refreshFromEnv();
        const appId = process.env.WX_APPID;
        if (!appId) {
            throw new Error('WX_APPID 未配置');
        }

        if (!this.privateKey) {
            throw new Error('私钥未配置，无法生成支付参数');
        }

        const timestamp = Math.floor(Date.now() / 1000).toString();
        const nonceStr = crypto.randomBytes(16).toString('hex');
        const packageStr = `prepay_id=${prepayId}`;

        // 微信支付 API v3 使用 RSA-SHA256 签名
        // 签名串格式：appId\n时间戳\n随机字符串\nprepay_id=xxx\n
        const signStr = `${appId}\n${timestamp}\n${nonceStr}\n${packageStr}\n`;
        
        const sign = crypto.createSign('RSA-SHA256');
        sign.update(signStr);
        sign.end();
        const paySign = sign.sign(this.privateKey, 'base64');

        return {
            timeStamp: timestamp,
            nonceStr: nonceStr,
            package: packageStr,
            signType: 'RSA',
            paySign: paySign
        };
    }

    /**
     * 查询订单
     * @param {string} outTradeNo - 商户订单号
     */
    async queryOrder(outTradeNo) {
        this.refreshFromEnv();
        const baseUrl = this.getBaseUrl();
        const url = `${baseUrl}/v3/pay/transactions/out-trade-no/${outTradeNo}`;
        const authHeader = this.generateAuthHeader('GET', `/v3/pay/transactions/out-trade-no/${outTradeNo}`, '');

        try {
            const response = await axios.get(url, {
                headers: {
                    'Authorization': authHeader,
                    'Accept': 'application/json'
                },
                httpsAgent
            });

            return response.data;
        } catch (error) {
            console.error('[WeChatPay] 查询订单失败:', error.response?.data || error.message);
            throw new Error(error.response?.data?.message || '查询订单失败');
        }
    }

    /**
     * 关闭订单
     * @param {string} outTradeNo - 商户订单号
     */
    async closeOrder(outTradeNo) {
        this.refreshFromEnv();
        const baseUrl = this.getBaseUrl();
        const url = `${baseUrl}/v3/pay/transactions/out-trade-no/${outTradeNo}/close`;
        const requestBody = {
            mchid: process.env.WX_MCHID
        };
        const bodyStr = JSON.stringify(requestBody);
        const authHeader = this.generateAuthHeader('POST', `/v3/pay/transactions/out-trade-no/${outTradeNo}/close`, bodyStr);

        try {
            const response = await axios.post(url, requestBody, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authHeader,
                    'Accept': 'application/json'
                },
                httpsAgent
            });

            return response.data;
        } catch (error) {
            console.error('[WeChatPay] 关闭订单失败:', error.response?.data || error.message);
            throw new Error(error.response?.data?.message || '关闭订单失败');
        }
    }

    /**
     * 商家转账到零钱（单笔）- 使用升级版接口「发起转账」
     * 商户号接入升级版后需使用 /v3/fund-app/mch-transfer/transfer-bills，并传转账场景 1005（佣金报酬）及报备信息。
     * 收款人以 openid 标识；单笔>=2000元时需传加密的 userName（需配置 Wechatpay-Serial 与公钥），此处仅实现小额不传姓名。
     * @param {Object} params
     * @param {string} params.outBatchNo - 商户单号（唯一，仅数字与字母）
     * @param {string} params.openid - 收款用户 openid（必填）
     * @param {number} params.amountCents - 转账金额（单位：分）
     * @param {string} [params.remark] - 转账备注（用户可见，最多32字符）
     * @param {string} [params.userName] - 收款用户真实姓名（>=2000元时必填且需公钥加密，当前未实现加密则仅支持小额）
     * @returns {Promise<{ out_bill_no, transfer_bill_no, create_time, state, package_info? }>}
     */
    async transferToBalance(params) {
        const { outBatchNo, openid, amountCents, remark, userName } = params;
        this.refreshFromEnv();
        const appId = process.env.WX_APPID;
        const mchId = process.env.WX_MCHID;
        if (!appId || !mchId) throw new Error('微信支付配置不完整，请检查 WX_APPID 和 WX_MCHID');
        if (!this.privateKey || !this.certSerialNo) throw new Error('商户证书/私钥未配置');
        if (!openid || amountCents == null || amountCents < 1) throw new Error('转账参数无效：openid 与金额（分）必填且金额大于 0');

        // 商户单号仅数字与字母，最长 32
        const outBillNo = String(outBatchNo).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32) || 'WD' + Date.now();
        const transferRemark = (remark || '佣金提现').substring(0, 32);
        const transferAmount = Math.round(Number(amountCents));

        // 升级版接口：必填 transfer_scene_id（1005=佣金报酬）、transfer_scene_report_infos（岗位类型+报酬说明）
        const requestBody = {
            appid: appId,
            out_bill_no: outBillNo,
            transfer_scene_id: '1005',
            openid: openid.trim(),
            transfer_amount: transferAmount,
            transfer_remark: transferRemark,
            user_recv_perception: '劳务报酬',
            transfer_scene_report_infos: [
                { info_type: '岗位类型', info_content: '分销员' },
                { info_type: '报酬说明', info_content: '佣金提现' }
            ]
        };
        // 单笔>=2000元时微信要求传 user_name 且需用微信支付公钥 RSA 加密，并带 Wechatpay-Serial。当前未实现加密，仅支持单笔<2000元。
        // if (userName && userName.trim()) requestBody.user_name = '<加密后的姓名>';

        const urlPath = '/v3/fund-app/mch-transfer/transfer-bills';
        const bodyStr = JSON.stringify(requestBody);
        const baseUrl = 'https://api.mch.weixin.qq.com';
        const authHeader = this.generateAuthHeader('POST', urlPath, bodyStr);
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
            'Accept': 'application/json',
            'User-Agent': 'WeChatPay-APIv3-NodeJS'
        };
        if (process.env.WECHATPAY_SERIAL) {
            headers['Wechatpay-Serial'] = process.env.WECHATPAY_SERIAL;
        }

        try {
            const response = await axios.post(baseUrl + urlPath, requestBody, {
                headers,
                timeout: 15000,
                httpsAgent
            });
            return response.data;
        } catch (error) {
            const wxData = error.response?.data;
            const code = wxData?.code;
            const message = wxData?.message || error.message;
            console.error('[WeChatPay] 商家转账失败:', { code, message, detail: wxData });
            throw new Error(message || '商家转账失败');
        }
    }

    /**
     * 验证支付回调签名
     * @param {Object} headers - 请求头
     * @param {string} body - 请求体
     */
    verifyNotifySignature(headers, body) {
        // TODO: 实现签名验证逻辑
        // 微信支付API v3 使用 Wechatpay-Signature 头进行签名验证
        return true; // 简化处理，实际应验证签名
    }

    /**
     * 解密支付回调数据
     * @param {Object} notifyData - 回调数据
     */
    decryptNotifyData(notifyData) {
        // 微信支付 API v3 回调 resource 使用 APIv3Key(AES-256-GCM) 加密
        // 参考字段：resource.ciphertext / resource.nonce / resource.associated_data
        // 优先使用 WX_PAY_API_V3_KEY；为兼容旧配置，回退到 WX_PAY_KEY
        const apiV3Key = process.env.WX_PAY_API_V3_KEY || process.env.WX_PAY_KEY;
        if (!apiV3Key || String(apiV3Key).trim().length === 0) {
            throw new Error('未配置 APIv3Key（用于解密微信支付回调 resource）：请设置 WX_PAY_API_V3_KEY（或兼容使用 WX_PAY_KEY）');
        }

        const resource = notifyData?.resource;
        if (!resource || typeof resource !== 'object') {
            throw new Error('回调数据缺少 resource');
        }
        const ciphertext = resource.ciphertext;
        const nonce = resource.nonce;
        const associatedData = resource.associated_data || '';
        if (!ciphertext || !nonce) {
            throw new Error('回调 resource 缺少 ciphertext/nonce');
        }

        // ciphertext 格式：base64( 密文 + 16字节tag )
        const cipherBuf = Buffer.from(ciphertext, 'base64');
        if (cipherBuf.length <= 16) {
            throw new Error('回调 resource ciphertext 长度不合法');
        }
        const data = cipherBuf.subarray(0, cipherBuf.length - 16);
        const authTag = cipherBuf.subarray(cipherBuf.length - 16);

        // 微信要求 APIv3Key 为 32 字节（ASCII）
        const keyBuf = Buffer.from(String(apiV3Key), 'utf8');
        if (keyBuf.length !== 32) {
            throw new Error(`WX_PAY_KEY 长度不正确：期望 32 字节，实际 ${keyBuf.length} 字节`);
        }

        const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, nonce);
        if (associatedData) {
            decipher.setAAD(Buffer.from(String(associatedData), 'utf8'));
        }
        decipher.setAuthTag(authTag);
        const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
        return JSON.parse(plain);
    }
}

module.exports = new WeChatPayService();
