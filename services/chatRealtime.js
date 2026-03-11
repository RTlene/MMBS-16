/**
 * 实时客服 WebSocket：/ws/chat
 * 事件：auth(member|staff)、message:new、conversation:update、queue:update、read:receipt
 */
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { User, Member } = require('../db');

const secret = process.env.JWT_SECRET || 'your-secret-key-change-this';

// memberId -> Set<WebSocket>
const memberSockets = new Map();
// staffId (userId) -> Set<WebSocket>
const staffSockets = new Map();
// conversationId -> Set<WebSocket> (member + staff 订阅该会话的连接)
const conversationSockets = new Map();

function getOrCreateSet(map, key) {
    if (!map.has(key)) map.set(key, new Set());
    return map.get(key);
}

function removeFromSet(map, key, ws) {
    const set = map.get(key);
    if (set) {
        set.delete(ws);
        if (set.size === 0) map.delete(key);
    }
}

function subscribeConversation(conversationId, ws) {
    const set = getOrCreateSet(conversationSockets, conversationId);
    set.add(ws);
}

function unsubscribeConversation(conversationId, ws) {
    removeFromSet(conversationSockets, conversationId, ws);
}

/**
 * 向订阅了该会话的所有连接推送
 */
function emitToConversation(conversationId, event, payload) {
    const set = conversationSockets.get(conversationId);
    if (!set) return;
    const data = JSON.stringify({ event, ...payload });
    set.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });
}

/**
 * 向所有已连接客服广播队列变更
 */
function broadcastQueue() {
    const payload = JSON.stringify({ event: 'queue:update' });
    staffSockets.forEach(set => {
        set.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) ws.send(payload);
        });
    });
}

/**
 * 初始化：挂载到已有 HTTP server，路径 /ws/chat
 * @param {import('http').Server} server - express 的 app.listen 返回的 server（或 http.createServer(app)）
 */
function initChatRealtime(server) {
    const wss = new WebSocket.Server({ server, path: '/ws/chat' });

    wss.on('connection', (ws, req) => {
        const url = req.url || '';
        const token = (url.match(/[?&]token=([^&]+)/) || [])[1];
        ws.role = null;
        ws.memberId = null;
        ws.staffId = null;
        ws.conversationIds = new Set();

        if (!token) {
            ws.send(JSON.stringify({ event: 'error', message: '缺少 token' }));
            ws.close();
            return;
        }

        let decoded;
        try {
            decoded = jwt.verify(token, secret);
        } catch (e) {
            ws.send(JSON.stringify({ event: 'error', message: 'token 无效' }));
            ws.close();
            return;
        }

        if (decoded.type === 'member' && decoded.memberId != null) {
            ws.role = 'member';
            ws.memberId = decoded.memberId;
            getOrCreateSet(memberSockets, ws.memberId).add(ws);
            ws.send(JSON.stringify({ event: 'auth', role: 'member', memberId: ws.memberId }));
        } else if ((decoded.type === 'staff' || decoded.role) && decoded.id != null) {
            ws.role = 'staff';
            ws.staffId = decoded.id;
            getOrCreateSet(staffSockets, ws.staffId).add(ws);
            ws.send(JSON.stringify({ event: 'auth', role: 'staff', staffId: ws.staffId }));
        } else {
            ws.send(JSON.stringify({ event: 'error', message: '身份无效' }));
            ws.close();
            return;
        }

        ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                if (msg.event === 'subscribe' && typeof msg.conversationId === 'number') {
                    subscribeConversation(msg.conversationId, ws);
                    ws.conversationIds.add(msg.conversationId);
                } else if (msg.event === 'unsubscribe' && typeof msg.conversationId === 'number') {
                    unsubscribeConversation(msg.conversationId, ws);
                    ws.conversationIds.delete(msg.conversationId);
                }
            } catch (e) {
                // ignore
            }
        });

        ws.on('close', () => {
            if (ws.memberId != null) removeFromSet(memberSockets, ws.memberId, ws);
            if (ws.staffId != null) removeFromSet(staffSockets, ws.staffId, ws);
            (ws.conversationIds || []).forEach(cid => unsubscribeConversation(cid, ws));
        });
    });

    console.log('[ChatRealtime] WebSocket /ws/chat 已挂载');
    return wss;
}

module.exports = {
    initChatRealtime,
    emitToConversation,
    broadcastQueue
};
