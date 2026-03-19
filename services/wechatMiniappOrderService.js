const axios = require('axios');

const TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token';
const UPLOAD_SHIPPING_URL = 'https://api.weixin.qq.com/wxa/sec/order/upload_shipping_info';
const CONFIRM_RECEIVE_URL = 'https://api.weixin.qq.com/wxa/sec/order/notify_confirm_receive';

let tokenCache = {
    token: '',
    expireAt: 0
};

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

function buildOrderKey(order) {
    // 这里统一使用商户单号模式（微信支付 out_trade_no）
    return {
        order_number_type: 2,
        mchid: String(process.env.WX_MCHID || ''),
        out_trade_no: String(order.orderNo || '')
    };
}

async function uploadShippingInfo({ order, memberOpenid, isPickup, shippingCompany, trackingNumber, receiverPhone }) {
    if (!isEnabled()) {
        return { skipped: true, reason: 'miniapp-config-missing' };
    }
    if (!order || !order.orderNo) {
        throw new Error('订单信息不完整');
    }
    const accessToken = await getAccessToken();

    const payload = {
        order_key: buildOrderKey(order),
        logistics_type: isPickup ? 4 : 1, // 1: 物流配送, 4: 用户自提
        delivery_mode: isPickup ? 2 : 1, // 1: 物流配送, 2: 同城/自提
        upload_time: Math.floor(Date.now() / 1000),
        payer: {
            openid: String(memberOpenid || '')
        },
        shipping_list: isPickup ? [] : [{
            tracking_no: String(trackingNumber || ''),
            express_company: String(shippingCompany || ''),
            item_desc: '订单商品'
        }],
        receiver_contact: {
            receiver_contact: String(receiverPhone || '')
        }
    };

    const res = await axios.post(`${UPLOAD_SHIPPING_URL}?access_token=${encodeURIComponent(accessToken)}`, payload, {
        timeout: 12000
    });
    const data = res.data || {};
    if (data.errcode !== 0) {
        throw new Error(`upload_shipping_info 失败: ${data.errcode} ${data.errmsg || ''}`.trim());
    }
    return data;
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
    notifyConfirmReceive
};

