/**
 * 客服工作台：排队、接入、我的会话、消息、发送、快捷话术、结束
 */
(function() {
    function getToken() { return localStorage.getItem('token') || ''; }
    function authHeaders() { return { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' }; }

    let currentTab = 'queue';
    let currentConversationId = null;
    let ws = null;

    function renderQueueList(items) {
        const el = document.getElementById('chat-queue-list');
        if (!items || items.length === 0) {
            el.innerHTML = '<div style="padding:16px;color:#999;font-size:13px;">暂无排队</div>';
            return;
        }
        el.innerHTML = items.map(c => {
            const name = (c.member && c.member.nickname) ? c.member.nickname : '会员#' + c.memberId;
            const preview = (c.lastMessagePreview || '新会话').slice(0, 30);
            return '<div class="chat-list-item" data-id="' + c.id + '" data-action="accept">' +
                '<div class="name">' + escapeHtml(name) + '</div>' +
                '<div class="preview">' + escapeHtml(preview) + '</div></div>';
        }).join('');
        el.querySelectorAll('.chat-list-item').forEach(node => {
            node.addEventListener('click', function() {
                const id = parseInt(this.getAttribute('data-id'), 10);
                const action = this.getAttribute('data-action');
                if (action === 'accept') acceptConversation(id);
            });
        });
    }

    function renderMineList(items) {
        const el = document.getElementById('chat-mine-list');
        if (!items || items.length === 0) {
            el.innerHTML = '<div style="padding:16px;color:#999;font-size:13px;">暂无进行中会话</div>';
            return;
        }
        el.innerHTML = items.map(c => {
            const name = (c.member && c.member.nickname) ? c.member.nickname : '会员#' + c.memberId;
            const preview = (c.lastMessagePreview || '').slice(0, 30);
            return '<div class="chat-list-item" data-id="' + c.id + '" data-action="open">' +
                '<div class="name">' + escapeHtml(name) + '</div>' +
                '<div class="preview">' + escapeHtml(preview) + '</div></div>';
        }).join('');
        el.querySelectorAll('.chat-list-item').forEach(node => {
            node.addEventListener('click', function() {
                const id = parseInt(this.getAttribute('data-id'), 10);
                if (this.getAttribute('data-action') === 'open') openConversation(id);
            });
        });
    }

    function escapeHtml(s) {
        if (s == null) return '';
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }

    async function fetchQueue() {
        try {
            const r = await fetch('/api/staff/chat/queue', { headers: authHeaders() });
            const res = await r.json();
            if (res.code === 0) renderQueueList(res.data);
        } catch (e) { console.error('fetchQueue', e); }
    }

    async function fetchMine() {
        try {
            const r = await fetch('/api/staff/chat/conversations', { headers: authHeaders() });
            const res = await r.json();
            if (res.code === 0) renderMineList(res.data);
        } catch (e) { console.error('fetchMine', e); }
    }

    async function acceptConversation(id) {
        try {
            const r = await fetch('/api/staff/chat/conversations/' + id + '/accept', {
                method: 'POST',
                headers: authHeaders()
            });
            const res = await r.json();
            if (res.code === 0) {
                currentConversationId = id;
                showConvArea(res.data);
                fetchQueue();
                fetchMine();
                subscribeWs(id);
            } else {
                alert(res.message || '接入失败');
            }
        } catch (e) {
            console.error('acceptConversation', e);
            alert('接入失败');
        }
    }

    function openConversation(id) {
        currentConversationId = id;
        showConvArea({ id, member: { nickname: '会员' } });
        loadMessages(id);
        subscribeWs(id);
    }

    function showConvArea(conv) {
        document.getElementById('chat-main-empty').style.display = 'none';
        const area = document.getElementById('chat-conv-area');
        area.style.display = 'flex';
        area.style.flexDirection = 'column';
        const name = (conv.member && conv.member.nickname) ? conv.member.nickname : '会员#' + (conv.memberId || '');
        document.getElementById('chat-conv-title').textContent = name;
        document.getElementById('chat-messages').innerHTML = '';
    }

    async function loadMessages(conversationId) {
        try {
            const r = await fetch('/api/staff/chat/conversations/' + conversationId + '/messages?limit=50', { headers: authHeaders() });
            const res = await r.json();
            if (res.code === 0) renderMessages(res.data);
        } catch (e) { console.error('loadMessages', e); }
    }

    function messageToHtml(m) {
        const isStaff = m.senderType === 'staff';
        let body = '';
        if (m.messageType === 'image' && m.contentUrl) {
            const url = m.contentUrl.startsWith('http') ? m.contentUrl : (location.origin + (m.contentUrl.startsWith('/') ? m.contentUrl : '/' + m.contentUrl));
            body = '<img src="' + escapeHtml(url) + '" alt="图片" />';
        } else {
            body = escapeHtml(m.contentText || '');
        }
        return '<div class="chat-msg ' + (isStaff ? 'staff' : 'member') + '">' +
            '<div class="bubble">' + body + '</div></div>';
    }

    function renderMessages(messages) {
        const container = document.getElementById('chat-messages');
        container.innerHTML = (messages || []).map(m => messageToHtml(m)).join('');
        container.scrollTop = container.scrollHeight;
    }

    function appendMessage(m) {
        const container = document.getElementById('chat-messages');
        const div = document.createElement('div');
        div.innerHTML = messageToHtml(m);
        container.appendChild(div.firstElementChild);
        container.scrollTop = container.scrollHeight;
    }

    async function sendMessage() {
        const input = document.getElementById('chat-input');
        const text = (input.value || '').trim();
        if (!text || !currentConversationId) return;
        try {
            const r = await fetch('/api/staff/chat/conversations/' + currentConversationId + '/messages', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ messageType: 'text', contentText: text, clientMsgId: 'wb-' + Date.now() + '-' + Math.random().toString(36).slice(2) })
            });
            const res = await r.json();
            if (res.code === 0) {
                input.value = '';
                renderMessages([res.data]);
                document.getElementById('chat-messages').scrollTop = document.getElementById('chat-messages').scrollHeight;
            } else {
                alert(res.message || '发送失败');
            }
        } catch (e) {
            console.error('sendMessage', e);
            alert('发送失败');
        }
    }

    async function endConversation() {
        if (!currentConversationId) return;
        if (!confirm('确定结束当前会话？')) return;
        try {
            const r = await fetch('/api/staff/chat/conversations/' + currentConversationId + '/end', {
                method: 'POST',
                headers: authHeaders()
            });
            const res = await r.json();
            if (res.code === 0) {
                currentConversationId = null;
                document.getElementById('chat-conv-area').style.display = 'none';
                document.getElementById('chat-main-empty').style.display = 'flex';
                fetchMine();
                fetchQueue();
            } else {
                alert(res.message || '结束失败');
            }
        } catch (e) {
            console.error('endConversation', e);
        }
    }

    function subscribeWs(conversationId) {
        if (ws && ws.readyState === 1) {
            ws.send(JSON.stringify({ event: 'unsubscribe', conversationId: currentConversationId }));
        }
        currentConversationId = conversationId;
        const token = getToken();
        if (!token) return;
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = protocol + '//' + location.host + '/ws/chat?token=' + encodeURIComponent(token);
        if (ws) try { ws.close(); } catch (_) {}
        ws = new WebSocket(url);
        ws.onopen = function() {
            ws.send(JSON.stringify({ event: 'subscribe', conversationId: conversationId }));
        };
        ws.onmessage = function(ev) {
            try {
                const data = JSON.parse(ev.data);
                if (data.event === 'message:new' && data.message && data.message.conversationId === currentConversationId) {
                    appendMessage(data.message);
                }
                if (data.event === 'queue:update') fetchQueue();
                if (data.event === 'conversation:update') { fetchMine(); fetchQueue(); }
            } catch (_) {}
        };
        ws.onerror = function() {};
        ws.onclose = function() {};
    }

    function init() {
        fetchQueue();
        fetchMine();

        document.querySelectorAll('.chat-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                const t = this.getAttribute('data-tab');
                currentTab = t;
                document.querySelectorAll('.chat-tab').forEach(x => x.classList.remove('active'));
                this.classList.add('active');
                document.getElementById('chat-queue-list').style.display = t === 'queue' ? 'block' : 'none';
                document.getElementById('chat-mine-list').style.display = t === 'mine' ? 'block' : 'none';
                if (t === 'queue') fetchQueue();
                else fetchMine();
            });
        });

        document.getElementById('chat-send-btn').addEventListener('click', sendMessage);
        document.getElementById('chat-input').addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        });
        document.getElementById('chat-end-btn').addEventListener('click', endConversation);

        document.getElementById('chat-quick-reply-btn').addEventListener('click', async function() {
            try {
                const r = await fetch('/api/staff/chat/quick-replies', { headers: authHeaders() });
                const res = await r.json();
                if (res.code === 0 && res.data.length) {
                    const content = res.data.map((q, i) => (i + 1) + '. ' + q.title).join('\n');
                    const pick = prompt('快捷话术（输入序号使用）：\n' + content);
                    if (pick == null) return;
                    const idx = parseInt(pick, 10);
                    if (idx >= 1 && idx <= res.data.length) {
                        const msg = res.data[idx - 1].content;
                        document.getElementById('chat-input').value = msg;
                    }
                } else {
                    alert('暂无快捷话术，可在下方输入后发送');
                }
            } catch (e) { console.error('quick-reply', e); }
        });
    }

    window.ChatWorkbench = { init: init };
})();
