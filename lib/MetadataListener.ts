import { Socket, Channel } from 'phoenix';

/**
 * Type defining metadata map received while listening.
 * 
 * It's either null or object where keys are always strings but values
 * can be of any type.
 *
 * Meaning and exact structure of metadata map is not defined. If the 
 * channel is playing files from the RadioKit Depot library, it will 
 * contain all metadata assigned to the file which may differ from 
 * radio to radio. If metadata was manually set by the channel's
 * editor, it will hold key/value pairs set by the editor. Please refer
 * to the particular channel's convention to understand how to interpret
 * this properly.
 */
export type MetadataMap = { [key: string]: any } | null;


/**
 * Callback function called when metadata is updated.
 * 
 * If it was a null it means that metadata was reset, e.g. because 
 * source with unknown metadata started to play.
 *
 * It does not have to return anything.  
 *
 * @param metadata_map new metadata or null.
 */
export type UpdateCallbackFunction = (metadata_map: MetadataMap) => void;


/**
 * Callback function called when estimated track position has changed.
 *
 * It does not have to return anything.  
 *
 * @param position current track position in milliseconds
 * @param duration total track duration in milliseconds
 */
export type PositionCallbackFunction = (position: number, duration: number) => void;


/**
 * Function called when listener needs to determine current access token.
 *
 * It has no arguments.
 *
 * It has to return a string with current access token.  
 */
export type AccessTokenFunction = () => string;


/**
 * Enum representing listener state.
 */
export enum State {
  Stopped = 1,
  Stopping,
  Starting,
  Started,
}


/**
 * Listener that is passively receiving information about changes
 * to current metadata of the given broadcast channel.
 *
 * You can use it to implement "what's on air" functionality.
 */ 
export class MetadataListener {
  private __channelId: string;
  private __accessToken: string | AccessTokenFunction;
  private __socket: Socket;
  private __channel: Channel;
  private __state: State = State.Stopped;
  private __updateCallback: UpdateCallbackFunction | undefined = undefined;
  private __positionCallback: PositionCallbackFunction | undefined = undefined;
  private __positionIntervalId: NodeJS.Timer | undefined = undefined; 
  private __positionInterval: number = 1000;

  /**
   * Constructs new MetadataListener.
   *
   * @throws TypeError in case of invalid type of arguments.
   * @param accessToken String containing access token or zero-arity function that will return it.
   * @param channelId String with unique channel identifier.
   */
  constructor(accessToken: string | AccessTokenFunction, channelId: string) {
    if(typeof(accessToken) !== 'string' && typeof(accessToken) !== 'function') {
      throw new TypeError('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Passed access token is neither a string nor a function');
    }

    if(typeof(channelId) !== 'string') {
      throw new TypeError('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Passed channel ID is not a string');
    }

    this.__channelId = channelId;
    this.__accessToken = accessToken;
  }


  /**
   * Starts listening to the metadata updates.
   *
   * It makes one attempt of connecting to the server that holds metadata
   * but does not retry in case of failure.
   * 
   * @throws Error if listener was already started or is starting.
   * @returns promise that will return this object on success or 
   *   string with reason on failure.
   */
  public start() : Promise<MetadataListener> {
    if(this.__state === State.Stopped) {
      this.__state = State.Starting;

      return new Promise<MetadataListener>((resolve: any, reject: any) => {
        console.debug('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Starting');
        this.__connect();
        this.__subscribe()
          .then((metadataListener) => {
            this.__state = State.Started;
            resolve(metadataListener);
          })
          .catch((reason) => {
            this.__state = State.Stopped;
            reject(reason);
          });
      });

    } else {
      throw new Error('Attempt to start while not stopped');
    }
  }


  /**
   * Stops listening to the metadata updates.
   * 
   * @throws Error if listener was not started.
   * @returns promise that will return this object on success or 
   *   string with reason on failure.
   */
  public stop() : Promise<MetadataListener> {
    if(this.__state === State.Started) {
      this.__state = State.Stopping;

      return new Promise<MetadataListener>((resolve: any, reject: any) => {
        console.debug('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Stopping');
        this.__clearPositionInterval();
        this.__unsubscribe();
        this.__disconnect();

        this.__state = State.Stopped;
        resolve(this);
      });

    } else {
      throw new Error('Attempt to stop when not started');
    }
  }


  /**
   * Checks current state of the listener.
   * 
   * @returns current state.
   */
  public getState() : State {
    return this.__state;
  }


  /**
   * Sets metadata update callback.
   *
   * Pass undefined as an argument to clear it.
   * 
   * @throws TypeError in case of invalid type of arguments.
   * @returns itself.
   */
  public setUpdateCallback(callback : UpdateCallbackFunction | undefined) : MetadataListener {
    if(typeof(callback) !== 'undefined' && typeof(callback) !== 'function') {
      throw new TypeError('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Passed updated callback is neither an undefined nor a function');
    }

    this.__updateCallback = callback;
    return this;
  }


  /**
   * Gets metadata update callback.
   * 
   * @returns currently set metadata update callback or undefined.
   */
  public getUpdateCallback() : UpdateCallbackFunction | undefined {
    return this.__updateCallback;
  }


  /**
   * Sets position update callback.
   *
   * It will be called back every interval that can be set via 
   * setPositionInterval (1 second by default) with position and duration of 
   * the track, but only if received metadata contains 'duration' key that 
   * holds an integer representing current track duration in milliseconds.
   *
   * If it will be set up after starting the listener, it will start working
   * from next received metadata. 
   *
   * Pass undefined as an argument to clear it.
   * 
   * @throws TypeError in case of invalid type of arguments.
   * @returns itself.
   */
  public setPositionCallback(callback : PositionCallbackFunction | undefined) : MetadataListener {
    if(typeof(callback) !== 'undefined' && typeof(callback) !== 'function') {
      throw new TypeError('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Passed position callback is neither an undefined nor a function');
    }

    if(callback === undefined) {
      this.__clearPositionInterval();
    }

    this.__positionCallback = callback;
    return this;
  }


  /**
   * Gets position update callback.
   * 
   * @returns currently set position update callback or undefined.
   */
  public getPositionCallback() : PositionCallbackFunction | undefined {
    return this.__positionCallback;
  }


  /**
   * Sets interval of position update callback (in milliseconds).
   *
   * If it will be set up after starting the listener, it will affect the
   * interval from next received metadata. 
   *
   * @throws TypeError in case of invalid type of arguments
   * @throws RangeError in case of interval <= 0
   * @returns itself.
   */
  public setPositionInterval(interval: number) : MetadataListener {
    if(typeof(interval) !== 'number') {
      throw new TypeError('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Passed position interval not a number');
    }

    if(interval <= 0) {
      throw new RangeError('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Passed position interval must be a positive integer');
    }

    this.__positionInterval = interval;
    return this;
  }


  /**
   * Gets interval of position update callback.
   * 
   * @returns currently set metadata update callback or undefined.
   */
  public getPositionInterval() : number {
    return this.__positionInterval;
  }


  private __connect() : void {
    let accessToken;
    if(typeof(this.__accessToken) == 'function') {
      accessToken = this.__accessToken();
      if(typeof(accessToken) !== 'string') {
        throw new TypeError('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Access Token function returned non-string');
      }
    } else if(typeof(this.__accessToken) == 'string') {
      accessToken = this.__accessToken;
    }

    this.__socket = new Socket('wss://agenda.radiokitapp.org/api/stream/v1.0', 
      {params: {accessToken: accessToken}});

    this.__socket.onError( () => 
      console.warn('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Socket error') );

    this.__socket.onClose( () => 
      console.warn('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Socket closed') );

    this.__socket.connect();
  }


  private __disconnect() : void {
    this.__socket.disconnect();
    this.__socket = undefined;
  }


  private __subscribe() : Promise<MetadataListener> {
    return new Promise<MetadataListener>((resolve: any, reject: any) => {
      this.__channel = this.__socket.channel(`broadcast:metadata:${this.__channelId}`);
      this.__channel.on('update', payload => {
        console.debug('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Update', payload);
        if(this.__updateCallback) {
          this.__updateCallback(payload['metadata']);

          this.__resetPositionInterval(payload['metadata']['duration'], payload['updated_at']);
        }
      })
      this.__channel.join()
        .receive('ok', ({messages}) => {
          console.debug('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Subscribed to the metadata channel', messages);
          resolve(this);
        })
        .receive('error', ({reason}) => {
          console.warn('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Failed to subscribe to the metadata channel', reason);
          reject(reason);
        })
        .receive('timeout', () => {
          console.warn('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Failed to subscribe to the metadata channel: timeout');
          reject('timeout');
        });
    });    
  }


  private __unsubscribe() : void {
    this.__channel.leave();
    this.__channel = undefined;
  }


  private __resetPositionInterval(duration, updated_at) : void {
    this.__clearPositionInterval();

    if(this.__positionCallback && duration && typeof(duration) === 'number') {
      console.debug('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Setting position interval');
      this.__positionIntervalId = setInterval(() => {
        const position = new Date().valueOf() - new Date(updated_at).valueOf();
        if(position > duration) {
          console.debug('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Position > Duration', position, duration);
          this.__clearPositionInterval();
        } else {
          this.__positionCallback(position, duration);
        }
      }, this.__positionInterval);
    }
  }


  private __clearPositionInterval() : void {
    if(this.__positionIntervalId) {
      console.debug('[RadioKit.Toolkit.Broadcast.Metadata.MetadataListener] Clearing position interval');
      clearInterval(this.__positionIntervalId);
      this.__positionIntervalId = undefined;
    }
  }
}