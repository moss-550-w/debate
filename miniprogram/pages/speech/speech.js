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

    this._recordTouchActive = false;
    this._shouldSubmitRecording = false;
    this.recorderManager = wx.getRecorderManager();
    this.recorderManager.onStart(() => {
      this.setData({ recording: true, showResult: false });
      if (!this._recordTouchActive) this.recorderManager.stop();
    });
    this.recorderManager.onStop((res) => {
      const shouldSubmit = this._shouldSubmitRecording;
      this._shouldSubmitRecording = false;
      this.setData({ recording: false });
      if (!shouldSubmit || !res.tempFilePath) return;
      this.setData({ tempAudioPath: res.tempFilePath });
      this.submitEvaluate(res.tempFilePath);
    });
    this.recorderManager.onError((err) => {
      console.error('录音失败:', err);
      this._shouldSubmitRecording = false;
      this.setData({ recording: false });
      wx.showToast({ title: '录音失败，请检查麦克风权限', icon: 'none' });
    });
  },

  async startRecord() {
    if (this.data.recording || this.data.evaluating) return;
    this._recordTouchActive = true;
    const authorized = await this.ensureRecordAuthorization();
    if (!authorized || !this._recordTouchActive) return;

    const options = {
      duration: 30000,
      sampleRate: 16000,
      numberOfChannels: 1,
      format: 'wav',
    };

    this._shouldSubmitRecording = true;
    this.recorderManager.start(options);
  },

  stopRecord() {
    this._recordTouchActive = false;
    if (this.data.recording) this.recorderManager.stop();
  },

  cancelRecord() {
    this.stopRecord();
  },

  async ensureRecordAuthorization() {
    try {
      const settings = await wx.getSetting();
      if (settings.authSetting['scope.record']) return true;
      await wx.authorize({ scope: 'scope.record' });
      return true;
    } catch (err) {
      console.warn('未获得录音权限:', err);
      wx.showModal({
        title: '需要麦克风权限',
        content: '跟读评测需要使用麦克风录制英语音频，请在设置中允许录音权限。',
        confirmText: '去设置',
        success: (result) => {
          if (result.confirm) wx.openSetting();
        },
      });
      return false;
    }
  },

  async submitEvaluate(audioPath) {
    this.setData({ evaluating: true });

    try {
      const requestOptions = {
        method: 'POST',
        data: {
          ref_text: this.data.refText,
          format: 'wav',
        },
      };
      if (getApp().globalData.apiMode === 'cloud-function') {
        requestOptions.filePath = audioPath;
      } else {
        requestOptions.data.audio_base64 = wx.getFileSystemManager().readFileSync(audioPath, 'base64');
      }

      const res = await request('/evaluate', requestOptions);

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
      wx.showModal({
        title: '评测未完成',
        content: err.message || '评测服务暂时不可用，请稍后重试。',
        showCancel: false,
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

  onHide() {
    this._recordTouchActive = false;
    this._shouldSubmitRecording = false;
    if (this.data.recording) this.recorderManager.stop();
  },

  onUnload() {
    this.onHide();
  },
});
