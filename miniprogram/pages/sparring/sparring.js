const { request } = require('../../utils/request');

const OPPONENT_STYLES = {
  data_monster: { name: '数据狂魔型', icon: '📊', description: '擅长用数据、统计和事实案例攻击你的论点', color: '#10b981' },
  value_emotional: { name: '价值煽情型', icon: '❤️', description: '擅长从道德、价值观和情感层面打动听众', color: '#f59e0b' },
  logic_deconstruction: { name: '逻辑拆解型', icon: '🔍', description: '擅长拆解对方逻辑漏洞，寻找论证缺陷', color: '#8b5cf6' },
};

const STYLE_LIST = [
  { id: 'data_monster', ...OPPONENT_STYLES.data_monster },
  { id: 'value_emotional', ...OPPONENT_STYLES.value_emotional },
  { id: 'logic_deconstruction', ...OPPONENT_STYLES.logic_deconstruction },
];

const TOPIC_LIST = [
  { id: 't1', title: 'Is recycling important?' },
  { id: 't2', title: 'Should children have mobile phones at school?' },
  { id: 't3', title: 'Should homework be banned?' },
  { id: 't4', title: 'Is social media good for society?' },
  { id: 't5', title: 'Should zoos be banned?' },
];

const MOCK_OPENINGS = {
  data_monster: "Let me start with some hard data. According to a 2024 meta-analysis, 67% of cases show significant positive outcomes. The numbers don't lie — here's what the evidence actually says.",
  value_emotional: "At the heart of this debate is a simple question: what kind of future do we want to create? I believe we have a moral responsibility to choose the path that uplifts everyone, not just a privileged few.",
  logic_deconstruction: "Let me break this down logically. First, we must define our terms clearly. Then we trace the chain of cause and effect. And finally we ask: does your conclusion actually follow from your premises?",
};

const MOCK_REPLIES = {
  data_monster: [
    'Interesting point. However, according to peer-reviewed studies, 78% of published data actually shows the opposite trend. Let me walk you through the specific statistics.',
    'I see your argument. Yet recent longitudinal research from 2024 indicates that 62% of real-world cases directly contradict your core claim.',
    'Let me cite hard evidence. A meta-analysis of 50 well-designed studies found that your claim only holds in 30% of controlled scenarios.',
  ],
  value_emotional: [
    'I hear what you are saying, but think about the bigger picture. The real question is about our shared values as a compassionate society.',
    'While your logic seems sound on the surface, we must consider the human impact. Stories of real people show us a deeper truth.',
    'At the heart of this debate is a fundamental question about what kind of world we want our children to grow up in.',
  ],
  logic_deconstruction: [
    'I see a clear logical flaw in your argument. Your premise does not necessarily lead to your conclusion. Let me explain the gap in your reasoning.',
    'Your argument commits a classic fallacy of false cause. The correlation you mentioned does not actually imply causation.',
    'Let me deconstruct your reasoning step by step. You make three hidden assumptions, none of which are properly justified.',
  ],
};

Page({
  data: {
    step: 'select',
    selectedStyle: '',
    selectedTopicId: '',
    selectedTopic: null,
    sessionId: '',
    opponent: { icon: '🤖', name: 'AI对手' },
    messages: [],
    userInput: '',
    statsDisplay: { totalRounds: 0, effectiveRate: '0%', stallCount: 0 },
    sending: false,
    recording: false,
    battleTopic: '',
    scrollViewHeight: 400,
    debugMsgCount: 0,
    STYLE_LIST: STYLE_LIST,
    TOPIC_LIST: TOPIC_LIST,
    _replyIndex: 0,
    // ===== 语音识别状态（可见，避免静默失败）=====
    voiceStep: 'idle',          // idle / auth / recording / uploading / fallback / ok
    voiceStatusText: '',        // 页面上直接显示
    recordSeconds: 0,
  },

  onLoad() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const winH = info.windowHeight || 667;
    const reserved = 100 + 64 + 56 + 76 + 8; // 额外多预留给语音状态条
    this.setData({ scrollViewHeight: Math.max(160, winH - reserved) });
    // 清理可能的录音定时器
    this._recordTimer = null;
    this._recordStartAt = 0;
  },

  _setVoice(step, text) {
    this.setData({
      voiceStep: step,
      voiceStatusText: text || '',
    });
  },

  selectStyle(e) {
    this.setData({ selectedStyle: e.currentTarget.dataset.style });
  },

  selectTopic(e) {
    const topic = e.currentTarget.dataset.topic;
    this.setData({ selectedTopic: topic, selectedTopicId: topic.id });
  },

  async startBattle() {
    const { selectedStyle, selectedTopic } = this.data;
    if (!selectedStyle || !selectedTopic) {
      wx.showToast({ title: '请选择对手风格和辩题', icon: 'none' });
      return;
    }
    if (this.data._startLock) return;
    this.setData({ _startLock: true });

    wx.showLoading({ title: '准备对练...' });
    const styleInfo = OPPONENT_STYLES[selectedStyle];

    let opening = MOCK_OPENINGS[selectedStyle];
    let sessionId = 'local_' + Date.now();
    let opponentName = styleInfo.name;
    let opponentIcon = styleInfo.icon;

    try {
      // 6秒超时，失败用本地数据
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('t')), 6000));
      const res = await Promise.race([
        request('/debate/start', {
          method: 'POST',
          data: {
            topic_id: selectedTopic.id,
            topic_title: selectedTopic.title,
            position: 'pro',
            opponent_style: selectedStyle,
          },
        }),
        timeoutPromise,
      ]).catch(() => null);
      if (res && res.code === 200 && res.data) {
        opening = res.data.opening || opening;
        sessionId = res.data.session_id || sessionId;
        if (res.data.opponent) {
          opponentName = res.data.opponent.name || opponentName;
          opponentIcon = res.data.opponent.icon || opponentIcon;
        }
      }
    } catch (e) {
      // ignore
    }

    wx.hideLoading();
    const now = Date.now();
    this.setData({
      step: 'battle',
      sessionId,
      opponent: { name: opponentName, icon: opponentIcon },
      messages: [{ role: 'ai', content: opening, styleName: styleInfo.name }],
      debugMsgCount: 1,
      statsDisplay: { totalRounds: 1, effectiveRate: '0%', stallCount: 0 },
      battleTopic: selectedTopic.title,
      _startLock: false,
      _lastMsgTs: now,
      _replyIndex: 0,
    });
  },

  inputChange(e) {
    this.setData({ userInput: e.detail.value });
  },

  async sendMessage() {
    const text = (this.data.userInput || '').trim();
    if (!text) return;
    if (this.data.sending) return;

    // 1. 立即添加用户消息
    const beforeMsgs = this.data.messages.concat([{ role: 'user', content: text }]);
    this.setData({
      userInput: '',
      sending: true,
      messages: beforeMsgs,
      debugMsgCount: beforeMsgs.length,
    });

    // 2. 构造 AI 回复（先本地生成兜底，再尝试真实API）
    const style = this.data.selectedStyle;
    const replies = MOCK_REPLIES[style] || MOCK_REPLIES.logic_deconstruction;
    const idx = this.data._replyIndex % replies.length;
    let aiText = replies[idx];
    const newReplyIndex = idx + 1;

    let newStats = null;
    try {
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('t')), 10000));
      const res = await Promise.race([
        request('/debate', {
          method: 'POST',
          data: {
            topic_id: this.data.selectedTopic.id,
            topic_title: this.data.selectedTopic.title,
            position: 'pro',
            user_speech: text,
            opponent_style: style,
            session_id: this.data.sessionId,
          },
        }),
        timeoutPromise,
      ]).catch(() => null);
      if (res && res.code === 200 && res.data) {
        if (res.data.ai_reply) aiText = res.data.ai_reply;
        if (res.data.stats) newStats = res.data.stats;
        if (res.data.session_id) {
          this.setData({ sessionId: res.data.session_id });
        }
      }
    } catch (e) {
      // ignore
    }

    // 3. 添加 AI 消息、更新状态
    const styleName = OPPONENT_STYLES[style] ? OPPONENT_STYLES[style].name : 'AI对手';
    const afterMsgs = beforeMsgs.concat([{ role: 'ai', content: aiText, styleName: styleName }]);

    // 统计显示
    let displayStats;
    if (newStats) {
      const rate = newStats.effective_rebuttal_rate || 0;
      displayStats = {
        totalRounds: newStats.total_rounds || 0,
        effectiveRate: Math.round(rate * 100) + '%',
        stallCount: newStats.stall_count || 0,
      };
    } else {
      const next = this.data.statsDisplay.totalRounds + 1;
      displayStats = {
        totalRounds: next,
        effectiveRate: this.data.statsDisplay.effectiveRate,
        stallCount: this.data.statsDisplay.stallCount,
      };
    }

    this.setData({
      messages: afterMsgs,
      debugMsgCount: afterMsgs.length,
      sending: false,
      statsDisplay: displayStats,
      _replyIndex: newReplyIndex,
      _lastMsgTs: Date.now(),
    });
  },

  endBattle() {
    this.setData({ step: 'result' });
  },

  // ========== 语音识别：先申请权限，再录音（点击切换模式 + 长按模式双支持）==========
  async toggleRecord() {
    if (this.data.recording) {
      this.stopRecord();
    } else {
      // 点击一次 = 开始录音
      await this.requestAuthAndStart();
    }
  },

  async requestAuthAndStart() {
    if (this.data.voiceStep === 'recording') return;
    this._setVoice('auth', '申请麦克风权限...');
    try {
      await wx.authorize({ scope: 'scope.record' });
    } catch (e) {
      // 用户拒绝或之前拒绝过
      try {
        const setting = await wx.getSetting();
        if (!setting.authSetting['scope.record']) {
          this._setVoice('fail', '❌ 未授权麦克风');
          wx.showModal({
            title: '需要麦克风权限',
            content: '语音输入需要麦克风权限，请点击"去开启"并允许录音权限。',
            confirmText: '去开启',
            success: (r) => {
              if (r.confirm) wx.openSetting();
            },
          });
          return;
        }
      } catch (_) { /* ignore */ }
    }
    this._actuallyStartRecord();
  },

  _actuallyStartRecord() {
    try {
      const rm = wx.getRecorderManager();
      this._voiceRecorderManager = rm;
      this._recordStartAt = Date.now();
      let startedOk = false;

      rm.onStart(() => {
        startedOk = true;
        this.setData({ recording: true, recordSeconds: 0 });
        this._setVoice('recording', '🎙 录音中（0s）— 再点按钮停止');
        // 秒数计数
        this._recordTimer = setInterval(() => {
          const sec = Math.round((Date.now() - this._recordStartAt) / 1000);
          this.setData({ recordSeconds: sec });
          if (this.data.voiceStep === 'recording') {
            this._setVoice('recording', `🎙 录音中（${sec}s）— 再点按钮停止`);
          }
          // 最长 10 秒自动停止
          if (sec >= 10) this.stopRecord();
        }, 500);
      });

      rm.onStop((res) => {
        this._clearRecordTimer();
        this.setData({ recording: false });
        if (!startedOk) {
          // 没真正开始录音
          this._setVoice('fail', '录音未启动，建议真机测试');
          this._sendFallbackSpeech();
          return;
        }
        const elapsed = (Date.now() - this._recordStartAt) / 1000;
        if (!res || !res.tempFilePath || elapsed < 0.4) {
          this._setVoice('fail', '录音时间太短或未生成录音文件');
          this._sendFallbackSpeech();
          return;
        }
        this._processAudioFile(res.tempFilePath, Math.round(elapsed * 10) / 10);
      });

      rm.onError((err) => {
        this._clearRecordTimer();
        this.setData({ recording: false });
        console.error('录音错误:', err);
        const msg = (err && err.errMsg) ? err.errMsg : '录音失败';
        this._setVoice('fail', '❌ 录音失败：' + msg.slice(0, 20));
        this._sendFallbackSpeech();
      });

      rm.start({
        duration: 11000,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 48000,
        format: 'mp3',
      });
    } catch (e) {
      this._clearRecordTimer();
      this.setData({ recording: false });
      this._setVoice('fail', '启动录音失败');
      this._sendFallbackSpeech();
    }
  },

  _clearRecordTimer() {
    if (this._recordTimer) {
      clearInterval(this._recordTimer);
      this._recordTimer = null;
    }
  },

  async _processAudioFile(filePath, durationSec) {
    this._setVoice('uploading', `上传识别中（${durationSec}s 音频）...`);
    let audioBase64 = '';
    try {
      const fs = wx.getFileSystemManager();
      const buf = fs.readFileSync(filePath, 'base64');
      audioBase64 = buf || '';
    } catch (e) {
      this._setVoice('fail', '读取录音文件失败');
      this._sendFallbackSpeech();
      return;
    }
    if (!audioBase64 || audioBase64.length < 20) {
      this._setVoice('fallback', '音频数据为空，使用示例文本');
      this._sendFallbackSpeech();
      return;
    }

    let recognizedText = '';
    try {
      this._setVoice('uploading', `调用语音识别API...`);
      const timeoutP = new Promise((_, reject) => setTimeout(() => reject(new Error('t')), 12000));
      const r = await Promise.race([
        request('/speech-to-text', {
          method: 'POST',
          data: { audio: audioBase64, format: 'mp3', duration_sec: durationSec },
        }),
        timeoutP,
      ]).catch(() => null);
      if (r && r.code === 200 && r.data && r.data.text) {
        recognizedText = r.data.text;
      }
    } catch (e) {
      // ignore
    }

    if (recognizedText) {
      this._setVoice('ok', '✅ 识别成功：' + recognizedText.slice(0, 30));
      this.setData({ userInput: recognizedText });
      this.sendMessage();
    } else {
      this._setVoice('fallback', '🌀 识别API未返回，发送示例论点');
      this._sendFallbackSpeech();
    }
  },

  startRecord() {
    // 长按开始
    if (this.data.voiceStep === 'recording' || this.data.recording) return;
    this.requestAuthAndStart();
  },

  stopRecord() {
    // 停止（长按松开 / 点击切换）
    const rm = this._voiceRecorderManager;
    if (rm && this.data.recording) {
      try { rm.stop(); } catch (e) { /* ignore */ }
    }
  },

  _sendFallbackSpeech() {
    const pool = [
      'I think the evidence strongly supports my position.',
      'Let me give you a concrete example from real life.',
      'That is a good point, but let me offer another perspective.',
      'The key issue here is about fairness and justice.',
      'I would like to challenge your core assumption.',
    ];
    const t = pool[Math.floor(Math.random() * pool.length)];
    this.setData({ userInput: t });
    this.sendMessage();
  },

  stopRecord() {
    const rm = this.data._recorderManager;
    if (rm) rm.stop();
  },

  restartBattle() {
    this.setData({
      step: 'select',
      selectedStyle: '',
      selectedTopicId: '',
      selectedTopic: null,
      sessionId: '',
      opponent: { icon: '🤖', name: 'AI对手' },
      messages: [],
      userInput: '',
      statsDisplay: { totalRounds: 0, effectiveRate: '0%', stallCount: 0 },
      sending: false,
      recording: false,
      battleTopic: '',
      debugMsgCount: 0,
      _replyIndex: 0,
      _startLock: false,
    });
  },

  goBack() {
    wx.navigateBack();
  },

  onUnload() {
    this._clearRecordTimer();
    try {
      const rm = this._voiceRecorderManager;
      if (rm && this.data.recording) rm.stop();
    } catch (e) { /* ignore */ }
  },
});
