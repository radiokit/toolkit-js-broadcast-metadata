"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var phoenix_1 = require("phoenix");
var State;
(function (State) {
    State[State["Stopped"] = 1] = "Stopped";
    State[State["Stopping"] = 2] = "Stopping";
    State[State["Starting"] = 3] = "Starting";
    State[State["Started"] = 4] = "Started";
})(State = exports.State || (exports.State = {}));
var MetadataListener = (function () {
    function MetadataListener(accessToken, channelId) {
        this.__state = State.Stopped;
        this.__updateCallback = undefined;
        this.__positionCallback = undefined;
        this.__positionIntervalId = undefined;
        this.__positionInterval = 1000;
        if (typeof (accessToken) !== 'string' && typeof (accessToken) !== 'function') {
            throw new TypeError('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Passed access token is neither a string nor a function');
        }
        if (typeof (channelId) !== 'string') {
            throw new TypeError('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Passed channel ID is not a string');
        }
        this.__channelId = channelId;
        this.__accessToken = accessToken;
    }
    MetadataListener.prototype.start = function () {
        var _this = this;
        if (this.__state === State.Stopped) {
            this.__state = State.Starting;
            return new Promise(function (resolve, reject) {
                console.debug('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Starting');
                _this.__connect();
                _this.__subscribe()
                    .then(function (metadataListener) {
                    _this.__state = State.Started;
                    resolve(metadataListener);
                })
                    .catch(function (reason) {
                    _this.__state = State.Stopped;
                    reject(reason);
                });
            });
        }
        else {
            throw new Error('Attempt to start while not stopped');
        }
    };
    MetadataListener.prototype.stop = function () {
        var _this = this;
        if (this.__state === State.Started) {
            this.__state = State.Stopping;
            return new Promise(function (resolve, reject) {
                console.debug('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Stopping');
                _this.__clearPositionInterval();
                _this.__unsubscribe();
                _this.__disconnect();
                _this.__state = State.Stopped;
                resolve(_this);
            });
        }
        else {
            throw new Error('Attempt to stop when not started');
        }
    };
    MetadataListener.prototype.getState = function () {
        return this.__state;
    };
    MetadataListener.prototype.setUpdateCallback = function (callback) {
        if (typeof (callback) !== 'undefined' && typeof (callback) !== 'function') {
            throw new TypeError('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Passed updated callback is neither an undefined nor a function');
        }
        this.__updateCallback = callback;
        return this;
    };
    MetadataListener.prototype.getUpdateCallback = function () {
        return this.__updateCallback;
    };
    MetadataListener.prototype.setPositionCallback = function (callback) {
        if (typeof (callback) !== 'undefined' && typeof (callback) !== 'function') {
            throw new TypeError('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Passed position callback is neither an undefined nor a function');
        }
        if (callback === undefined) {
            this.__clearPositionInterval();
        }
        this.__positionCallback = callback;
        return this;
    };
    MetadataListener.prototype.getPositionCallback = function () {
        return this.__positionCallback;
    };
    MetadataListener.prototype.setPositionInterval = function (interval) {
        if (typeof (interval) !== 'number') {
            throw new TypeError('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Passed position interval not a number');
        }
        if (interval <= 0) {
            throw new RangeError('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Passed position interval must be a positive integer');
        }
        this.__positionInterval = interval;
        return this;
    };
    MetadataListener.prototype.getPositionInterval = function () {
        return this.__positionInterval;
    };
    MetadataListener.prototype.__connect = function () {
        var accessToken;
        if (typeof (this.__accessToken) == 'function') {
            accessToken = this.__accessToken();
            if (typeof (accessToken) !== 'string') {
                throw new TypeError('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Access Token function returned non-string');
            }
        }
        else if (typeof (this.__accessToken) == 'string') {
            accessToken = this.__accessToken;
        }
        this.__socket = new phoenix_1.Socket('wss://agenda.radiokitapp.org/api/stream/v1.0', { params: { accessToken: accessToken } });
        this.__socket.onError(function () {
            return console.warn('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Socket error');
        });
        this.__socket.onClose(function () {
            return console.warn('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Socket closed');
        });
        this.__socket.connect();
    };
    MetadataListener.prototype.__disconnect = function () {
        this.__socket.disconnect();
        this.__socket = undefined;
    };
    MetadataListener.prototype.__subscribe = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            _this.__channel = _this.__socket.channel("broadcast:metadata:" + _this.__channelId);
            _this.__channel.on('update', function (payload) {
                console.debug('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Update', payload);
                if (_this.__updateCallback) {
                    _this.__updateCallback(payload['metadata']);
                    _this.__resetPositionInterval(payload['metadata']['duration'], payload['updated_at']);
                }
            });
            _this.__channel.join()
                .receive('ok', function (_a) {
                var messages = _a.messages;
                console.debug('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Subscribed to the metadata channel', messages);
                resolve(_this);
            })
                .receive('error', function (_a) {
                var reason = _a.reason;
                console.warn('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Failed to subscribe to the metadata channel', reason);
                reject(reason);
            })
                .receive('timeout', function () {
                console.warn('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Failed to subscribe to the metadata channel: timeout');
                reject('timeout');
            });
        });
    };
    MetadataListener.prototype.__unsubscribe = function () {
        this.__channel.leave();
        this.__channel = undefined;
    };
    MetadataListener.prototype.__resetPositionInterval = function (duration, updated_at) {
        var _this = this;
        this.__clearPositionInterval();
        if (this.__positionCallback && duration && typeof (duration) === 'number') {
            console.debug('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Setting position interval');
            this.__positionIntervalId = setInterval(function () {
                var position = new Date().valueOf() - new Date(updated_at).valueOf();
                if (position > duration) {
                    console.debug('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Position > Duration', position, duration);
                    _this.__clearPositionInterval();
                }
                else {
                    _this.__positionCallback(position, duration);
                }
            }, this.__positionInterval);
        }
    };
    MetadataListener.prototype.__clearPositionInterval = function () {
        if (this.__positionIntervalId) {
            console.debug('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Clearing position interval');
            clearInterval(this.__positionIntervalId);
            this.__positionIntervalId = undefined;
        }
    };
    return MetadataListener;
}());
exports.MetadataListener = MetadataListener;
