/* global VideoDecoder EncodedVideoChunk */
import { ERROR_CODE, EVENTS } from './const';
/**
 * 视频解码类
 */
export class MediaDecoder {
  constructor({ config, media, event }) {
    this.config = config;
    this.media = media;
    this.event = event;
    /**
     * 已解码的帧数量
     */
    this.decodeFrameCount = 0;
    /**
     * 下次解码的帧序号
     */
    this.nextFrame = 1;
    /**
     * 允许解码队列的最大值，防止内存消耗过多
     */
    this.maxPreDecodeFrameCount = 5;
    this.decoder = new VideoDecoder({
      error: this.onError.bind(this),
      output: this.onOutput.bind(this),
    });
    this.decoder.configure(config);
    /**
     * pipe的下一个处理器
     */
    this.nextProcess = null;
    /**
     * 是否处于锁定状态
     */
    this.isDecodeLocking = false;
  }
  /**
   * 解码视频
   */
  async decode() {
    if (this.isDecodeLocking) {
      return;
    }
    // 锁定解码，防止多次调用导致nextFrame不准
    this.isDecodeLocking = true;
    const { decoder, media } = this;
    if (!decoder || decoder.state === 'closed' || !media) {
      this.isDecodeLocking = false;
      return;
    }
    // 获取帧数据buffer
    const frame = media.getVideoSample(this.nextFrame);
    // 解析完毕，等待解码器flush后抛出事件
    if (!frame) {
      await this.decoder.flush();
      this.isDecodeLocking = false;
      this.event.emit(EVENTS.DECODE_COMPLETE);
      return;
    }
    await this.decodeFrame(frame);
    this.nextFrame += 1;
    this.isDecodeLocking = false;
    // 如果解码队列数量 < maxPreDecodeFrameCount，则继续向队列添加数据
    if (this.nextFrame <= this.decodeFrameCount + this.maxPreDecodeFrameCount) {
      this.decode();
    }
  }
  /**
   * 解码帧数据
   * @param {object} frame
   */
  async decodeFrame(frame) {
    const { decoder, media } = this;
    const data = await media.getData(frame.offset, frame.offset + frame.size);
    const chunk = new EncodedVideoChunk({
      timestamp: 0,
      duration: frame.duration,
      type: frame.isKeyFrame ? 'key' : 'delta',
      data,
    });
    decoder.decode(chunk);
  }
  /**
   * 处理error事件
   * @param {object} e
   */
  onError(e) {
    this.close();
    this.event.emit(EVENTS.ERROR, {
      code: ERROR_CODE.DECODE_ERROR,
      message: `decoder error: ${e?.message}`,
    });
  }
  /**
   * 处理解码回调
   * @param {VideoFrame} data
   */
  async onOutput(data) {
    this.decodeFrameCount += 1;
    this.event.emit(EVENTS.DECODE_DATA);
    // 如果存在后续处理器
    if (this.nextProcess) {
      await this.nextProcess.process({
        data,
        info: {
          keyFrame: this.media.checkKeyFrame(this.decodeFrameCount),
        },
      });
    }
    this.decode();
    // 释放内存
    data.close();
  }
  /**
   * 接入后续处理器
   * @param {object} nextProcess
   * @returns nextProcess
   */
  pipe(nextProcess) {
    this.nextProcess = nextProcess;
    return nextProcess;
  }
  /**
   * 关闭解码器
   */
  close() {
    if (this.decoder && this.decoder.state !== 'closed') {
      this.decoder.close();
    }
  }
  /**
   * 销毁内部对象
   */
  destroy() {
    this.close();
    this.decoder = null;
  }
}
