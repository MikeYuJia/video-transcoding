/* global VideoEncoder */
import { ERROR_CODE, EVENTS } from './const';
/**
 * 视频编码类
 */
export class MediaEncoder {
  constructor({ config, event }) {
    this.config = config;
    this.event = event;
    /**
     * 已编码的帧数量
     */
    this.encodeFrameCount = 0;
    this.encoder = new VideoEncoder({
      output: this.onOutput.bind(this),
      error: this.onError.bind(this),
    });
    this.encoder.configure(config);
    /**
     * 编码后的帧数据队列
     */
    this.frameBufferList = [];
    /**
     * 编码参数
     */
    this.metaData = null;
  }
  /**
   * pipe前一个处理器调用的方法
   * @param {object} param0
   */
  async process({ data, info }) {
    this.encode(data, info);
  }
  /**
   * 编码图像
   * @param {VideoFrame} data
   * @param {object} info
   */
  encode(data, info) {
    this.encoder.encode(data, info);
  }
  /**
   * 处理error事件
   * @param {object} e
   */
  onError(e) {
    this.close();
    this.event.emit(EVENTS.ERROR, {
      code: ERROR_CODE.ENCODE_ERROR,
      message: `encoder error: ${e?.message}`,
    });
  }
  /**
   * 处理编码回调
   * @param {object} chunk
   * @param {object} [metaData]
   */
  async onOutput(chunk, metaData) {
    this.encodeFrameCount += 1;
    this.event.emit(EVENTS.ENCODE_DATA);
    if (metaData?.decoderConfig && !this.metaData) {
      this.metaData = metaData;
    }
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    this.frameBufferList.push({ data, chunkType: chunk.type });
  }
  /**
   * 关闭编码器
   */
  close() {
    if (this.encoder.state !== 'closed') {
      this.encoder.close();
    }
  }
  /**
   * 销毁内部对象
   */
  destroy() {
    this.close();
    this.encoder = null;
  }
}
