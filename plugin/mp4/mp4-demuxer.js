/* eslint-disable */
import EventEmitter from '../../event-emitter.js';
/**
 * @file= events.js, created at Monday, 23rd December 2019 3=47=23 pm
 * @copyright Copyright (c) 2020
 * @author gem <gems.xu@gmail.com>
 */
var Events;
(function (Events) {
	Events['ERROR'] = 'ERROR';
	Events['INFO'] = 'INFO';
	Events['DATA'] = 'DATA';
	Events['DEMUX_DATA'] = 'DEMUX_DATA';
	Events['DONE'] = 'DONE';
	Events['PARSE'] = 'PARSE';
})(Events || (Events = {}));
class Context extends EventEmitter {}
/**
 * @file: is.js, created at Monday, 23rd December 2019 3:47:23 pm
 * @copyright Copyright (c) 2020
 * @author gem <gems.xu@gmail.com>
 */
/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString = Object.prototype.toString;
/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
	return !!value && typeof value == 'object';
}
/**
 * @param num
 */
function isNumber(num) {
	return typeof num === 'number' && !isNaN(num);
}
/**
 * @param value
 */
function isArrayBuffer(value) {
	return isObjectLike(value) && objectToString.call(value).toLowerCase() === '[object arraybuffer]';
}
/**
 * @param value
 */
function isUint8Array(value) {
	return isObjectLike(value) && objectToString.call(value).toLowerCase() === '[object uint8array]';
}
/**
 * @file: cache-buffer.js, created at Monday, 23rd December 2019 3:47:23 pm
 * @copyright Copyright (c) 2020
 * @author gem <gems.xu@gmail.com>
 */
/**
 * Cache Buffer util.
 * It's applicable for streaming data cutting and retaining the data,
 * the algorithm minimizes memory application as much as possible.
 */
class CacheBuffer {
	constructor() {
		this.list_ = [];
	}
	get byteLength() {
		if (!isNumber(this.byteLength_)) {
			let len = 0;
			for (let i = 0, item; i < this.list_.length; i++) {
				item = this.list_[i];
				len += item.byteLength;
			}
			this.byteLength_ = len;
		}
		return this.byteLength_;
	}
	/**
	 * maybe return new allocated memory or original memory
	 */
	get bytes() {
		const { bufferList } = this;
		let bytes = null;
		if (bufferList.length > 0) {
			if (bufferList.length === 0) {
				bytes = bufferList[0];
			} else {
				bytes = this.toNewBytes();
			}
		}
		return bytes;
	}
	get empty() {
		return this.list_.length === 0;
	}
	get bufferList() {
		return this.list_;
	}
	clear() {
		let len = this.list_.length;
		if (len > 0) {
			this.list_.splice(0, len);
		}
		this.byteLength_ = null;
	}
	toNewBytes() {
		let bytes = null;
		let tryCount = 0;
		let maxTryCount = 50;
		// The following retry strategies are provided for failed memory applications
		// In terms of a better strategy, a failed memory application retry should be
		// an asynchronous process, which does not return until the application succeeds.
		// But the original design of the library is synchronous.
		while (bytes === null) {
			try {
				tryCount++;
				bytes = new Uint8Array(this.byteLength);
			} catch (e) {
				if (tryCount > maxTryCount) {
					throw e;
				}
			}
		}
		for (let i = 0, offset = 0; i < this.list_.length; i++) {
			let payload = this.list_[i];
			bytes.set(payload, offset);
			offset += payload.byteLength;
		}
		return bytes;
	}
	append(newBuffer) {
		if (newBuffer instanceof CacheBuffer) {
			this.list_ = this.list_.concat(newBuffer.bufferList);
		} else {
			this.list_.push(newBuffer);
		}
		this.byteLength_ = null;
	}
	/**
	 * This function cuts a complete TypedArray from CacheBuffer and retains the remainder of CacheBuffer.
	 * The following points should be noted when using this function:
	 * 1. If the cut needs to return the cut-out part, the cut length should be as small as possible to reduce the errors in memory application.
	 * 2. If the cutting is only to preserve the remaining parts, the cutting size is within the total number of bytes, without considering memory applications.
	 * @param {number} fixedLength
	 * @param {boolean} [needCutResult] - If not, just retain the remaining parts after cutting.
	 */
	cut(fixedLength, needCutResult = true) {
		let chunk = null;
		if (fixedLength > 0 && !this.empty) {
			let list = this.list_;
			let offset = 0;
			let loopIndex = 0;
			while (list.length > 0) {
				let cur = list.shift();
				if (loopIndex === 0) {
					if (cur.byteLength >= fixedLength) {
						if (needCutResult) {
							// Here is the key point for optimize memory alloc
							chunk = cur.subarray(0, fixedLength);
						}
						if (cur.byteLength > fixedLength) {
							cur = cur.subarray(fixedLength);
							list.unshift(cur);
						}
						break;
					} else {
						if (needCutResult) {
							try {
								chunk = new Uint8Array(fixedLength);
							} catch (e) {
								throw `alloc_memory_error@ cache buffer: ${fixedLength} ${e.message}`;
							}
							chunk.set(cur, 0);
						}
						offset += cur.byteLength;
					}
				} else {
					let subLen = fixedLength - offset;
					if (cur.byteLength >= subLen) {
						if (needCutResult) {
							chunk.set(cur.subarray(0, subLen), offset);
						}
						cur = cur.subarray(subLen);
						if (cur.byteLength > 0) {
							list.unshift(cur);
						}
						break;
					} else {
						if (needCutResult) {
							chunk.set(cur, offset);
						}
						offset += cur.byteLength;
						break;
					}
				}
				loopIndex++;
			}
			this.byteLength_ = null;
		}
		return chunk;
	}
}
/**
 * @fileOverview A simple multimap template.
 */
class MultiMap {
	constructor() {
		this.map_ = {};
	}
	/**
	 * Add a key, value pair to the map.
	 * @param key
	 * @param value
	 */
	push(key, value) {
		if (Object.prototype.hasOwnProperty.call(this.map_, key)) {
			this.map_[key].push(value);
		} else {
			this.map_[key] = [value];
		}
	}
	/**
	 * Get a list of values by key.
	 * @param key
	 */
	get(key) {
		let list = this.map_[key];
		// slice() clones the list so that it and the map can each be modified
		// without affecting the other.
		return list ? list.slice() : null;
	}
	/**
	 * Get a list of all values.
	 */
	getAll() {
		let list = [];
		for (let key in this.map_) {
			list.push.apply(list, this.map_[key]);
		}
		return list;
	}
	/**
	 * Remove a specific value, if it exists.
	 * @param key
	 * @param value
	 */
	remove(key, value) {
		let list = this.map_[key];
		if (list) {
			for (let i = 0; i < list.length; ++i) {
				if (list[i] == value) {
					list.splice(i, 1);
					--i;
				}
			}
		}
	}
	/**
	 * Clear all keys and values from the multimap.
	 */
	clear() {
		this.map_ = {};
	}
	/**
	 * @param callback
	 */
	forEach(callback) {
		for (let key in this.map_) {
			callback(key, this.map_[key]);
		}
	}
}
/**
 * Creates a new Binding_ and attaches the event listener to the event target.
 */
class Binding_ {
	/**
	 * @param target - The event target.
	 * @param type - The event type.
	 * @param listener - The event listener.
	 */
	constructor(target, type, listener) {
		this.target = target;
		this.type = type;
		this.listener = listener;
		if (this.target.addEventListener) {
			this.target.addEventListener(type, listener, false);
		} else if (this.target.on) {
			this.target.on(type, listener, false);
		}
	}
	/**
	 * Detaches the event listener from the event target.
	 * This does nothing if the event listener is already detached.
	 */
	off() {
		if (this.target.removeEventListener) {
			this.target.removeEventListener(this.type, this.listener, false);
		} else if (this.target.off) {
			this.target.off(this.type, this.listener, false);
		}
		this.target = null;
		this.listener = null;
	}
}
/**
 * Creates a new EventManager.
 * An EventManager maintains a collection of "event bindings" between event targets and event listeners.
 */
class EventManager {
	// static Binding_: Binding;
	constructor() {
		/**
		 * Maps an event type to an array of event bindings.
		 */
		this.bindingMap_ = new MultiMap();
	}
	/**
	 * Detaches all event listeners.
	 * @override
	 */
	destroy() {
		this.removeAll();
		this.bindingMap_ = null;
	}
	/**
	 * Attaches an event listener to an event target.
	 * @param target - The event target.
	 * @param type  - The event type.
	 * @param listener  - The event listener.
	 */
	on(target, type, listener) {
		if (!this.bindingMap_) return;
		let binding = new Binding_(target, type, listener);
		this.bindingMap_.push(type, binding);
		return this;
	}
	/**
	 * Attaches an event listener to an event target.
	 * The listener will be removed when the first instance of the event is fired.
	 * @param {EventTarget} target The event target.
	 * @param {string} type The event type.
	 * @param {function} listener The event listener.
	 */
	once(target, type, listener) {
		// Install a shim listener that will stop listening after the first event.
		this.on(
			target,
			type,
			function (event) {
				// Stop listening to this event.
				this.off(target, type);
				// Call the original listener.
				listener(event);
			}.bind(this)
		);
	}
	/**
	 * Detaches an event listener from an event target.
	 * @param {EventTarget} target The event target.
	 * @param {string} type The event type.
	 */
	off(target, type) {
		if (!this.bindingMap_) return;
		let list = this.bindingMap_.get(type) || [];
		for (let i = 0; i < list.length; ++i) {
			let binding = list[i];
			if (binding.target == target) {
				binding.off();
				this.bindingMap_.remove(type, binding);
			}
		}
	}
	/**
	 * Detaches all event listeners from all targets.
	 */
	removeAll() {
		if (!this.bindingMap_) return;
		let list = this.bindingMap_.getAll();
		for (let i = 0; i < list.length; ++i) {
			list[i].off();
		}
		this.bindingMap_.clear();
	}
}
// EventManager.Binding_ = Binding;
/**
 * @file: global.js, created at Monday, 23rd December 2019 3:47:23 pm
 * @copyright Copyright (c) 2020
 * @author gem <gems.xu@gmail.com>
 */
/**
 * @description provide global scope.
 */
let global;
// see https://stackoverflow.com/a/11237259/589493
if (typeof window === 'undefined') {
	/* eslint-disable-next-line no-undef */
	global = self;
} else {
	global = window;
}
var global$1 = global;
/**
 * @file: logger.js, created at Monday, 23rd December 2019 3:47:23 pm
 * @copyright Copyright (c) 2020
 * @author gem <gems.xu@gmail.com>
 */
let console$1 = global$1.console;
const isWorker =
	typeof WorkerGlobalScope !== 'undefined' &&
	// eslint-disable-next-line no-undef
	self instanceof WorkerGlobalScope &&
	typeof importScripts != 'undefined';
const prefix = '>>>';
class Logger extends EventEmitter {
	constructor() {
		super();
		this._enable = false;
	}
	get enable() {
		return this._enable;
	}
	set enable(value) {
		this._enable = value;
		this.MSG_NAME = '__log__';
	}
	log(...restArgs) {
		if (isWorker) {
			logger.emit(this.MSG_NAME, 'log', [...restArgs].join(''));
		} else {
			if (this._enable) {
				console$1.log.call(console$1, prefix, ...restArgs);
			}
		}
	}
	debug(...restArgs) {
		if (isWorker) {
			logger.emit(this.MSG_NAME, 'debug', [...restArgs].join(''));
		} else {
			if (this._enable && console$1.debug) {
				console$1.debug.call(console$1, prefix, ...restArgs);
			}
		}
	}
	assert(...restArgs) {
		if (this._enable && console$1.assert) {
			let condition = restArgs[0];
			let sliceArgs = Array.prototype.slice.call(restArgs, 1);
			sliceArgs.unshift(prefix);
			console$1.assert.call(console$1, condition, ...sliceArgs);
		}
	}
	warn(...restArgs) {
		if (isWorker) {
			logger.emit(this.MSG_NAME, 'warn', [...restArgs].join(''));
		} else {
			if (this._enable) {
				console$1.warn.call(console$1, prefix, ...restArgs);
			}
		}
	}
	error(...restArgs) {
		if (isWorker) {
			logger.emit(this.MSG_NAME, 'error', [...restArgs].join(''));
		} else {
			if (this._enable) {
				console$1.error.call(console$1, prefix, ...restArgs);
			}
		}
	}
}
let logger = new Logger();
/**
 * @file: stream.js, created at Monday, 23rd December 2019 3:47:23 pm
 * @copyright Copyright (c) 2020
 * @author gem <gems.xu@gmail.com>
 */
class Stream extends EventEmitter {
	constructor() {
		super();
	}
	/**
	 * connect to the next pipeline stream.
	 * @param destination
	 */
	pipe(destination) {
		this.on('reset', function () {
			destination.reset();
		});
		this.on('data', function (data) {
			destination.push(data);
		});
		this.on('done', function (flushSource) {
			destination.flush(flushSource);
		});
		return destination;
	}
	/**
	 * detaches the next pipeline stream previously attached.
	 */
	unpipe() {
		this.removeAllListeners('reset');
		this.removeAllListeners('data');
		this.removeAllListeners('done');
		return this;
	}
	/**
	 * push data to current pipeline.
	 * @param data
	 * @param conf
	 */
	// eslint-disable-next-line no-unused-vars
	push(data, conf) {
		this.emit('data', data);
	}
	/**
	 * flush current pipeline.
	 * @param flushSource
	 */
	flush(flushSource) {
		this.emit('done', flushSource);
	}
	reset() {
		this.emit('reset');
	}
}
/**
 * @file: demuxer.js, created at Monday, 23rd December 2019 3:47:23 pm
 * @copyright Copyright (c) 2020
 * @author gem <gems.xu@gmail.com>
 */
class DemuxFacade extends Stream {
	constructor(options = {}) {
		super();
		if (options.debug) {
			logger.enable = true;
		}
		this.ctx_ = new Context();
		this.options_ = options;
		this.cache_buffer_ = new CacheBuffer();
	}
	listenEndStream_() {
		this.eventManager_ = new EventManager();
		this.eventManager_
			.on(this.endStream, 'data', (data) => {
				this.emit(Events.DEMUX_DATA, data);
			})
			.on(this.endStream, 'parse', (data) => {
				this.emit(Events.PARSE, data);
			})
			.on(this.endStream, 'done', (data) => {
				this.emit(Events.DONE, data);
			})
			.on(this.ctx_, 'error', (data) => {
				this.emit(Events.ERROR, data);
			});
	}
	/**
	 * transfer data to Uint8Array
	 * @param buf
	 */
	constraintPushData_(buf) {
		let newBuf = null;
		if (!isArrayBuffer(buf) && !isUint8Array(buf)) {
			logger.error(`Data pushed is not an ArrayBuffer or Uint8Array: ${buf}`);
			return newBuf;
		}
		if (isArrayBuffer(buf)) {
			newBuf = new Uint8Array(buf);
		} else {
			newBuf = buf;
		}
		return newBuf;
	}
	reset() {}
	destroy() {
		this.unpipe();
		this.endStream.unpipe();
		this.eventManager_.removeAll();
	}
}
/**
 * @file: mp4-inspector.js, created at Monday, 23rd December 2019 3:47:23 pm
 * @copyright Copyright (c) 2020
 * @author gem <gems.xu@gmail.com>
 */
/* eslint-disable */
 let /**
      * Returns the string representation of an ASCII encoded four byte buffer.
      * @param buffer - a four-byte buffer to translate
      * @return the corresponding string
      */ parseType = function (buffer) {
     let result = '';
     result += String.fromCharCode(buffer[0]);
     result += String.fromCharCode(buffer[1]);
     result += String.fromCharCode(buffer[2]);
     result += String.fromCharCode(buffer[3]);
     return result;
 }, parseMp4Date = function (seconds) {
     return new Date(seconds * 1000 - 2082844800000);
 }, parseSampleFlags = function (flags) {
     return {
         isLeading: (flags[0] & 0x0c) >>> 2,
         dependsOn: flags[0] & 0x03,
         isDependedOn: (flags[1] & 0xc0) >>> 6,
         hasRedundancy: (flags[1] & 0x30) >>> 4,
         paddingValue: (flags[1] & 0x0e) >>> 1,
         isNonSyncSample: flags[1] & 0x01,
         degradationPriority: (flags[2] << 8) | flags[3]
     };
 }, // registry of handlers for individual mp4 box types
 parse = {
     // codingname, not a first-class box type. stsd entries share the
     // same format as real boxes so the parsing infrastructure can be
     // shared
     avc1: function (data) {
         let view = new DataView(data.buffer, data.byteOffset, data.byteLength);
         return {
             dataReferenceIndex: view.getUint16(6),
             width: view.getUint16(24),
             height: view.getUint16(26),
             horizresolution: view.getUint16(28) + view.getUint16(30) / 16,
             vertresolution: view.getUint16(32) + view.getUint16(34) / 16,
             frameCount: view.getUint16(40),
             depth: view.getUint16(74),
             config: mp4toJSON.call(this, data.subarray(78, data.byteLength))
         };
     },
     avcC: function (data) {
         let view = new DataView(data.buffer, data.byteOffset, data.byteLength), result = {
             configurationVersion: data[0],
             avcProfileIndication: data[1],
             profileCompatibility: data[2],
             avcLevelIndication: data[3],
             lengthSizeMinusOne: data[4] & 0x03,
             sps: [],
             pps: [],
             data,
         }, numOfSequenceParameterSets = data[5] & 0x1f, numOfPictureParameterSets, nalSize, offset, i;
         // iterate past any SPSs
         offset = 6;
         for (i = 0; i < numOfSequenceParameterSets; i++) {
             nalSize = view.getUint16(offset);
             offset += 2;
             result.sps.push(new Uint8Array(data.subarray(offset, offset + nalSize)));
             offset += nalSize;
         }
         // iterate past any PPSs
         numOfPictureParameterSets = data[offset];
         offset++;
         for (i = 0; i < numOfPictureParameterSets; i++) {
             nalSize = view.getUint16(offset);
             offset += 2;
             result.pps.push(new Uint8Array(data.subarray(offset, offset + nalSize)));
             offset += nalSize;
         }
         return result;
     },
     av01: function (data) {
        let view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        return {
            dataReferenceIndex: view.getUint16(6),
            width: view.getUint16(24),
            height: view.getUint16(26),
            horizresolution: view.getUint16(28) + view.getUint16(30) / 16,
            vertresolution: view.getUint16(32) + view.getUint16(34) / 16,
            frameCount: view.getUint16(40),
            depth: view.getUint16(74),
            config: mp4toJSON.call(this, data.subarray(78, data.byteLength))
        };
     },
     av1C: function (data) {
        return {
            marker: data[0] >> 7,
            version: data[0] & 0x7f,
            seqProfile: data[1] >> 5,
            seqLevelIdx0: data[1] & 0x1f,
            seqTier0: data[2] >> 7,
            highBitdepth: (data[2] >> 6) & 0x01,
            twelveBit: (data[2] >> 5) & 0x01,
            monochrome: (data[2] >> 4) & 0x01,
            chromaSubsamplingX: (data[2] >> 3) & 0x01,
            chromaSubsamplingY: (data[2] >> 2) & 0x01,
            chromaSubsampePosition: data[2] & 0x03,
            configOBUs: new Uint8Array(data.subarray(4, data.byteLength)),
        }
     },
     btrt: function (data) {
         let view = new DataView(data.buffer, data.byteOffset, data.byteLength);
         return {
             bufferSizeDB: view.getUint32(0),
             maxBitrate: view.getUint32(4),
             avgBitrate: view.getUint32(8)
         };
     },
     esds: function (data) {
         let view = new DataView(data.buffer, data.byteOffset, data.byteLength);
         return {
             version: data[0],
             flags: new Uint8Array(data.subarray(1, 4)),
             esId: (data[6] << 8) | data[7],
             streamPriority: data[8] & 0x1f,
             decoderConfig: {
                 objectProfileIndication: data[11],
                 streamType: (data[12] >>> 2) & 0x3f,
                 bufferSize: (data[13] << 16) | (data[14] << 8) | data[15],
                 maxBitrate: (data[16] << 24) | (data[17] << 16) | (data[18] << 8) | data[19],
                 avgBitrate: (data[20] << 24) | (data[21] << 16) | (data[22] << 8) | data[23],
                 decoderConfigDescriptor: {
                     tag: data[24],
                     length: data[25],
                     // audioObjectType: (data[26] >>> 3) & 0x1f,
                     // samplingFrequencyIndex: ((data[26] & 0x07) << 1) |
                     //   ((data[27] >>> 7) & 0x01),
                     // channelConfiguration: (data[27] >>> 3) & 0x0f,
                     // FIXME
                     audioObjectType: (data[35] >>> 3) & 0x1f,
                     samplingFrequencyIndex: ((data[35] & 0x07) << (8 + (data[36] & 0x80))) >> 7,
                     channelConfiguration: (data[36] & 0x78) >> 3
                 }
             }
         };
     },
     ftyp: function (data) {
         let view = new DataView(data.buffer, data.byteOffset, data.byteLength), result = {
             majorBrand: parseType(data.subarray(0, 4)),
             minorVersion: view.getUint32(4),
             compatibleBrands: []
         }, i = 8;
         while (i < data.byteLength) {
             result.compatibleBrands.push(parseType(data.subarray(i, i + 4)));
             i += 4;
         }
         return result;
     },
     dinf: function (data) {
         return {
             boxes: mp4toJSON.call(this, data)
         };
     },
     dref: function (data) {
         return {
             version: data[0],
             flags: new Uint8Array(data.subarray(1, 4)),
             dataReferences: mp4toJSON.call(this, data.subarray(8))
         };
     },
     hdlr: function (data) {
         let view = new DataView(data.buffer, data.byteOffset, data.byteLength), result = {
             version: view.getUint8(0),
             flags: new Uint8Array(data.subarray(1, 4)),
             handlerType: parseType(data.subarray(8, 12)),
             name: ''
         }, i = 8;
         // parse out the name field
         for (i = 24; i < data.byteLength; i++) {
             if (data[i] === 0x00) {
                 // the name field is null-terminated
                 i++;
                 break;
             }
             result.name += String.fromCharCode(data[i]);
         }
         // decode UTF-8 to javascript's internal representation
         // see http://ecmanaut.blogspot.com/2006/07/encoding-decoding-utf8-in-javascript.html
         result.name = decodeURIComponent(decodeURIComponent(result.name));
         return result;
     },
     // mdat: function(data) {
     // 	return {
     // 		byteLength: data.byteLength,
     // 		nals: nalParse(data),
     // 		realData: data
     // 	};
     // },
     mdhd: function (data) {
         let view = new DataView(data.buffer, data.byteOffset, data.byteLength), i = 4, language, result = {
             version: view.getUint8(0),
             flags: new Uint8Array(data.subarray(1, 4)),
             language: '',
             creationTime: new Date(),
             modificationTime: new Date(),
             timescale: 0,
             duration: 0
         };
         if (result.version === 1) {
             i += 4;
             result.creationTime = parseMp4Date(view.getUint32(i)); // truncating top 4 bytes
             i += 8;
             result.modificationTime = parseMp4Date(view.getUint32(i)); // truncating top 4 bytes
             i += 4;
             result.timescale = view.getUint32(i);
             i += 8;
             result.duration = view.getUint32(i); // truncating top 4 bytes
         }
         else {
             result.creationTime = parseMp4Date(view.getUint32(i));
             i += 4;
             result.modificationTime = parseMp4Date(view.getUint32(i));
             i += 4;
             result.timescale = view.getUint32(i);
             i += 4;
             result.duration = view.getUint32(i);
         }
         i += 4;
         // language is stored as an ISO-639-2/T code in an array of three 5-bit fields
         // each field is the packed difference between its ASCII value and 0x60
         language = view.getUint16(i);
         result.language += String.fromCharCode((language >> 10) + 0x60);
         result.language += String.fromCharCode(((language & 0x03c0) >> 5) + 0x60);
         result.language += String.fromCharCode((language & 0x1f) + 0x60);
         return result;
     },
     mdia: function (data) {
         return {
             boxes: mp4toJSON.call(this, data)
         };
     },
     mfhd: function (data) {
         return {
             version: data[0],
             flags: new Uint8Array(data.subarray(1, 4)),
             sequenceNumber: (data[4] << 24) | (data[5] << 16) | (data[6] << 8) | data[7]
         };
     },
     minf: function (data) {
         return {
             boxes: mp4toJSON.call(this, data)
         };
     },
     // codingname, not a first-class box type. stsd entries share the
     // same format as real boxes so the parsing infrastructure can be
     // shared
     mp4a: function (data) {
         let view = new DataView(data.buffer, data.byteOffset, data.byteLength), result = {
             // 6 bytes reserved
             dataReferenceIndex: view.getUint16(6),
             // 4 + 4 bytes reserved
             channelcount: view.getUint16(16),
             samplesize: view.getUint16(18),
             // 2 bytes pre_defined
             // 2 bytes reserved
             samplerate: view.getUint16(24) + view.getUint16(26) / 65536,
             streamDescriptor: undefined
         };
         // if there are more bytes to process, assume this is an ISO/IEC
         // 14496-14 MP4AudioSampleEntry and parse the ESDBox
         if (data.byteLength > 28) {
             result.streamDescriptor = mp4toJSON.call(this, data.subarray(28))[0];
         }
         return result;
     },
     moof: function (data) {
         return {
             boxes: mp4toJSON.call(this, data)
         };
     },
     moov: function (data) {
         return {
             boxes: mp4toJSON.call(this, data)
         };
     },
     mvex: function (data) {
         return {
             boxes: mp4toJSON.call(this, data)
         };
     },
     mvhd: function (data) {
         let view = new DataView(data.buffer, data.byteOffset, data.byteLength), i = 4, result = {
             version: view.getUint8(0),
             flags: new Uint8Array(data.subarray(1, 4)),
             creationTime: new Date(),
             modificationTime: new Date(),
             timescale: 0,
             duration: 0,
             rate: 0,
             volume: 0,
             matrix: new Uint32Array(0),
             nextTrackId: 0
         };
         if (result.version === 1) {
             i += 4;
             result.creationTime = parseMp4Date(view.getUint32(i)); // truncating top 4 bytes
             i += 8;
             result.modificationTime = parseMp4Date(view.getUint32(i)); // truncating top 4 bytes
             i += 4;
             result.timescale = view.getUint32(i);
             i += 8;
             result.duration = view.getUint32(i); // truncating top 4 bytes
         }
         else {
             result.creationTime = parseMp4Date(view.getUint32(i));
             i += 4;
             result.modificationTime = parseMp4Date(view.getUint32(i));
             i += 4;
             result.timescale = view.getUint32(i);
             i += 4;
             result.duration = view.getUint32(i);
         }
         i += 4;
         // convert fixed-point, base 16 back to a number
         result.rate = view.getUint16(i) + view.getUint16(i + 2) / 16;
         i += 4;
         result.volume = view.getUint8(i) + view.getUint8(i + 1) / 8;
         i += 2;
         i += 2;
         i += 2 * 4;
         result.matrix = new Uint32Array(data.subarray(i, i + 9 * 4));
         i += 9 * 4;
         i += 6 * 4;
         result.nextTrackId = view.getUint32(i);
         return result;
     },
     pdin: function (data) {
         let view = new DataView(data.buffer, data.byteOffset, data.byteLength);
         return {
             version: view.getUint8(0),
             flags: new Uint8Array(data.subarray(1, 4)),
             rate: view.getUint32(4),
             initialDelay: view.getUint32(8)
         };
     },
     sdtp: function (data) {
         let result = {
             version: data[0],
             flags: new Uint8Array(data.subarray(1, 4)),
             samples: []
         }, i;
         for (i = 4; i < data.byteLength; i++) {
             result.samples.push({
                 dependsOn: (data[i] & 0x30) >> 4,
                 isDependedOn: (data[i] & 0x0c) >> 2,
                 hasRedundancy: data[i] & 0x03
             });
         }
         return result;
     },
     sidx: function (data) {
         let view = new DataView(data.buffer, data.byteOffset, data.byteLength), result = {
             version: data[0],
             flags: new Uint8Array(data.subarray(1, 4)),
             references: [],
             referenceId: view.getUint32(4),
             timescale: view.getUint32(8),
             earliestPresentationTime: view.getUint32(12),
             firstOffset: view.getUint32(16)
         }, referenceCount = view.getUint16(22), i;
         for (i = 24; referenceCount; i += 12, referenceCount--) {
             result.references.push({
                 referenceType: (data[i] & 0x80) >>> 7,
                 referencedSize: view.getUint32(i) & 0x7fffffff,
                 subsegmentDuration: view.getUint32(i + 4),
                 startsWithSap: !!(data[i + 8] & 0x80),
                 sapType: (data[i + 8] & 0x70) >>> 4,
                 sapDeltaTime: view.getUint32(i + 8) & 0x0fffffff
             });
         }
         return result;
     },
     stbl: function (data) {
         return {
             boxes: mp4toJSON.call(this, data)
         };
     },
     stco: function (data) {
         let view = new DataView(data.buffer, data.byteOffset, data.byteLength);
         let entryCount = view.getUint32(4);
         let result = {
             version: data[0],
             flags: new Uint8Array(data.subarray(1, 4)),
             entryCount: entryCount,
             chunkOffsets: []
         };
         for (let i = 8; entryCount; i += 4, entryCount--) {
             result.chunkOffsets.push(view.getUint32(i));
         }
         return result;
     },
     stsc: function (data) {
         let view = new DataView(data.buffer, data.byteOffset, data.byteLength), entryCount = view.getUint32(4), result = {
             version: data[0],
             flags: new Uint8Array(data.subarray(1, 4)),
             sampleToChunks: []
         }, i;
         for (i = 8; entryCount; i += 12, entryCount--) {
             result.sampleToChunks.push({
                 firstChunk: view.getUint32(i),
                 samplesPerChunk: view.getUint32(i + 4),
                 sampleDescriptionIndex: view.getUint32(i + 8)
             });
         }
         return result;
     },
     stsd: function (data) {
         return {
             version: data[0],
             flags: new Uint8Array(data.subarray(1, 4)),
             boxes: mp4toJSON.call(this, data.subarray(8))
         };
     },
     stss: function (data) {
        let view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        let result = {
            version: data[0],
            flags: new Uint8Array(data.subarray(1, 4)),
            entryCount: view.getUint32(4),
            sampleNumbers: [],
        };
        for (let i = 0; i < result.entryCount; i++) {
            result.sampleNumbers.push(view.getUint32(8 + i * 4));
        }
        return result;
     },
     stsz: function (data) {
         let view = new DataView(data.buffer, data.byteOffset, data.byteLength), result = {
             version: data[0],
             flags: new Uint8Array(data.subarray(1, 4)),
             sampleSize: view.getUint32(4),
             entries: []
         }, i;
         for (i = 12; i < data.byteLength; i += 4) {
             result.entries.push(view.getUint32(i));
         }
         return result;
     },
     stts: function (data) {
         let view = new DataView(data.buffer, data.byteOffset, data.byteLength), result = {
             version: data[0],
             flags: new Uint8Array(data.subarray(1, 4)),
             timeToSamples: []
         }, entryCount = view.getUint32(4), i;
         for (i = 8; entryCount; i += 8, entryCount--) {
             result.timeToSamples.push({
                 sampleCount: view.getUint32(i),
                 sampleDelta: view.getUint32(i + 4)
             });
         }
         return result;
     },
     styp: function (data) {
         return parse.ftyp.call(this, data);
     },
     tfdt: function (data) {
        let view = new DataView(data.buffer, data.byteOffset, data.byteLength)
        var result = {
            version: data[0],
            flags: new Uint8Array(data.subarray(1, 4)),
        };
        if (result.version === 1) {
            result.baseMediaDecodeTime = view.getBigUint64(4);
        } else {
            result.baseMediaDecodeTime = (data[4] << 24 | data[5] << 16 | data[6] << 8 | data[7]) >>> 0
        }
        return result;
     },
     tfhd: function (data) {
         let view = new DataView(data.buffer, data.byteOffset, data.byteLength), result = {
             version: data[0],
             flags: new Uint8Array(data.subarray(1, 4)),
             trackId: view.getUint32(4)
         }, baseDataOffsetPresent = result.flags[2] & 0x01, sampleDescriptionIndexPresent = result.flags[2] & 0x02, defaultSampleDurationPresent = result.flags[2] & 0x08, defaultSampleSizePresent = result.flags[2] & 0x10, defaultSampleFlagsPresent = result.flags[2] & 0x20, i;
         i = 8;
         if (baseDataOffsetPresent) {
             i += 4; // truncate top 4 bytes
             result.baseDataOffset = view.getUint32(12);
             i += 4;
         }
         if (sampleDescriptionIndexPresent) {
             result.sampleDescriptionIndex = view.getUint32(i);
             i += 4;
         }
         if (defaultSampleDurationPresent) {
             result.defaultSampleDuration = view.getUint32(i);
             i += 4;
         }
         if (defaultSampleSizePresent) {
             result.defaultSampleSize = view.getUint32(i);
             i += 4;
         }
         if (defaultSampleFlagsPresent) {
             result.defaultSampleFlags = view.getUint32(i);
         }
         return result;
     },
     tkhd: function (data) {
         let view = new DataView(data.buffer, data.byteOffset, data.byteLength), i = 4, result = {
             version: view.getUint8(0),
             flags: new Uint8Array(data.subarray(1, 4)),
             creationTime: new Date(),
             modificationTime: new Date(),
             trackId: 0,
             duration: 0,
             layer: 0,
             alternateGroup: 0,
             volume: 0,
             width: 0,
             height: 0,
             matrix: new Uint32Array(0)
         };
         if (result.version === 1) {
             i += 4;
             result.creationTime = parseMp4Date(view.getUint32(i)); // truncating top 4 bytes
             i += 8;
             result.modificationTime = parseMp4Date(view.getUint32(i)); // truncating top 4 bytes
             i += 4;
             result.trackId = view.getUint32(i);
             i += 4;
             i += 8;
             result.duration = view.getUint32(i); // truncating top 4 bytes
         }
         else {
             result.creationTime = parseMp4Date(view.getUint32(i));
             i += 4;
             result.modificationTime = parseMp4Date(view.getUint32(i));
             i += 4;
             result.trackId = view.getUint32(i);
             i += 4;
             i += 4;
             result.duration = view.getUint32(i);
         }
         i += 4;
         i += 2 * 4;
         result.layer = view.getUint16(i);
         i += 2;
         result.alternateGroup = view.getUint16(i);
         i += 2;
         // convert fixed-point, base 16 back to a number
         result.volume = view.getUint8(i) + view.getUint8(i + 1) / 8;
         i += 2;
         i += 2;
         result.matrix = new Uint32Array(data.subarray(i, i + 9 * 4));
         i += 9 * 4;
         result.width = view.getUint16(i) + view.getUint16(i + 2) / 16;
         i += 4;
         result.height = view.getUint16(i) + view.getUint16(i + 2) / 16;
         return result;
     },
     traf: function (data) {
         return {
             boxes: mp4toJSON.call(this, data)
         };
     },
     trak: function (data) {
         return {
             boxes: mp4toJSON.call(this, data)
         };
     },
     trex: function (data) {
         let view = new DataView(data.buffer, data.byteOffset, data.byteLength);
         return {
             version: data[0],
             flags: new Uint8Array(data.subarray(1, 4)),
             trackId: view.getUint32(4),
             defaultSampleDescriptionIndex: view.getUint32(8),
             defaultSampleDuration: view.getUint32(12),
             defaultSampleSize: view.getUint32(16),
             sampleDependsOn: data[20] & 0x03,
             sampleIsDependedOn: (data[21] & 0xc0) >> 6,
             sampleHasRedundancy: (data[21] & 0x30) >> 4,
             samplePaddingValue: (data[21] & 0x0e) >> 1,
             sampleIsDifferenceSample: !!(data[21] & 0x01),
             sampleDegradationPriority: view.getUint16(22)
         };
     },
     trun: function (data) {
         let result = {
             version: data[0],
             flags: new Uint8Array(data.subarray(1, 4)),
             samples: [],
         }, view = new DataView(data.buffer, data.byteOffset, data.byteLength), dataOffsetPresent = result.flags[2] & 0x01, firstSampleFlagsPresent = result.flags[2] & 0x04, sampleDurationPresent = result.flags[1] & 0x01, sampleSizePresent = result.flags[1] & 0x02, sampleFlagsPresent = result.flags[1] & 0x04, sampleCompositionTimeOffsetPresent = result.flags[1] & 0x08, sampleCount = view.getUint32(4), offset = 8, sample;
         if (dataOffsetPresent) {
             result.dataOffset = view.getUint32(offset);
             offset += 4;
         }
         if (firstSampleFlagsPresent && sampleCount) {
             sample = {
                 flags: parseSampleFlags(data.subarray(offset, offset + 4))
             };
             offset += 4;
             if (sampleDurationPresent) {
                 sample.duration = view.getUint32(offset);
                 offset += 4;
             }
             if (sampleSizePresent) {
                 sample.size = view.getUint32(offset);
                 offset += 4;
             }
             if (sampleCompositionTimeOffsetPresent) {
                 sample.compositionTimeOffset = view.getUint32(offset);
                 offset += 4;
             }
             result.samples.push(sample);
             sampleCount--;
         }
         while (sampleCount--) {
             sample = {};
             if (sampleDurationPresent) {
                 sample.duration = view.getUint32(offset);
                 offset += 4;
             }
             if (sampleSizePresent) {
                 sample.size = view.getUint32(offset);
                 offset += 4;
             }
             if (sampleFlagsPresent) {
                 sample.flags = parseSampleFlags(data.subarray(offset, offset + 4));
                 offset += 4;
             }
             if (sampleCompositionTimeOffsetPresent) {
                 sample.compositionTimeOffset = view.getUint32(offset);
                 offset += 4;
             }
             result.samples.push(sample);
         }
         return result;
     },
     'url ': function (data) {
         return {
             version: data[0],
             flags: new Uint8Array(data.subarray(1, 4))
         };
     },
     vmhd: function (data) {
         //let view = new DataView(data.buffer, data.byteOffset, data.byteLength);
         return {
             version: data[0],
             flags: new Uint8Array(data.subarray(1, 4))
             //graphicsmode: view.getUint16(4),
             //opcolor: new Uint16Array([view.getUint16(6),
             //                          view.getUint16(8),
             //                          view.getUint16(10)])
         };
     }
 };
 /**
  * Return a javascript array of box objects parsed from an ISO base media file.
  * @param data - the binary data of the media to be inspected
  * @return a javascript array of potentially nested box objects
  */
 let mp4toJSON = function (data) {
     let i = 0, result = [], view = new DataView(data.buffer, data.byteOffset, data.byteLength), size, type, end, box;
     while (i < data.byteLength) {
         // parse box data
         (size = view.getUint32(i)), (type = parseType(data.subarray(i + 4, i + 8)));
         end = size > 1 ? i + size : data.byteLength;
         // parse type-specific data
         box = (parse[type] ||
             function (data) {
                 return {
                     data: data
                 };
             }).call(this, data.subarray(i + 8, end));
         box.size = size;
         box.type = type;
         // store this box and move to the next
         result.push(box);
         box.raw = data;
         this.emit('parse', box);
         i = end;
     }
     return result;
 };
 const MP4Inspect = {
     mp4toJSON: mp4toJSON
 };
 /**
  * @file: demux.js, created at Monday, 23rd December 2019 3:47:23 pm
  * @copyright Copyright (c) 2020
  * @author gem <gems.xu@gmail.com>
  */
 /**
  * mp4.
  */
 class MP4Demux extends DemuxFacade {
     constructor(options = {}) {
         super(options);
         super.listenEndStream_();
     }
     /**
      * This is end pipeline stream
      */
     get endStream() {
         return this;
     }
     /**
      * The MP4 data pushed into stream should be complete data.
      * @param buffer
      */
     push(buffer) {
         let newBuf = super.constraintPushData_(buffer);
         logger.log(`mp4 demux received ${newBuf.byteLength} bytes`);
         let result = MP4Inspect.mp4toJSON.call(this, newBuf);
         this.emit('data', result);
     }
 }
 export { Events, MP4Demux, parse as ParseBox, parseType };
