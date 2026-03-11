/**
 * 后台/员工端 - 客服工作台
 * 排队队列、接入、结束、我的会话、消息、发消息、已读、快捷话术 CRUD
 */
const express = require('express');
const { Op } = require('sequelize');
const { authenticateToken } = require('../middleware/auth');
const {
    ChatConversation,
    ChatMessage,
    ChatParticipant,
    ChatQueueItem,
    ChatQuickReply,
    Member,
    User
} = require('../db');

const router = express.Router();

router.use(authenticateToken);

// 排队队列（waiting 状态，按 priority 降序、入队时间升序）
router.get('/staff/chat/queue', async (req, res) => {
    try {
        const items = await ChatQueueItem.findAll({
            include: [{
                model: ChatConversation,
                as: 'conversation',
                where: { status: 'waiting' },
                include: [{ model: Member, as: 'member', attributes: ['id', 'nickname', 'avatarUrl'] }]
            }],
            order: [
                ['priority', 'DESC'],
                ['enqueuedAt', 'ASC']
            ]
        });
        const list = items.map(i => i.conversation).filter(Boolean);
        return res.json({ code: 0, data: list });
    } catch (e) {
        console.error('队列失败:', e);
        return res.status(500).json({ code: 1, message: e.message || '获取失败' });
    }
});

// 接入会话（将 waiting -> active，绑定 staffId）
router.post('/staff/chat/conversations/:id/accept', async (req, res) => {
    try {
        const staffId = req.user.id;
        const conversationId = parseInt(req.params.id, 10);
        if (isNaN(conversationId)) {
            return res.status(400).json({ code: 1, message: '无效会话ID' });
        }
        const conv = await ChatConversation.findByPk(conversationId);
        if (!conv) return res.status(404).json({ code: 1, message: '会话不存在' });
        if (conv.status !== 'waiting') {
            return res.status(400).json({ code: 1, message: '会话已被接入或已结束' });
        }
        await conv.update({ status: 'active', staffId });
        await ChatParticipant.findOrCreate({
            where: { conversationId, participantType: 'staff', participantId: staffId },
            defaults: { conversationId, participantType: 'staff', participantId: staffId }
        });
        const queueItem = await ChatQueueItem.findOne({ where: { conversationId } });
        if (queueItem) await queueItem.destroy();
        const chatRealtime = require('../services/chatRealtime');
        if (chatRealtime.emitToConversation) {
            chatRealtime.emitToConversation(conv.id, 'conversation:update', { conversation: conv });
        }
        if (chatRealtime.broadcastQueue) chatRealtime.broadcastQueue();
        const withMember = await ChatConversation.findByPk(conv.id, {
            include: [{ model: Member, as: 'member', attributes: ['id', 'nickname', 'avatarUrl'] }]
        });
        return res.json({ code: 0, data: withMember });
    } catch (e) {
        console.error('接入失败:', e);
        return res.status(500).json({ code: 1, message: e.message || '操作失败' });
    }
});

// 结束会话
router.post('/staff/chat/conversations/:id/end', async (req, res) => {
    try {
        const staffId = req.user.id;
        const conversationId = parseInt(req.params.id, 10);
        if (isNaN(conversationId)) {
            return res.status(400).json({ code: 1, message: '无效会话ID' });
        }
        const conv = await ChatConversation.findOne({ where: { id: conversationId, staffId } });
        if (!conv) return res.status(404).json({ code: 1, message: '会话不存在或非本人接入' });
        if (conv.status === 'closed') {
            return res.json({ code: 0, data: conv, message: '已结束' });
        }
        await conv.update({ status: 'closed' });
        const chatRealtime = require('../services/chatRealtime');
        if (chatRealtime.emitToConversation) {
            chatRealtime.emitToConversation(conv.id, 'conversation:update', { conversation: conv });
        }
        return res.json({ code: 0, data: conv });
    } catch (e) {
        console.error('结束会话失败:', e);
        return res.status(500).json({ code: 1, message: e.message || '操作失败' });
    }
});

// 我的会话列表（当前客服接入的 active）
router.get('/staff/chat/conversations', async (req, res) => {
    try {
        const staffId = req.user.id;
        const list = await ChatConversation.findAll({
            where: { staffId, status: 'active' },
            order: [['updatedAt', 'DESC']],
            include: [{ model: Member, as: 'member', attributes: ['id', 'nickname', 'avatarUrl'] }]
        });
        return res.json({ code: 0, data: list });
    } catch (e) {
        console.error('我的会话失败:', e);
        return res.status(500).json({ code: 1, message: e.message || '获取失败' });
    }
});

// 消息列表（客服端，需校验该会话属于当前客服）
router.get('/staff/chat/conversations/:id/messages', async (req, res) => {
    try {
        const staffId = req.user.id;
        const conversationId = parseInt(req.params.id, 10);
        if (isNaN(conversationId)) {
            return res.status(400).json({ code: 1, message: '无效会话ID' });
        }
        const conv = await ChatConversation.findOne({ where: { id: conversationId, staffId } });
        if (!conv) return res.status(404).json({ code: 1, message: '会话不存在' });
        const beforeId = req.query.beforeId ? parseInt(req.query.beforeId, 10) : null;
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
        const where = { conversationId };
        if (beforeId) where.id = { [Op.lt]: beforeId };
        const messages = await ChatMessage.findAll({
            where,
            order: [['id', 'DESC']],
            limit
        });
        return res.json({ code: 0, data: messages.reverse() });
    } catch (e) {
        console.error('消息列表失败:', e);
        return res.status(500).json({ code: 1, message: e.message || '获取失败' });
    }
});

// 客服发送消息
router.post('/staff/chat/conversations/:id/messages', async (req, res) => {
    try {
        const staffId = req.user.id;
        const conversationId = parseInt(req.params.id, 10);
        const { messageType = 'text', contentText, contentUrl, clientMsgId } = req.body;
        if (isNaN(conversationId)) {
            return res.status(400).json({ code: 1, message: '无效会话ID' });
        }
        const conv = await ChatConversation.findOne({ where: { id: conversationId, staffId } });
        if (!conv) return res.status(404).json({ code: 1, message: '会话不存在' });
        if (conv.status === 'closed') {
            return res.status(400).json({ code: 1, message: '会话已结束' });
        }
        if (clientMsgId) {
            const existing = await ChatMessage.findOne({ where: { conversationId, clientMsgId } });
            if (existing) return res.json({ code: 0, data: existing });
        }
        const msg = await ChatMessage.create({
            conversationId,
            senderType: 'staff',
            senderId: staffId,
            messageType: messageType === 'image' ? 'image' : 'text',
            contentText: messageType === 'text' ? (contentText || '') : null,
            contentUrl: messageType === 'image' ? (contentUrl || '') : null,
            clientMsgId: clientMsgId || null
        });
        const preview = messageType === 'text' ? (contentText || '').slice(0, 80) : '[图片]';
        await conv.update({
            lastMessageAt: new Date(),
            lastMessagePreview: preview
        });
        const chatRealtime = require('../services/chatRealtime');
        if (chatRealtime.emitToConversation) {
            chatRealtime.emitToConversation(conv.id, 'message:new', { message: msg });
        }
        return res.json({ code: 0, data: msg });
    } catch (e) {
        console.error('发送消息失败:', e);
        return res.status(500).json({ code: 1, message: e.message || '发送失败' });
    }
});

// 客服已读回执
router.post('/staff/chat/conversations/:id/read', async (req, res) => {
    try {
        const staffId = req.user.id;
        const conversationId = parseInt(req.params.id, 10);
        const { lastReadMessageId } = req.body;
        if (isNaN(conversationId)) {
            return res.status(400).json({ code: 1, message: '无效会话ID' });
        }
        const conv = await ChatConversation.findOne({ where: { id: conversationId, staffId } });
        if (!conv) return res.status(404).json({ code: 1, message: '会话不存在' });
        const part = await ChatParticipant.findOne({
            where: { conversationId, participantType: 'staff', participantId: staffId }
        });
        if (part) {
            await part.update({ lastReadMessageId: lastReadMessageId || null });
            const chatRealtime = require('../services/chatRealtime');
            if (chatRealtime.emitToConversation) {
                chatRealtime.emitToConversation(conv.id, 'read:receipt', { participantType: 'staff', lastReadMessageId: part.lastReadMessageId });
            }
        }
        return res.json({ code: 0 });
    } catch (e) {
        console.error('已读回执失败:', e);
        return res.status(500).json({ code: 1, message: e.message || '操作失败' });
    }
});

// 快捷话术列表（全局 + 当前客服个人）
router.get('/staff/chat/quick-replies', async (req, res) => {
    try {
        const staffId = req.user.id;
        const list = await ChatQuickReply.findAll({
            where: {
                isActive: true,
                [Op.or]: [{ staffId: null }, { staffId }]
            },
            order: [['id', 'ASC']]
        });
        return res.json({ code: 0, data: list });
    } catch (e) {
        console.error('快捷话术列表失败:', e);
        return res.status(500).json({ code: 1, message: e.message || '获取失败' });
    }
});

// 添加快捷话术（staffId 为空为全局，需 admin；否则为个人）
router.post('/staff/chat/quick-replies', async (req, res) => {
    try {
        const staffId = req.user.id;
        const isAdmin = req.user.role === 'admin';
        const { title, content, isGlobal } = req.body;
        if (!title || !content) {
            return res.status(400).json({ code: 1, message: '标题和内容必填' });
        }
        const assignStaffId = isGlobal && isAdmin ? null : staffId;
        const row = await ChatQuickReply.create({
            staffId: assignStaffId,
            title: String(title).slice(0, 100),
            content: String(content),
            isActive: true
        });
        return res.json({ code: 0, data: row });
    } catch (e) {
        console.error('添加快捷话术失败:', e);
        return res.status(500).json({ code: 1, message: e.message || '添加失败' });
    }
});

// 更新快捷话术
router.put('/staff/chat/quick-replies/:id', async (req, res) => {
    try {
        const staffId = req.user.id;
        const isAdmin = req.user.role === 'admin';
        const id = parseInt(req.params.id, 10);
        const { title, content, isActive } = req.body;
        const row = await ChatQuickReply.findByPk(id);
        if (!row) return res.status(404).json({ code: 1, message: '话术不存在' });
        if (row.staffId !== null && row.staffId !== staffId && !isAdmin) {
            return res.status(403).json({ code: 1, message: '无权限修改' });
        }
        if (title !== undefined) row.title = String(title).slice(0, 100);
        if (content !== undefined) row.content = String(content);
        if (isActive !== undefined) row.isActive = !!isActive;
        await row.save();
        return res.json({ code: 0, data: row });
    } catch (e) {
        console.error('更新快捷话术失败:', e);
        return res.status(500).json({ code: 1, message: e.message || '更新失败' });
    }
});

// 删除快捷话术
router.delete('/staff/chat/quick-replies/:id', async (req, res) => {
    try {
        const staffId = req.user.id;
        const isAdmin = req.user.role === 'admin';
        const id = parseInt(req.params.id, 10);
        const row = await ChatQuickReply.findByPk(id);
        if (!row) return res.status(404).json({ code: 1, message: '话术不存在' });
        if (row.staffId !== null && row.staffId !== staffId && !isAdmin) {
            return res.status(403).json({ code: 1, message: '无权限删除' });
        }
        await row.destroy();
        return res.json({ code: 0 });
    } catch (e) {
        console.error('删除快捷话术失败:', e);
        return res.status(500).json({ code: 1, message: e.message || '删除失败' });
    }
});

module.exports = router;
