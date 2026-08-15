const { request } = require('../../utils/request');

Page({
  data: {
    refText: '',
    recording: false,
    showResult: false,
    evaluating: false,
    result: {
      pronunciation: 0,
      fluency: 0,
      integrity: 0,
      overall: 0,
    },
    wordScores: [],
    recorderManager: null,
    tempAudioPath: '',
    scoreColor: '',
  },

  onLoad(options) {
    if (options.text) {
      this.setData({ refText: decodeURIComponent(options.text) });
    } else {
      this.setData({
        refText: 'AI technology is changing the way we learn. It helps students understand difficult concepts easily.',
      });
    }

    // 初始化录音管理器
    this.data.recorderManager = wx.getRecorderManager();
    this.data.recorderManager.onStop((res) => {
      this.setData({ tempAudioPath: res.tempFilePath });
      this.submitEvaluate(res.tempFilePath);
    });
  },

  startRecord() {
    const options = {
      duration: 30000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 64000,
      format: 'mp3',
    };

    this.data.recorderManager.start(options);
    this.setData({ recording: true, showResult: false });
  },

  stopRecord() {
    this.data.recorderManager.stop();
    this.setData({ recording: false });
  },

  async submitEvaluate(audioPath) {
    this.setData({ evaluating: true });

    try {
      // 将音频文件转为Base64
      const fs = wx.getFileSystemManager();
      const base64 = fs.readFileSync(audioPath, 'base64');

      const res = await request('/evaluate', {
        method: 'POST',
        data: {
          audio_base64: base64,
          ref_text: this.data.refText,
        },
      });

      if (res.code === 200) {
        const data = res.data;
        this.setData({
          result: data,
          wordScores: data.word_scores || [],
          showResult: true,
          scoreColor: this.getScoreColor(data.overall),
        });
      } else {
        throw new Error(res.message);
      }
    } catch (err) {
      console.error('语音评测失败:', err);
      wx.showToast({ title: '评测服务暂时不可用，使用模拟数据', icon: 'none' });
      // 模拟数据兜底（带标识）
      const mock = {
        pronunciation: Math.floor(Math.random() * 30) + 70,
        fluency: Math.floor(Math.random() * 30) + 70,
        integrity: Math.floor(Math.random() * 20) + 80,
        overall: 0,
        word_scores: [],
        _is_mock: true,
      };
      mock.overall = Math.round((mock.pronunciation + mock.fluency + mock.integrity) / 3);
      this.setData({
        result: mock,
        wordScores: [],
        showResult: true,
        scoreColor: this.getScoreColor(mock.overall),
      });
    } finally {
      this.setData({ evaluating: false });
    }
  },

  getScoreColor(score) {
    if (score >= 85) return 'green';
    if (score >= 70) return 'yellow';
    return 'red';
  },

  getScoreLevel(score) {
    if (score >= 85) return '优秀';
    if (score >= 70) return '良好';
    if (score >= 60) return '一般';
    return '需加强';
  },

  getWordScoreColor(score) {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  },

  tryAgain() {
    this.setData({
      showResult: false,
      result: { pronunciation: 0, fluency: 0, integrity: 0, overall: 0 },
      wordScores: [],
      scoreColor: '',
    });
  },

  goBack() {
    wx.navigateBack();
  },
});