import { MP4Demux, Events, parseType } from './mp4-demuxer.js';
import { decimalToHex } from '../../util/tools.js';
import BaseUnpackgePlugin from '../base-unpackage-plugin.js';
/**
 * mp4 hdlr box handlerType
 */
const HANDLER_TYPE = ['vide', 'soun'];
/**
 * @typedef {object} MP4Options
 * @property {blob} file 文件数据
 * @property {object} mt mediaTranscoding实例
 */
export class MP4Parser extends BaseUnpackgePlugin {
  /**
   *
   * @param {MP4Options} options
   */
  constructor(options) {
    super();
    this.options = options;
    this.mt = options.mt;
    /**
     * 音频轨道列表
     */
    this.audioTrack = [];
    /**
     * 视频轨道列表
     */
    this.videoTrack = [];
    /**
     * 当前正在处理的音频/视频轨道
     */
    this.currentTrack = {};
  }
  /**
   * 获取视频文件某段数据
   * @param {number} start 开始位置
   * @param {number} end 结束位置
   * @returns {Promise<ArrayBuffer>}
   */
  async getData(start, end) {
    if (start >= this.options.file.size) {
      return;
    }
    return await this.options.file.slice(start, end).arrayBuffer();
  }
  /**
   * 解封装
   * @returns {Promise}
   */
  demux() {
    return new Promise(async (resolve, reject) => {
      const demux = new MP4Demux();
      demux.on(Events.PARSE, (e) => {
        const fn = this[`parse${e.type.toLowerCase()}`];
        if (typeof fn === 'function') {
          fn.call(this, e);
        }
      });
      demux.on(Events.ERROR, (e) => {
        reject(e);
      });
      let data;
      let offset = 0;
      const length = 8;
      // 读取box，传递给demux进行解析
      while ((data = await this.getData(offset, offset + length))) {
        const view = new DataView(data, 0, data.byteLength);
        const type = parseType(new Uint8Array(data, 4, 4));
        let size = view.getUint32(0);
        if (size === 1) {
          const data2 = await this.getData(offset + 8, offset + 16);
          const view2 = new DataView(data2, 0, data2.byteLength);
          size = Number(view2.getBigUint64(0));
        }
        // 跳过box mdat(文件剩余部分全是音视频编码数据，无需解析)
        if (type === 'mdat') {
          offset += size;
          continue;
        }
        if (size === 0) {
          // size为0，表示一直读到文件结尾
          demux.push(await this.getData(offset));
          break;
        } else {
          demux.push(await this.getData(offset, offset + size));
        }
        offset += size;
      }
      this.videoTrack.forEach((track) => {
        this.computedChunkStartSample(track);
      });
      this.audioTrack.forEach((track) => {
        this.computedChunkStartSample(track);
      });
      resolve();
    });
  }
  /**
   * 处理hdlr
   * @param {object} data
   */
  parsehdlr(data) {
    if (HANDLER_TYPE.includes(data.handlerType)) {
      this.handlerType = data.handlerType;
    }
  }
  /**
   * 处理mdhd
   * @param {object} data
   */
  parsemdhd(data) {
    this.currentTrack.duration = data.duration;
    this.currentTrack.timescale = data.timescale;
  }
  /**
   * 处理tkhd
   * @param {object} data
   */
  parsetkhd(data) {
    this.currentTrack.id = data.trackId;
    this.currentTrack.volume = data.volume;
    this.currentTrack.width = this.currentTrack.width || data.width;
    this.currentTrack.height = this.currentTrack.height || data.height;
  }
  /**
   * 处理stsz
   * @param {object} data
   */
  parsestsz(data) {
    this.currentTrack.samples = data.entries; // frame size list
  }
  /**
   * 处理stco
   * @param {object} data
   */
  parsestco(data) {
    this.currentTrack.chunkOffsets = data.chunkOffsets;
  }
  /**
   * 处理stsc
   * @param {object} data
   */
  parsestsc(data) {
    this.currentTrack.sampleToChunks = data.sampleToChunks;
  }
  /**
   * 处理stss
   * @param {object} data
   */
  parsestss(data) {
    this.currentTrack.sampleNumbers = data.sampleNumbers;
  }
  /**
   * 处理stts
   * @param {object} data
   */
  parsestts(data) {
    this.currentTrack.timeToSamples = data.timeToSamples;
  }
  /**
   * 处理trak
   * @param {object} data
   */
  parsetrak() {
    if (this.handlerType === 'vide') {
      this.currentTrack.type = 'video';
      this.width = this.currentTrack.width;
      this.height = this.currentTrack.height;
      this.duration = this.currentTrack.duration / this.currentTrack.timescale;
      this.videoTrack.push(this.currentTrack);
      this.currentTrack = {};
    } else if (this.handlerType === 'soun') {
      this.currentTrack.type = 'audio';
      this.audioTrack.push(this.currentTrack);
      this.currentTrack = {};
    }
  }
  /**
   * 处理mp4a
   * @param {object} data
   */
  parsemp4a(data) {
    this.currentTrack.channelcount = data.channelcount;
    this.currentTrack.samplerate = data.samplerate;
    this.currentTrack.samplesize = data.samplesize;
  }
  /**
   * 处理esds
   * @param {object} data
   */
  parseesds(data) {
    this.currentTrack.esds = data.raw;
    this.currentTrack.audioObjectType = data.decoderConfig?.decoderConfigDescriptor?.audioObjectType;
    this.currentTrack.samplingFrequencyIndex = data.decoderConfig?.decoderConfigDescriptor?.samplingFrequencyIndex;
  }
  /**
   * 处理avc1
   * @param {object} data
   */
  parse(data) {
    this.currentTrack.width = data.width || this.currentTrack.width;
    this.currentTrack.height = data.height || this.currentTrack.height;
  }
  /**
   * 处理av01
   * @param {object} data
   */
  parseav01(data) {
    this.currentTrack.width = this.currentTrack.width || data.width;
    this.currentTrack.height = this.currentTrack.height || data.height;
  }
  /**
   * 处理av1c
   * @param {object} data
   */
  parseav1c(data) {
    let colorMode = '';
    if (data.twelveBit) {
      colorMode = '12';
    } else if (data.highBitdepth) {
      colorMode = '10';
    } else {
      colorMode = '08';
    }
    this.currentTrack.codec = `av01.${data.seqProfile}.${`0${data.seqLevelIdx0}`.slice(-2)}${
      data.seqTier0 ? 'H' : 'M'
    }.${colorMode}`;
  }
  /**
   * 处理avcc
   * @param {object} data
   */
  parseavcc(data) {
    this.currentTrack.avcDescription = data.data;
    this.currentTrack.codec = `avc1.${decimalToHex(data.avcProfileIndication, 2)}${decimalToHex(
      data.profileCompatibility,
      2,
    )}${decimalToHex(data.avcLevelIndication, 2)}`;
  }
  /**
   * 计算每个chunk的开始/结束帧，方便后续取某一帧数据
   * @param {object} track
   */
  computedChunkStartSample(track) {
    track.sampleToChunks.forEach((item, index) => {
      const preSampleToChunk = track.sampleToChunks[index - 1];
      if (!preSampleToChunk) {
        item.startSample = 1;
        return false;
      }
      item.startSample =
        preSampleToChunk.startSample +
        (item.firstChunk - preSampleToChunk.firstChunk) * preSampleToChunk.samplesPerChunk;
      preSampleToChunk.endSample = item.startSample - 1;
    });
    track.sampleToChunks[track.sampleToChunks.length - 1].endSample = track.samples.length;
  }
  /**
   * 获取第n帧（采样）数据
   * @param {object} track
   * @param {number} n
   * @returns {{offset: number, size: number, duration: number} | undefined}
   */
  getSample(track, n) {
    if (n < 0 || n > track.samples.length) {
      return;
    }
    let frameOffset = 0;
    let chunkOffset = 0;
    let chunkStartSample = 0;
    const hasFound = track.sampleToChunks.some((item) => {
      if (n >= item.startSample && n <= item.endSample) {
        const chunkNum = item.firstChunk + Math.floor((n - item.startSample) / item.samplesPerChunk);
        chunkOffset = track.chunkOffsets[chunkNum - 1];
        chunkStartSample = item.startSample + (chunkNum - item.firstChunk) * item.samplesPerChunk;
        return true;
      }
      return false;
    });
    if (!hasFound) {
      return;
    }
    frameOffset = chunkOffset;
    for (let i = chunkStartSample - 1; i < n - 1; i++) {
      frameOffset += track.samples[i];
    }
    const result = {
      offset: frameOffset,
      size: track.samples[n - 1],
      duration: this.getSampleDuration(track, n),
    };
    if (track.type === 'video') {
      result.isKeyFrame = this.checkKeyFrame(n);
    }
    return result;
  }
  /**
   * 获取视频轨道第n帧的数据
   * @param {number} n
   */
  getVideoSample(n) {
    return this.getSample(this.videoTrack[0], n);
  }
  /**
   * 获取音频轨道第n个采样的数据
   * @param {number} n
   * @param {number} trackIndex 音频轨道数组下标
   */
  getAudioSample(n, trackIndex = 0) {
    return this.getSample(this.audioTrack[trackIndex], n);
  }
  /**
   * 获取媒体轨道第n帧（采样）持续时长
   * @param {object} track
   * @param {number} n
   * @returns {number}
   */
  getSampleDuration(track, n) {
    let duration = 0;
    let frameNumber = 0;
    track.timeToSamples.some((item) => {
      frameNumber += item.sampleCount;
      if (n <= frameNumber) {
        duration = item.sampleDelta;
        return true;
      }
      return false;
    });
    return duration;
  }
  /**
   * 判断第n帧是否为关键帧
   * @param {number} n
   * @returns {boolean}
   */
  checkKeyFrame(n) {
    const videoTrack = this.videoTrack[0];
    return videoTrack.sampleNumbers.includes(n);
  }
}
