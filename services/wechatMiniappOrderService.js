const axios = require('axios');

const TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token';
const UPLOAD_SHIPPING_URL = 'https://api.weixin.qq.com/wxa/sec/order/upload_shipping_info';
const CONFIRM_RECEIVE_URL = 'https://api.weixin.qq.com/wxa/sec/order/notify_confirm_receive';

let tokenCache = {
    token: '',
    expireAt: 0
};

/** 微信「获取运力 id 列表」中的快递公司编码，中文名称需映射，否则易报错或无法同步 */
const EXPRESS_COMPANY_MAP = {
    顺丰速运: 'SF',
    顺丰: 'SF',
    SF: 'SF',
    圆通速递: 'YTO',
    圆通: 'YTO',
    YTO: 'YTO',
    中通快递: 'ZTO',
    中通: 'ZTO',
    ZTO: 'ZTO',
    申通快递: 'STO',
    申通: 'STO',
    STO: 'STO',
    韵达速递: 'YD',
    韵达: 'YD',
    YD: 'YD',
    京东物流: 'JD',
    京东: 'JD',
    JD: 'JD',
    德邦快递: 'DBL',
    德邦: 'DBL',
    DBL: 'DBL',
    极兔速递: 'JTSD',
    邮政快递包裹: 'YZPY',
    其他: 'OTHER',
    OTHER: 'OTHER'
};

function normalizeExpressCompany(input) {
    const s = String(input || '').trim();
    if (!s) return 'OTHER';
    if (EXPRESS_COMPANY_MAP[s]) return EXPRESS_COMPANY_MAP[s];
    const upper = s.toUpperCase();
    if (EXPRESS_COMPANY_MAP[upper]) return EXPRESS_COMPANY_MAP[upper];
    if (/^[A-Z0-9_]{2,20}$/.test(upper)) return upper;
    return 'OTHER';
}

/**
 * 微信要求 upload_time 为 RFC 3339（错误码 268485216），不可用 Unix 秒
 */
function formatUploadTimeRfc3339() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).formatToParts(new Date());
    const g = (t) => parts.find((p) => p.type === t)?.value || '00';
    const ms = String(new Date().getMilliseconds()).padStart(3, '0');
    return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}.${ms}+08:00`;
}

function buildItemDesc(order, fallback) {
    const fb = fallback || '订单商品';
    try {
        const items = order?.items || [];
        if (!items.length) return fb;
        const parts = items.slice(0, 5).map((it) => {
            const name = String(it.productName || it.skuName || '商品').slice(0, 40);
            const q = it.quantity || 1;
            return `${name}*${q}`;
        });
        const s = parts.join('；').slice(0, 120);
        return s || fb;
    } catch (_) {
        return fb;
    }
}

/**
 * 订单号：类型2=微信支付单号+transaction_id；类型1=商户号+商户订单号
 * （原先误用 type2+mchid+out_trade_no 会导致支付单匹配失败）
 */
function buildOrderKey(order) {
    const tid = String(order.transactionId || '').trim();
    if (tid) {
        return { order_number_type: 2, transaction_id: tid };
    }
    const mchid = String(process.env.WX_MCHID || '').trim();
    const out = String(order.orderNo || '').trim();
    if (!mchid || !out) {
        throw new Error('订单缺少微信支付 transactionId，且未配置 WX_MCHID 或订单号为空，无法匹配微信支付单');
    }
    return { order_number_type: 1, mchid, out_trade_no: out };
}

function isEnabled() {
    return !!(process.env.WX_APPID && process.env.WX_APPSECRET);
}

async function getAccessToken() {
    const now = Date.now();
    if (tokenCache.token && tokenCache.expireAt - now > 60 * 1000) {
        return tokenCache.token;
    }

    const appid = process.env.WX_APPID;
    const secret = process.env.WX_APPSECRET;
    if (!appid || !secret) {
        throw new Error('缺少 WX_APPID 或 WX_APPSECRET');
    }

    const res = await axios.get(TOKEN_URL, {
        params: {
            grant_type: 'client_credential',
            appid,
            secret
        },
        timeout: 10000
    });
    const data = res.data || {};
    if (!data.access_token) {
        throw new Error(data.errmsg || '获取 access_token 失败');
    }
    const expiresIn = Number(data.expires_in || 7200);
    tokenCache = {
        token: data.access_token,
        expireAt: now + expiresIn * 1000
    };
    return tokenCache.token;
}

/**
 * @param {object} order - 需含 orderNo、transactionId（推荐）、items 可选
 * @param {boolean} isPickup - 用户自提：logistics_type=4，shipping_list 仅 item_desc，无需单号
 */
async function uploadShippingInfo({ order, memberOpenid, isPickup, shippingCompany, trackingNumber, receiverPhone }) {
    if (!isEnabled()) {
        return { skipped: true, reason: 'miniapp-config-missing' };
    }
    if (!order || !order.orderNo) {
        throw new Error('订单信息不完整');
    }
    const accessToken = await getAccessToken();

    const itemDesc = isPickup ? buildItemDesc(order, '门店自提-订单商品') : buildItemDesc(order);

    /** delivery_mode：1=统一发货，2=分拆发货。自提/快递统一发货均填 1（原先误将自提填 2 会触发「发货模式非法」） */
    const payload = {
        order_key: buildOrderKey(order),
        logistics_type: isPickup ? 4 : 1,
        delivery_mode: 1,
        upload_time: formatUploadTimeRfc3339(),
        payer: {
            openid: String(memberOpenid || '')
        },
        shipping_list: isPickup
            ? [{ item_desc: itemDesc }]
            : [
                  {
                      tracking_no: String(trackingNumber || '').trim(),
                      express_company: normalizeExpressCompany(shippingCompany),
                      item_desc: itemDesc
                  }
              ]
    };

    const phone = String(receiverPhone || '').trim();
    if (phone) {
        payload.receiver_contact = phone;
    }

    const res = await axios.post(`${UPLOAD_SHIPPING_URL}?access_token=${encodeURIComponent(accessToken)}`, payload, {
        timeout: 12000
    });
    const data = res.data || {};
    if (data.errcode !== 0) {
        throw new Error(`upload_shipping_info 失败: ${data.errcode} ${data.errmsg || ''}`.trim());
    }
    return data;
}

/** 后台发货后：带订单明细拼 item_desc */
async function syncAdminOrderShippingToWechat(orderId, { isPickup, shippingCompany, trackingNumber }) {
    const { Order, OrderItem, Member } = require('../db');
    const order = await Order.findByPk(orderId, {
        include: [{ model: OrderItem, as: 'items', attributes: ['productName', 'skuName', 'quantity'], required: false }]
    });
    if (!order) throw new Error('订单不存在');
    const member = await Member.findByPk(order.memberId, { attributes: ['id', 'openid', 'phone'] });
    return uploadShippingInfo({
        order,
        memberOpenid: member?.openid,
        isPickup: !!isPickup,
        shippingCompany,
        trackingNumber,
        receiverPhone: order.receiverPhone || member?.phone || ''
    });
}

async function notifyConfirmReceive({ order }) {
    if (!isEnabled()) {
        return { skipped: true, reason: 'miniapp-config-missing' };
    }
    if (!order || !order.orderNo) {
        throw new Error('订单信息不完整');
    }
    const accessToken = await getAccessToken();
    const payload = {
        order_key: buildOrderKey(order)
    };
    const res = await axios.post(`${CONFIRM_RECEIVE_URL}?access_token=${encodeURIComponent(accessToken)}`, payload, {
        timeout: 12000
    });
    const data = res.data || {};
    if (data.errcode !== 0) {
        throw new Error(`notify_confirm_receive 失败: ${data.errcode} ${data.errmsg || ''}`.trim());
    }
    return data;
}

module.exports = {
    isEnabled,
    uploadShippingInfo,
    syncAdminOrderShippingToWechat,
    notifyConfirmReceive,
    normalizeExpressCompany,
    buildOrderKey
};
