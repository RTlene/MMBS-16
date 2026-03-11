/**
 * 小程序端 - 实时客服/咨询
 * 会话创建（普通/核销码）、会话列表、消息拉取、发消息、已读、上传聊天图片
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');
const { authenticateMiniappUser } = require('../middleware/miniapp-auth');
const cosStorage = require('../services/cosStorage');
const {
    ChatConversation,
    ChatMessage,
    ChatParticipant,
    ChatQueueItem,
    Member,
    VerificationCode
} = require('../db');

const router = express.Router();
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

const LOCAL_CHAT_UPLOAD = path.join(__dirname, '../public/uploads/chat');
if (!fs.existsSync(LOCAL_CHAT_UPLOAD)) fs.mkdirSync(LOCAL_CHAT_UPLOAD, { recursive: true });

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('只允许上传图片'));
    }
});

// 获取 WebSocket 用 token（短期有效，供 /ws/chat?token=xxx）
router.get('/chat/ws-token', authenticateMiniappUser, (req, res) => {
    try {
        const token = jwt.sign(
            { type: 'member', memberId: req.member.id },
            JWT_SECRET,
            { expiresIn: '2h' }
        );
        return res.json({ code: 0, data: { token } });
    } catch (e) {
        return res.status(500).json({ code: 1, message: e.message || '获取失败' });
    }
});

// 创建普通咨询会话
router.post('/chat/conversations', authenticateMiniappUser, async (req, res) => {
    try {
        const memberId = req.member.id;
        const existing = await ChatConversation.findOne({
            where: { memberId, status: { [Op.in]: ['waiting', 'active'] } },
            order: [['updatedAt', 'DESC']]
        });
        if (existing) {
            const conv = await ChatConversation.findByPk(existing.id, {
                include: [{ model: Member, as: 'member', attributes: ['id', 'nickname', 'avatarUrl'] }]
            });
            return res.json({ code: 0, data: conv, message: '已有进行中会话' });
        }
        const conv = await ChatConversation.create({
            memberId,
            status: 'waiting',
            source: 'general'
        });
        await ChatParticipant.create({ conversationId: conv.id, participantType: 'member', participantId: memberId });
        await ChatQueueItem.create({ conversationId: conv.id, priority: 0 });
        const chatRealtime = require('../services/chatRealtime');
        if (chatRealtime.broadcastQueue) chatRealtime.broadcastQueue();
        const withMember = await ChatConversation.findByPk(conv.id, {
            include: [{ model: Member, as: 'member', attributes: ['id', 'nickname', 'avatarUrl'] }]
        });
        return res.json({ code: 0, data: withMember });
    } catch (e) {
        console.error('创建咨询会话失败:', e);
        return res.status(500).json({ code: 1, message: e.message || '创建失败' });
    }
});

// 通过核销码创建/绑定咨询会话（仅限该码归属当前会员）
router.post('/chat/conversations/by-verification-code', authenticateMiniappUser, async (req, res) => {
    try {
        const memberId = req.member.id;
        const { code } = req.body;
        if (!code || typeof code !== 'string') {
            return res.status(400).json({ code: 1, message: '请提供核销码' });
        }
        const vc = await VerificationCode.findOne({
            where: { code: code.trim(), memberId }
        });
        if (!vc) {
            return res.status(404).json({ code: 1, message: '核销码不存在或不属于当前用户' });
        }
        let conv = await ChatConversation.findOne({
            where: { verificationCodeId: vc.id }
        });
        if (conv) {
            const withMember = await ChatConversation.findByPk(conv.id, {
                include: [{ model: Member, as: 'member', attributes: ['id', 'nickname', 'avatarUrl'] }]
            });
            return res.json({ code: 0, data: withMember, message: '已存在该核销码咨询会话' });
        }
        const existingActive = await ChatConversation.findOne({
            where: { memberId, status: { [Op.in]: ['waiting', 'active'] } }
        });
        if (existingActive) {
            await existingActive.update({
                source: 'verification_consult',
                verificationCodeId: vc.id
            });
            const qi = await ChatQueueItem.findOne({ where: { conversationId: existingActive.id } });
            if (qi) await qi.update({ priority: 10 });
            const withMember = await ChatConversation.findByPk(existingActive.id, {
                include: [{ model: Member, as: 'member', attributes: ['id', 'nickname', 'avatarUrl'] }]
            });
            return res.json({ code: 0, data: withMember });
        }
        conv = await ChatConversation.create({
            memberId,
            status: 'waiting',
            source: 'verification_consult',
            verificationCodeId: vc.id
        });
        await ChatParticipant.create({ conversationId: conv.id, participantType: 'member', participantId: memberId });
        await ChatQueueItem.create({ conversationId: conv.id, priority: 10 });
        const chatRealtime = require('../services/chatRealtime');
        if (chatRealtime.broadcastQueue) chatRealtime.broadcastQueue();
        const withMember = await ChatConversation.findByPk(conv.id, {
            include: [{ model: Member, as: 'member', attributes: ['id', 'nickname', 'avatarUrl'] }]
        });
        return res.json({ code: 0, data: withMember });
    } catch (e) {
        console.error('核销码咨询会话失败:', e);
        return res.status(500).json({ code: 1, message: e.message || '操作失败' });
    }
});

// 会话列表（当前会员）
router.get('/chat/conversations', authenticateMiniappUser, async (req, res) => {
    try {
        const memberId = req.member.id;
        const list = await ChatConversation.findAll({
            where: { memberId },
            order: [['updatedAt', 'DESC']],
            include: [{ model: Member, as: 'member', attributes: ['id', 'nickname', 'avatarUrl'] }]
        });
        return res.json({ code: 0, data: list });
    } catch (e) {
        console.error('会话列表失败:', e);
        return res.status(500).json({ code: 1, message: e.message || '获取失败' });
    }
});

// 消息列表（分页，仅限当前会员的会话）
router.get('/chat/conversations/:id/messages', authenticateMiniappUser, async (req, res) => {
    try {
        const memberId = req.member.id;
        const conversationId = parseInt(req.params.id, 10);
        if (isNaN(conversationId)) {
            return res.status(400).json({ code: 1, message: '无效会话ID' });
        }
        const conv = await ChatConversation.findOne({ where: { id: conversationId, memberId } });
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

// 发送文本/图片消息（幂等：clientMsgId）
router.post('/chat/conversations/:id/messages', authenticateMiniappUser, async (req, res) => {
    try {
        const memberId = req.member.id;
        const conversationId = parseInt(req.params.id, 10);
        const { messageType = 'text', contentText, contentUrl, clientMsgId } = req.body;
        if (isNaN(conversationId)) {
            return res.status(400).json({ code: 1, message: '无效会话ID' });
        }
        const conv = await ChatConversation.findOne({ where: { id: conversationId, memberId } });
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
            senderType: 'member',
            senderId: memberId,
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

// 已读回执（更新会员侧 lastReadMessageId）
router.post('/chat/conversations/:id/read', authenticateMiniappUser, async (req, res) => {
    try {
        const memberId = req.member.id;
        const conversationId = parseInt(req.params.id, 10);
        const { lastReadMessageId } = req.body;
        if (isNaN(conversationId)) {
            return res.status(400).json({ code: 1, message: '无效会话ID' });
        }
        const conv = await ChatConversation.findOne({ where: { id: conversationId, memberId } });
        if (!conv) return res.status(404).json({ code: 1, message: '会话不存在' });
        const part = await ChatParticipant.findOne({
            where: { conversationId, participantType: 'member', participantId: memberId }
        });
        if (part) {
            await part.update({ lastReadMessageId: lastReadMessageId || null });
            const chatRealtime = require('../services/chatRealtime');
            if (chatRealtime.emitToConversation) {
                chatRealtime.emitToConversation(conv.id, 'read:receipt', { participantType: 'member', lastReadMessageId: part.lastReadMessageId });
            }
        }
        return res.json({ code: 0 });
    } catch (e) {
        console.error('已读回执失败:', e);
        return res.status(500).json({ code: 1, message: e.message || '操作失败' });
    }
});

// 上传聊天图片（写入 COS 或本地，返回 url 供发消息时 contentUrl 使用）
router.post('/chat/upload-image', authenticateMiniappUser, (req, res, next) => {
    upload.single('image')(req, res, (err) => {
        if (err) {
            if (err.message === '只允许上传图片') return res.status(400).json({ code: 1, message: '只允许上传图片' });
            if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ code: 1, message: '图片不能超过 5MB' });
            return res.status(400).json({ code: 1, message: err.message || '上传失败' });
        }
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ code: 1, message: '未上传文件' });
        }
        const memberId = req.member.id;
        const ext = path.extname(req.file.originalname || '') || '.jpg';
        const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext.toLowerCase()) ? ext : '.jpg';
        const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`;
        const objectKey = `chat/${memberId}/${filename}`;
        if (cosStorage.isConfigured()) {
            await cosStorage.putObjectBuffer(objectKey, req.file.buffer);
            const url = cosStorage.getPublicUrl(objectKey);
            return res.json({ code: 0, data: { url } });
        }
        const dir = path.join(LOCAL_CHAT_UPLOAD, String(memberId));
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const localPath = path.join(dir, filename);
        fs.writeFileSync(localPath, req.file.buffer);
        const url = `/uploads/chat/${memberId}/${filename}`;
        return res.json({ code: 0, data: { url } });
    } catch (e) {
        console.error('聊天图片上传失败:', e);
        return res.status(500).json({ code: 1, message: e.message || '上传失败' });
    }
});

module.exports = router;
