const request = require('../../utils/request');
const { API, replaceUrlParams, API_BASE_URL } = require('../../config/api');

Page({
  data: {
    conversationId: null,
    messages: [],
    inputText: '',
    loading: true,
    inputFocus: false
  },

  onLoad(options) {
    this.createOrGetConversation();
  },

  onUnload() {
    if (this._wsTask) {
      try { this._wsTask.close(); } catch (_) {}
    }
  },

  async createOrGetConversation() {
    this.setData({ loading: true });
    try {
      const res = await request.post(API.CHAT.CREATE_CONV, {});
      if (res.data && res.data.id) {
        this.setData({ conversationId: res.data.id, loading: false });
        this.loadMessages();
        this.connectWs();
      } else {
        this.setData({ loading: false });
        wx.showToast({ title: '会话创建失败', icon: 'none' });
      }
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: e.message || '请先登录', icon: 'none' });
      if (e.code === 401) {
        setTimeout(() => {
          wx.navigateTo({ url: '/pages/profile/profile' });
        }, 1500);
      }
    }
  },

  async loadMessages() {
    const { conversationId } = this.data;
    if (!conversationId) return;
    try {
      const res = await request.get(replaceUrlParams(API.CHAT.MESSAGES, { id: conversationId }) + '?limit=50', { showLoading: false });
      const list = (res.data || []).reverse();
      this.setData({ messages: list });
    } catch (e) {
      console.error('loadMessages', e);
    }
  },

  connectWs() {
    request.get(API.CHAT.WS_TOKEN, { showLoading: false })
      .then(res => {
        if (!res.data || !res.data.token) return;
        const base = API_BASE_URL.replace(/^http/, 'ws');
        const url = base + '/ws/chat?token=' + encodeURIComponent(res.data.token);
        const task = wx.connectSocket({ url });
        this._wsTask = task;
        task.onMessage((ev) => {
          try {
            const data = JSON.parse(ev.data);
            if (data.event === 'message:new' && data.message) {
              const messages = [...this.data.messages, data.message];
              this.setData({ messages });
            }
          } catch (_) {}
        });
        task.onOpen(() => {
          task.send({ data: JSON.stringify({ event: 'subscribe', conversationId: this.data.conversationId }) });
        });
      })
      .catch(() => {});
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value });
  },

  async onSend() {
    const text = (this.data.inputText || '').trim();
    if (!text) return;
    const { conversationId } = this.data;
    if (!conversationId) return;
    const clientMsgId = 'mp-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    this.setData({ inputText: '' });
    try {
      const res = await request.post(replaceUrlParams(API.CHAT.MESSAGES, { id: conversationId }), {
        messageType: 'text',
        contentText: text,
        clientMsgId
      }, { showLoading: false });
      if (res.data) {
        const messages = [...this.data.messages, res.data];
        this.setData({ messages });
      }
    } catch (e) {
      wx.showToast({ title: e.message || '发送失败', icon: 'none' });
      this.setData({ inputText: text });
    }
  },

  onChooseImage() {
    const { conversationId } = this.data;
    if (!conversationId) {
      wx.showToast({ title: '会话未就绪', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath;
        this.uploadAndSendImage(path);
      }
    });
  },

  uploadAndSendImage(tempFilePath) {
    wx.showLoading({ title: '上传中...' });
    const openid = wx.getStorageSync('openid');
    wx.uploadFile({
      url: API_BASE_URL + API.CHAT.UPLOAD_IMAGE,
      filePath: tempFilePath,
      name: 'image',
      header: { 'openid': openid, 'x-wx-source': 'miniprogram' },
      success: (r) => {
        wx.hideLoading();
        try {
          const data = JSON.parse(r.data);
          if (data.code === 0 && data.data && data.data.url) {
            let url = data.data.url;
            if (!url.startsWith('http')) url = API_BASE_URL + (url.startsWith('/') ? url : '/' + url);
            this.sendImageMessage(url);
          } else {
            wx.showToast({ title: data.message || '上传失败', icon: 'none' });
          }
        } catch (e) {
          wx.showToast({ title: '上传失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '上传失败', icon: 'none' });
      }
    });
  },

  async sendImageMessage(contentUrl) {
    const { conversationId } = this.data;
    const clientMsgId = 'mp-img-' + Date.now();
    try {
      const res = await request.post(replaceUrlParams(API.CHAT.MESSAGES, { id: conversationId }), {
        messageType: 'image',
        contentUrl,
        clientMsgId
      }, { showLoading: false });
      if (res.data) {
        const messages = [...this.data.messages, res.data];
        this.setData({ messages });
      }
    } catch (e) {
      wx.showToast({ title: e.message || '发送失败', icon: 'none' });
    }
  }
});
