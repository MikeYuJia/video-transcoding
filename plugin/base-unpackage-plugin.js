/* eslint-disable no-unused-vars */
export default class BaseUnpackgePlugin {
  width;
  height;
  duration;
  /**
   * 获取第n帧（采样）数据
   * @param {object} track
   * @param {number} n
   * @returns {{offset: number, size: number, duration: number} | undefined}
   */
  getVideoSample(n) {}
  /**
   * 获取音频轨道第n个采样的数据
   * @param {number} n
   * @param {number} trackIndex 音频轨道数组下标
   * @returns {{offset: number, size: number, duration: number} | undefined}
   */
  getAudioSample(n, trackIndex = 0) {}
  /**
   * 获取视频文件某段数据
   * @param {number} start 开始位置
   * @param {number} end 结束位置
   * @returns {Promise<ArrayBuffer>}
   */
  getData(start, end) {}
  /**
   * 解封装
   * @returns {Promise}
   */
  demux() {}
  /**
   * 判断第n帧是否为关键帧
   * @param {number} n
   * @returns {boolean}
   */
  checkKeyFrame(n) {}
}
