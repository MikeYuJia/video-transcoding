/* eslint-disable no-unused-vars */
export default class BasePackgePlugin {
  /**
   * 添加视频帧
   * @param {object} sample
   */
  pushVideoSample(sample) {}
  /**
   * 添加音频采样
   * @param {object} sample
   * @param {number} trackIndex
   */
  pushAudioSample(sample, trackIndex = 0) {}
  /**
   * 封装视频文件
   * @returns {ArrayBuffer}
   */
  async getFileBuffer() {}
}
