/* global VideoDecoder VideoEncoder */
import { MediaDecoder } from './media-decoder.js';
import { MediaEncoder } from './media-encoder.js';
import EventEmitter from './event-emitter.js';
import { ERROR_CODE, EVENTS } from './const';
export class MediaTranscoding extends EventEmitter {
  constructor(options) {
    super();
    this.unpackagePluginsMap = {};
    this.packagePluginsMap = {};
    this.unpackagePlugin;
    this.packagePlugin;
    this.decoder;
    this.encoder;
    this.options = options;
    this.decodeFrameCount = 0;
    this.encodeFrameCount = 0;
  }
  /**
   * 注册解封装插件
   * @param {string} type 解封装文件类型，详见FILE_TYPE(src/const.js)
   * @param {*} classConstructor 解封装类
   */
  registerUnpackage(type, classConstructor) {
    this.unpackagePluginsMap[type] = classConstructor;
  }
  /**
   * 注册封装插件
   * @param {string} type 封装文件类型
   * @param {*} classConstructor 封装类
   */
  registerPackage(type, classConstructor) {
    this.packagePluginsMap[type] = classConstructor;
  }
  /**
   * 判断是否支持文件格式转码
   * @param {string} inputFileType 输入文件格式
   * @param {string} outputFileType 输出文件格式
   * @returns {boolean}
   */
  checkSupport(inputFileType, outputFileType) {
    const unpackagePluginClass = this.unpackagePluginsMap[inputFileType];
    if (!unpackagePluginClass) {
      this.log('error', `can not find ${inputFileType} unpackagePlugin`);
      return false;
    }
    const packagePluginClass = this.packagePluginsMap[outputFileType];
    if (!packagePluginClass) {
      this.log('error', `can not find ${outputFileType} packagePlugin`);
      return false;
    }
    return true;
  }
  /**
   * 判断是否支持编解码codec
   * @param {string} codec
   * @returns {boolean}
   */
  async isSupported(codec) {
    try {
      if (!VideoDecoder || !VideoEncoder) {
        return false;
      }
      const support = await VideoEncoder.isConfigSupported({
        codec,
        height: 480,
        width: 640,
      });
      return support.supported;
    } catch (e) {
      return false;
    }
  }
  /**
   * 开始转码
   */
  async transcode() {
    const { input, output } = this.options;
    // 是否支持文件格式
    if (!this.checkSupport(input.fileType, output.fileType)) {
      this.emit(EVENTS.ERROR, {
        code: ERROR_CODE.FILE_TRANSFORM_UNSUPPORTED,
        message: 'The file transcode not supported',
      });
      return;
    }
    // 是否支持编码格式
    const webcodecSupported = await this.isSupported(output.codec);
    if (!webcodecSupported) {
      this.emit(EVENTS.ERROR, {
        code: ERROR_CODE.WEBCODEC_UNSUPPORTED,
        message: `The browser does not support Webcodec or expect codec: ${output.codec}`,
      });
      return;
    }
    // 实例化解封装插件
    const UnpackagePluginClass = this.unpackagePluginsMap[input.fileType];
    this.unpackagePlugin = new UnpackagePluginClass({
      ...input,
      mt: this,
    });
    // 解封装
    await this.unpackagePlugin.demux().catch((e) => {
      this.emit(EVENTS.ERROR, {
        code: ERROR_CODE.TRANSCODE_ERROR,
        message: `demux failed: ${e ? e.message : 'error'}`,
      });
    });
    // 如果视频编码格式为h264且没解析到psp/pps信息，则报错
    if (
      !this.unpackagePlugin.videoTrack.length ||
      !this.unpackagePlugin.videoTrack[0].codec ||
      (this.unpackagePlugin.videoTrack[0].codec.startsWith('avc1') &&
        !this.unpackagePlugin.videoTrack[0].avcDescription)
    ) {
      this.emit(EVENTS.ERROR, {
        code: ERROR_CODE.TRANSCODE_ERROR,
        message: 'demux failed: gain codec error',
      });
      return;
    }
    // 创建解码器
    this.decoder = new MediaDecoder({
      config: {
        codec: this.unpackagePlugin.videoTrack[0].codec,
        codecWidth: this.unpackagePlugin.width,
        codecHeight: this.unpackagePlugin.height,
        description: this.unpackagePlugin.videoTrack[0].avcDescription, // avc需要传，否则报错非key frame
      },
      media: this.unpackagePlugin,
      event: this,
    });
    // 创建编码器
    this.encoder = new MediaEncoder({
      config: {
        codec: output.codec,
        width: output.width || this.unpackagePlugin.width,
        height: output.height || this.unpackagePlugin.height,
        bitrate: output.bitrate,
      },
      event: this,
    });
    // 设置编码器为解码器的下个处理器
    this.decoder.pipe(this.encoder);
    // 开始解码
    this.decoder.decode();
    // 监听解码结束
    this.on(EVENTS.DECODE_COMPLETE, async () => {
      // 如果编码结束，则进行视频文件封装
      if (this.encoder.encodeFrameCount === this.decoder.decodeFrameCount) {
        this.generateFile();
      }
      this.on(EVENTS.ENCODE_DATA, async () => {
        if (this.encoder.encodeFrameCount === this.decoder.decodeFrameCount) {
          this.generateFile();
        }
      });
    });
  }
  /**
   * 将编码后的数据封装成对应的output文件
   */
  async generateFile() {
    const { output } = this.options;
    if (this.encoder.encodeFrameCount === this.decoder.decodeFrameCount) {
      const tracks = [...this.unpackagePlugin.videoTrack, ...this.unpackagePlugin.audioTrack];
      const PackagePluginClass = this.packagePluginsMap[output.fileType];
      this.packagePlugin = new PackagePluginClass({
        tracks,
        metaData: this.encoder.metaData,
        mt: this,
      });
      this.encoder.frameBufferList.forEach(({ data, chunkType }, index) => {
        const sample = this.unpackagePlugin.getVideoSample(index + 1);
        this.packagePlugin.pushVideoSample({
          data: data.buffer,
          byteLength: data.byteLength,
          isKeyFrame: chunkType === 'key',
          duration: sample.duration,
        });
      });
      try {
        // 处理音频数据
        await this.processAllAudioSamples();
        // 返回转码后的文件数据
        const result = await this.packagePlugin.getFileBuffer();
        this.emit(EVENTS.COMPLETE, { data: result });
      } catch (e) {
        this.emit(EVENTS.ERROR, { code: ERROR_CODE.TRANSCODE_ERROR, message: e?.message });
      }
    }
  }
  /**
   * 处理音频帧
   */
  async processAllAudioSamples() {
    const { unpackagePlugin, packagePlugin } = this;
    for (let i = 0; i < unpackagePlugin.audioTrack?.length; i++) {
      const track = unpackagePlugin.audioTrack[i];
      for (let j = 0; j < track?.samples?.length; j++) {
        const sample = unpackagePlugin.getAudioSample(j + 1, i);
        const data = await unpackagePlugin.getData(sample.offset, sample.offset + sample.size);
        packagePlugin.pushAudioSample(
          {
            data,
            byteLength: data.byteLength,
            duration: sample.duration,
          },
          i,
        );
      }
    }
  }
  destroy() {
    if (this.decoder) {
      this.decoder.destroy();
      this.decoder = null;
    }
    if (this.encoder) {
      this.encoder.destroy();
      this.encoder = null;
    }
    this.emit(EVENTS.DESTROYED);
  }
  log(type, ...args) {
    if (this.options.debug) {
      console[type](...[...args].slice(1));
    }
  }
}
