/**
 * 转码文件类型
 */
export const FILE_TYPE = {
  MP4: 'mp4',
};
/**
 * 错误码
 */
export const ERROR_CODE = {
  WEBCODEC_UNSUPPORTED: -1,
  FILE_TRANSFORM_UNSUPPORTED: -2,
  DECODE_ERROR: -3,
  ENCODE_ERROR: -4,
  TRANSCODE_ERROR: -5,
  UNKNOWN_ERROR: -6,
};
/**
 * 事件类型
 */
export const EVENTS = {
  DECODE_DATA: 'DECODE_DATA',
  DECODE_COMPLETE: 'DECODE_COMPLETE',
  ENCODE_DATA: 'ENCODE_DATA',
  ENCODE_COMPLETE: 'ENCODE_COMPLETE',
  ERROR: 'ERROR',
  COMPLETE: 'COMPLETE',
  DESTROYED: 'DESTROYED',
};
