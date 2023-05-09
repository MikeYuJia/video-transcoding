import { ParseBox } from './mp4-demuxer.js';
import generator from './mp4-generator.js';
import BasePackgePlugin from '../base-package-plugin.js';
const { ftyp, moov, mdat } = generator;
export class MP4Creator extends BasePackgePlugin {
  constructor({ mt, tracks, metaData }) {
    super();
    this.mt = mt;
    this.boxData = [];
    /**
     * 视频轨道列表
     */
    this.videoTrack = [];
    /**
     * 音频轨道列表
     */
    this.audioTrack = [];
    // 初始化视频/音频轨道
    tracks.forEach((item) => {
      const track = { ...item };
      track.totalByteLength = 0;
      track.originSamples = [];
      track.samples = [];
      track.timeToSamples = [];
      track.sampleToChunks = [];
      track.chunkOffsets = [];
      if (track.type === 'video') {
        track.sampleNumbers = [];
        this.videoTrack.push(track);
      } else {
        this.audioTrack.push(track);
      }
    });
    const description = ParseBox.avcC(new Uint8Array(metaData.decoderConfig.description));
    if (!this.videoTrack.length) {
      return;
    }
    // 初始化视频轨道信息
    const vt = this.videoTrack[0];
    vt.width = metaData.decoderConfig.codedWidth;
    vt.height = metaData.decoderConfig.codedHeight;
    vt.sps = description.sps;
    vt.pps = description.pps;
    vt.profileIdc = description.avcProfileIndication;
    vt.profileCompatibility = description.profileCompatibility;
    vt.levelIdc = description.avcLevelIndication;
    vt.codec = metaData.decoderConfig.codec;
  }
  /**
   * 添加视频帧
   * @param {object} sample
   */
  pushVideoSample(sample) {
    const vt = this.videoTrack[0];
    if (!vt) {
      return;
    }
    vt.originSamples.push(sample);
    vt.totalByteLength += sample.byteLength;
  }
  /**
   * 添加音频采样
   * @param {object} sample
   * @param {number} trackIndex
   */
  pushAudioSample(sample, trackIndex = 0) {
    const at = this.audioTrack[trackIndex];
    if (!at) {
      return;
    }
    at.originSamples.push(sample);
    at.totalByteLength += sample.byteLength;
  }
  /**
   * 获取第n帧(采样)信息
   * @param {object} track
   * @param {number} n
   * @returns
   */
  async getSampleData(track, n) {
    return track.originSamples[n].data;
  }
  /**
   * 更新帧相关信息
   * @param {*} param0
   */
  updateInfo({ track, sample, offset, endTime }) {
    const { samples, sampleNumbers, timeToSamples, sampleToChunks, chunkOffsets } = track;
    // 更新samples
    samples.push(sample.byteLength);
    // 更新sampleNumbers
    if (sample.isKeyFrame) {
      sampleNumbers.push(samples.length);
    }
    // 更新timeToSamples
    if (sample.duration) {
      const tts = timeToSamples[timeToSamples.length - 1];
      if (sample.duration === tts?.sampleDelta) {
        tts.sampleCount += 1;
      } else {
        timeToSamples.push({ sampleCount: 1, sampleDelta: sample.duration });
      }
    }
    // 更新chunkOffsets、sampleToChunks
    const stc = sampleToChunks[sampleToChunks.length - 1];
    if (stc && stc.endTime + sample.duration <= endTime) {
      stc.samplesPerChunk += 1;
      stc.endTime += sample.duration;
    } else {
      chunkOffsets.push(offset);
      sampleToChunks.push({
        firstChunk: chunkOffsets.length,
        samplesPerChunk: 1,
        endTime: (stc?.endTime || 0) + sample.duration,
        sampleDescriptionIndex: 1,
      });
    }
  }
  /**
   * 封装mdat box
   * @returns {Uint8Array}
   */
  async createBoxMdat() {
    const tracks = [...this.videoTrack, ...this.audioTrack].filter((track) => track?.originSamples?.length);
    const totalByteLength = tracks.reduce((a, b) => a + (b?.totalByteLength || 0), 0);
    const result = new Uint8Array(totalByteLength);
    let offset = 0;
    const rate = 1;
    const infos = tracks.map((track) => ({
      timescaleGap: track.timescale * rate, // 每rate秒一个chunk
      endTime: 0,
      lastEndTime: 0,
      i: 0,
    }));
    let isNewChunk = true;
    let endFlag = 0;
    while (endFlag < tracks.length) {
      for (let j = 0; j < tracks.length; j++) {
        // 更新track信息
        const track = tracks[j];
        const info = infos[j];
        isNewChunk = true;
        for (; info.i < track?.originSamples?.length; info.i++) {
          if (info.i >= track.originSamples.length - 1) {
            // 最后一个sample，添加结束标志
            endFlag += 1;
          }
          this.updateInfo({
            track,
            sample: track.originSamples[info.i],
            offset,
            endTime: info.endTime,
          });
          info.lastEndTime += track.originSamples[info.i].duration;
          // sample数据写入mdat buffer中
          const data = await this.getSampleData(track, info.i);
          result.set(new Uint8Array(data), offset);
          offset += track.originSamples[info.i].byteLength;
          if (isNewChunk) {
            info.endTime += info.timescaleGap;
            isNewChunk = false;
          }
          if (info.lastEndTime + track.originSamples[info.i].duration > info.endTime) {
            info.i += 1;
            break;
          }
        }
      }
    }
    return mdat(result);
  }
  /**
   * 合并拥有相同samplesPerChunk的相邻SampleToChunks
   * @param {object} track
   */
  mergeSampleToChunks(track) {
    if (!track) {
      return;
    }
    const { sampleToChunks } = track;
    let lastSampleToChunks = sampleToChunks[0];
    const result = [lastSampleToChunks];
    for (let i = 1; i < sampleToChunks.length; i++) {
      if (sampleToChunks[i].samplesPerChunk !== lastSampleToChunks.samplesPerChunk) {
        result.push(sampleToChunks[i]);
        lastSampleToChunks = sampleToChunks[i];
      }
    }
    track.sampleToChunks = result;
  }
  /**
   * 封装视频文件
   * @returns {ArrayBuffer}
   */
  async getFileBuffer() {
    const ftypData = ftyp();
    const mdatData = await this.createBoxMdat();
    const tracks = [...this.videoTrack, ...this.audioTrack].filter((track) => track?.originSamples?.length);
    tracks.forEach((track) => this.mergeSampleToChunks(track));
    let moovData = moov(tracks, this.videoTrack[0]?.duration || 0, this.videoTrack[0]?.timescale || 0);
    // TODO 可计算出直接baseOffset，无需再次moov
    const baseOffset = ftypData.byteLength + moovData.byteLength + 8;
    tracks.forEach((track) => {
      track?.chunkOffsets?.forEach((item, index) => {
        track.chunkOffsets[index] = item + baseOffset;
      });
    });
    moovData = moov(tracks, this.videoTrack[0]?.duration || 0, this.videoTrack[0]?.timescale || 0);
    const result = new Uint8Array(ftypData.byteLength + moovData.byteLength + mdatData.byteLength);
    result.set(ftypData, 0);
    result.set(moovData, ftypData.length);
    result.set(mdatData, ftypData.length + moovData.length);
    return result.buffer;
  }
}
