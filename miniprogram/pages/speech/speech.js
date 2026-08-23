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
    segmentCount: 0,
    recordedSeconds: 0,
  },

  onLoad(options) {
    if (options.text) {
      this.setData({ refText: decodeURIComponent(options.text) });
    } else {
      this.setData({
        refText: 'AI technology is changing the way we learn. It helps students understand difficult concepts easily.',
      });
    }

    this._recordingSessionActive = false;
    this._discardRecording = false;
    this._segmentPaths = [];
    this._recordedDurationMs = 0;
    this._segmentTimer = null;
    this._segmentStartedAt = 0;
    this.recorderManager = wx.getRecorderManager();
    this.recorderManager.onStart(() => {
      this._segmentStartedAt = Date.now();
      this.setData({ recording: true, showResult: false });
      this._segmentTimer = setTimeout(() => {
        if (this._recordingSessionActive && this.data.recording) this.recorderManager.stop();
      }, 24000);
    });
    this.recorderManager.onStop((res) => {
      if (this._segmentTimer) clearTimeout(this._segmentTimer);
      this._segmentTimer = null;
      if (res.tempFilePath && !this._discardRecording) {
        this._segmentPaths.push(res.tempFilePath);
        this._recordedDurationMs += Number(res.duration) || Math.max(0, Date.now() - this._segmentStartedAt);
        this.setData({
          tempAudioPath: res.tempFilePath,
          segmentCount: this._segmentPaths.length,
          recordedSeconds: Math.round(this._recordedDurationMs / 1000),
        });
      }

      if (this._recordingSessionActive && !this._discardRecording) {
        this._nextSegmentTimer = setTimeout(() => {
          this._nextSegmentTimer = null;
          this.startNextSegment();
        }, 100);
        return;
      }

      this.finishRecordingSession();
      this._discardRecording = false;
    });
    this.recorderManager.onError((err) => {
      console.error('录音失败:', err);
      this._recordingSessionActive = false;
      this._discardRecording = true;
      this.setData({ recording: false });
      wx.showToast({ title: '录音失败，请检查麦克风权限', icon: 'none' });
    });
  },

  async startRecord() {
    if (this.data.recording || this.data.evaluating) return;
    const authorized = await this.ensureRecordAuthorization();
    if (!authorized) return;

    this._recordingSessionActive = true;
    this._discardRecording = false;
    if (this._nextSegmentTimer) clearTimeout(this._nextSegmentTimer);
    this._segmentPaths = [];
    this._recordedDurationMs = 0;
    this.setData({ segmentCount: 0, recordedSeconds: 0, showResult: false });
    this.startNextSegment();
  },

  stopRecord() {
    if (!this._recordingSessionActive) return;
    this._recordingSessionActive = false;
    if (this.data.recording) {
      this.recorderManager.stop();
    } else {
      if (this._nextSegmentTimer) clearTimeout(this._nextSegmentTimer);
      this._nextSegmentTimer = null;
      this.finishRecordingSession();
    }
  },

  cancelRecord() {
    this.stopRecord();
  },

  startNextSegment() {
    if (!this._recordingSessionActive || this.data.evaluating) return;
    this.recorderManager.start({
      duration: 25000,
      sampleRate: 16000,
      numberOfChannels: 1,
      format: 'wav',
    });
  },

  toggleRecord() {
    if (this.data.recording) this.stopRecord();
    else this.startRecord();
  },

  finishRecordingSession() {
    const segmentPaths = this._segmentPaths.slice();
    this.setData({ recording: false });
    this._segmentPaths = [];
    if (segmentPaths.length && !this._discardRecording) this.submitEvaluate(segmentPaths);
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

  async submitEvaluate(segmentPaths) {
    this.setData({ evaluating: true });

    try {
      const requestData = {
        ref_text: this.data.refText,
        format: 'wav',
        duration_sec: Math.max(1, this.data.recordedSeconds),
      };
      const requestOptions = {
        method: 'POST',
        data: requestData,
        timeout: 60000,
      };
      if (getApp().globalData.apiMode === 'cloud-function') {
        requestOptions.filePaths = segmentPaths;
      } else {
        requestData.audio_base64s = segmentPaths.map(audioPath => (
          wx.getFileSystemManager().readFileSync(audioPath, 'base64')
        ));
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
    this._recordingSessionActive = false;
    this._discardRecording = true;
    if (this._nextSegmentTimer) clearTimeout(this._nextSegmentTimer);
    this._nextSegmentTimer = null;
    if (this.data.recording) this.recorderManager.stop();
  },

  onUnload() {
    this.onHide();
  },
});
