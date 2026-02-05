/**
 * 支付路由
 * 处理微信支付相关接口
 */

const express = require('express');
const { authenticateMiniappUser } = require('../middleware/miniapp-auth');
const { authenticateToken } = require('../middleware/auth');
const { Order, Member } = require('../db');
const wechatPayService = require('../services/wechatPayService');

const router = express.Router();

/**
 * 创建微信支付订单（小程序）
 * POST /api/payment/wechat/create
 */
router.post('/wechat/create', authenticateMiniappUser, async (req, res) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
        const { orderId } = req.body;
        const member = req.member;
        console.log('[Payment] create 请求开始:', {
            requestId,
            orderId,
            memberId: member?.id,
            hasOpenid: !!member?.openid
        });

        if (!orderId) {
            console.warn('[Payment] create 缺少参数 orderId:', { requestId, memberId: member?.id });
            return res.status(400).json({
                code: 1,
                message: '订单ID不能为空'
            });
        }

        // 查询订单
        const order = await Order.findByPk(orderId, {
            include: [{
                model: Member,
                as: 'member'
            }]
        });

        if (!order) {
            console.warn('[Payment] create 订单不存在:', { requestId, orderId, memberId: member?.id });
            return res.status(404).json({
                code: 1,
                message: '订单不存在'
            });
        }

        // 验证订单是否属于当前用户
        if (order.memberId !== member.id) {
            console.warn('[Payment] create 越权访问订单:', {
                requestId,
                orderId,
                orderMemberId: order.memberId,
                memberId: member.id
            });
            return res.status(403).json({
                code: 1,
                message: '无权访问此订单'
            });
        }

        // 验证订单状态
        if (order.status !== 'pending') {
            console.warn('[Payment] create 订单状态不允许支付:', {
                requestId,
                orderId: order.id,
                orderNo: order.orderNo,
                status: order.status
            });
            return res.status(400).json({
                code: 1,
                message: '订单状态不正确，无法支付'
            });
        }

        // 验证支付方式
        if (order.paymentMethod !== 'wechat') {
            console.warn('[Payment] create 支付方式不匹配:', {
                requestId,
                orderId: order.id,
                orderNo: order.orderNo,
                paymentMethod: order.paymentMethod
            });
            return res.status(400).json({
                code: 1,
                message: '订单支付方式不是微信支付'
            });
        }

        // 检查是否配置了微信支付
        if (!process.env.WX_APPID || !process.env.WX_MCHID) {
            console.error('[Payment] create 微信支付环境变量未配置:', {
                requestId,
                hasWX_APPID: !!process.env.WX_APPID,
                hasWX_MCHID: !!process.env.WX_MCHID,
                hasWX_PAY_CERT_SERIAL_NO: !!process.env.WX_PAY_CERT_SERIAL_NO,
                hasWX_PAY_KEY: !!process.env.WX_PAY_KEY,
                hasWX_PAY_NOTIFY_URL: !!process.env.WX_PAY_NOTIFY_URL,
                baseUrl: process.env.BASE_URL || null
            });
            return res.status(500).json({
                code: 1,
                message: '微信支付未配置，请联系管理员'
            });
        }

        // 检查商户私钥是否已配置（无私钥无法调微信统一下单）
        if (!wechatPayService.hasPrivateKey()) {
            console.error('[Payment] create 商户私钥未配置:', {
                requestId,
                keyPath: process.env.WX_PAY_KEY_PATH || null
            });
            return res.status(503).json({
                code: 1,
                message: '微信支付商户私钥未配置，无法发起支付。请将 apiclient_key.pem 上传到服务器 cert 目录（如 /app/cert/）并重启服务。'
            });
        }

        // 获取用户openid
        const openid = member.openid;
        if (!openid) {
            console.warn('[Payment] create 用户缺少 openid:', { requestId, memberId: member.id, orderId: order.id });
            return res.status(400).json({
                code: 1,
                message: '用户未绑定微信，无法使用微信支付'
            });
        }

        // 调用微信支付统一下单
        const totalAmount = Math.round(parseFloat(order.totalAmount) * 100); // 转换为分
        
        console.log('[Payment] create 准备统一下单:', {
            requestId,
            orderId: order.id,
            orderNo: order.orderNo,
            totalAmountFen: totalAmount,
            sandbox: process.env.WX_PAY_SANDBOX === 'true',
            notifyUrl: process.env.WX_PAY_NOTIFY_URL || null
        });
        const prepayResult = await wechatPayService.createJsapiOrder({
            outTradeNo: order.orderNo,
            description: `订单支付-${order.orderNo}`,
            total: totalAmount,
            openid: openid,
            attach: JSON.stringify({ orderId: order.id })
        });
        console.log('[Payment] create 统一下单成功:', { requestId, orderNo: order.orderNo, prepayId: prepayResult?.prepayId });

        // 生成小程序支付参数
        const payParams = wechatPayService.generateMiniProgramPayParams(prepayResult.prepayId);

        res.json({
            code: 0,
            message: '支付参数生成成功',
            data: {
                orderId: order.id,
                orderNo: order.orderNo,
                prepayId: prepayResult.prepayId,
                payParams: {
                    appId: process.env.WX_APPID,
                    timeStamp: payParams.timeStamp,
                    nonceStr: payParams.nonceStr,
                    package: payParams.package,
                    signType: payParams.signType,
                    paySign: payParams.paySign
                }
            }
        });
    } catch (error) {
        const msg = error.message || '创建支付订单失败';
        console.error('[Payment] 创建支付订单失败:', msg);
        console.error('[Payment] 详细错误:', {
            requestId,
            name: error?.name,
            code: error?.code,
            message: error?.message,
            responseStatus: error?.response?.status,
            responseData: error?.response?.data,
            cause: error?.cause,
            stack: error?.stack
        });
        res.status(500).json({
            code: 1,
            message: msg,
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

/**
 * 微信支付回调通知
 * POST /api/payment/wechat/notify
 * 不使用 express.raw()，统一由全局 express.json() 解析，避免 body 被覆盖导致 JSON.parse 报错
 */
router.post('/wechat/notify', async (req, res) => {
    try {
        const headers = req.headers;

        console.log('[Payment] 收到微信支付回调:', {
            headers: {
                'wechatpay-signature': headers['wechatpay-signature'],
                'wechatpay-timestamp': headers['wechatpay-timestamp'],
                'wechatpay-nonce': headers['wechatpay-nonce'],
                'wechatpay-serial': headers['wechatpay-serial']
            }
        });

        // 验证签名（实际应实现完整的签名验证）
        // const isValid = wechatPayService.verifyNotifySignature(headers, bodyStr);
        // if (!isValid) {
        //     return res.status(401).send('签名验证失败');
        // }

        // 解析回调数据：全局 express.json() 已解析则为对象；若为字符串则再解析（兼容异常情况）
        let notifyData = req.body;
        if (typeof notifyData === 'string') {
            if (notifyData.trim().length === 0) {
                return res.status(400).send('请求体为空');
            }
            notifyData = JSON.parse(notifyData);
        } else if (Buffer.isBuffer(req.body)) {
            notifyData = JSON.parse(req.body.toString('utf8'));
        }
        if (!notifyData || typeof notifyData !== 'object') {
            return res.status(400).send('无效的回调数据');
        }
        console.log('[Payment] 支付回调数据:', notifyData);

        // 解密数据（实际应实现解密逻辑）
        // const decryptedData = wechatPayService.decryptNotifyData(notifyData);

        const { out_trade_no, transaction_id, trade_state, trade_state_desc } = notifyData;

        if (!out_trade_no) {
            return res.status(400).send('订单号不存在');
        }

        // 查询订单
        const order = await Order.findOne({
            where: { orderNo: out_trade_no }
        });

        if (!order) {
            console.error('[Payment] 订单不存在:', out_trade_no);
            return res.status(404).send('订单不存在');
        }

        // 处理支付结果
        if (trade_state === 'SUCCESS') {
            // 支付成功
            if (order.status === 'pending') {
                await order.update({
                    status: 'paid',
                    paymentTime: new Date(),
                    transactionId: transaction_id
                });

                // 触发佣金计算
                try {
                    const CommissionService = require('../services/commissionService');
                    await CommissionService.calculateOrderCommission(order.id);
                } catch (error) {
                    console.error('[Payment] 佣金计算失败:', error);
                }

                console.log('[Payment] 订单支付成功:', order.orderNo);
            }
        } else if (trade_state === 'CLOSED' || trade_state === 'REVOKED') {
            // 支付关闭或撤销
            if (order.status === 'pending') {
                await order.update({
                    status: 'cancelled'
                });
                console.log('[Payment] 订单已关闭:', order.orderNo);
            }
        }

        // 返回成功响应（必须返回，否则微信会重复通知）
        res.status(200).json({
            code: 'SUCCESS',
            message: '成功'
        });
    } catch (error) {
        console.error('[Payment] 处理支付回调失败:', error);
        res.status(500).json({
            code: 'FAIL',
            message: error.message
        });
    }
});

/**
 * 查询支付状态
 * GET /api/payment/wechat/query/:orderId
 */
router.get('/wechat/query/:orderId', authenticateMiniappUser, async (req, res) => {
    try {
        const { orderId } = req.params;
        const member = req.member;

        const order = await Order.findByPk(orderId);

        if (!order) {
            return res.status(404).json({
                code: 1,
                message: '订单不存在'
            });
        }

        if (order.memberId !== member.id) {
            return res.status(403).json({
                code: 1,
                message: '无权访问此订单'
            });
        }

        // 如果订单已支付，直接返回
        if (order.status === 'paid') {
            return res.json({
                code: 0,
                message: '订单已支付',
                data: {
                    orderId: order.id,
                    status: 'paid',
                    paymentTime: order.paymentTime
                }
            });
        }

        // 如果订单是待支付状态，查询微信支付状态
        if (order.status === 'pending' && order.paymentMethod === 'wechat') {
            try {
                const wechatOrder = await wechatPayService.queryOrder(order.orderNo);
                
                if (wechatOrder.trade_state === 'SUCCESS') {
                    // 微信支付成功，更新订单状态
                    await order.update({
                        status: 'paid',
                        paymentTime: new Date(),
                        transactionId: wechatOrder.transaction_id
                    });

                    // 触发佣金计算
                    try {
                        const CommissionService = require('../services/commissionService');
                        await CommissionService.calculateOrderCommission(order.id);
                    } catch (error) {
                        console.error('[Payment] 佣金计算失败:', error);
                    }

                    return res.json({
                        code: 0,
                        message: '订单已支付',
                        data: {
                            orderId: order.id,
                            status: 'paid',
                            paymentTime: new Date()
                        }
                    });
                } else {
                    return res.json({
                        code: 0,
                        message: '订单待支付',
                        data: {
                            orderId: order.id,
                            status: 'pending',
                            wechatStatus: wechatOrder.trade_state,
                            wechatStatusDesc: wechatOrder.trade_state_desc
                        }
                    });
                }
            } catch (error) {
                console.error('[Payment] 查询微信支付状态失败:', error);
                // 查询失败不影响，返回订单当前状态
            }
        }

        res.json({
            code: 0,
            message: '查询成功',
            data: {
                orderId: order.id,
                status: order.status,
                paymentTime: order.paymentTime
            }
        });
    } catch (error) {
        console.error('[Payment] 查询支付状态失败:', error);
        res.status(500).json({
            code: 1,
            message: error.message || '查询支付状态失败'
        });
    }
});

/**
 * 关闭支付订单
 * POST /api/payment/wechat/close/:orderId
 */
router.post('/wechat/close/:orderId', authenticateMiniappUser, async (req, res) => {
    try {
        const { orderId } = req.params;
        const member = req.member;

        const order = await Order.findByPk(orderId);

        if (!order) {
            return res.status(404).json({
                code: 1,
                message: '订单不存在'
            });
        }

        if (order.memberId !== member.id) {
            return res.status(403).json({
                code: 1,
                message: '无权访问此订单'
            });
        }

        if (order.status !== 'pending') {
            return res.status(400).json({
                code: 1,
                message: '订单状态不正确，无法关闭'
            });
        }

        if (order.paymentMethod !== 'wechat') {
            return res.status(400).json({
                code: 1,
                message: '订单支付方式不是微信支付'
            });
        }

        // 调用微信支付关闭订单接口
        try {
            await wechatPayService.closeOrder(order.orderNo);
        } catch (error) {
            console.error('[Payment] 关闭微信支付订单失败:', error);
            // 即使微信关闭失败，也更新本地订单状态
        }

        // 更新订单状态
        await order.update({
            status: 'cancelled'
        });

        res.json({
            code: 0,
            message: '订单已关闭',
            data: { order }
        });
    } catch (error) {
        console.error('[Payment] 关闭支付订单失败:', error);
        res.status(500).json({
            code: 1,
            message: error.message || '关闭支付订单失败'
        });
    }
});

module.exports = router;
