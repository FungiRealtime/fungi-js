import { FungiClient } from './FungiClient';
import { json } from './utils/json';
import {
  AuthResponse,
  ClientEvents,
  EventListener,
  EventListenerCallback,
  GlobalEventListener,
} from './types';

export class Channel {
  public isSubscribed: boolean;
  private listeners: EventListener[];
  private oneTimeListeners: EventListener[];
  private globalListeners: GlobalEventListener<any>[];

  constructor(public name: string, private client: FungiClient) {
    this.isSubscribed = false;
    this.listeners = [];
    this.oneTimeListeners = [];
    this.globalListeners = [];
  }

  /**
   * Adds a **one-time** listener for an event. It will be removed
   * after being fired for the first time.
   * @param event The name of the event.
   * @param callback The callback which will be fired when the event is triggered.
   */
  public once<TData>(event: string, callback: EventListenerCallback<TData>) {
    this.oneTimeListeners.push({ event, callback });
  }

  /**
   * Adds a listener to the end of the listeners array for an event.
   * @param event The name of the event.
   * @param callback The callback which will be fired when the event is triggered.
   */
  public on<TData>(event: string, callback: EventListenerCallback<TData>) {
    this.listeners.push({ event, callback });
  }

  /**
   * Removes one or more listeners from the listeners array for an event.
   * @param events The events to stop listening to, if none are provided, all
   * events on this channel will no longer be listened to.
   */
  public off(...events: string[]) {
    if (events.length === 0) {
      this.listeners = [];
      return;
    }

    this.listeners = this.listeners.filter(
      listener => !events.includes(listener.event)
    );
  }

  /**
   * Adds a listener that will be fired when any event is triggered.
   * @param callback The callback which will be fired when the event is triggered.
   */
  public onAny<TData>(callback: GlobalEventListener<TData>) {
    this.globalListeners.push(callback);
  }

  /**
   * Removes all catch-all listeners.
   */
  public offAny() {
    this.globalListeners = [];
  }

  /**
   * Trigger a client event on this channel. The channel must be an
   * authenticated channel.
   * @param eventName The name of the event. Must be prefixed with `client-`.
   * @param data The object to be converted to JSON and distributed with the event.
   */
  public trigger(eventName: string, data: Record<string, unknown>) {
    if (!this.isSubscribed) {
      throw new Error(
        `Failed to trigger client event with an event name of ${eventName} on channel ${this.name}. Client events can only be triggered after a subscription has been successfully registered.`
      );
    }

    if (!this.isPrivateChannel()) {
      throw new Error(
        `Failed to trigger client event with an event name of ${eventName} on channel ${this.name}. Client events can only be triggered on authenticated channels.`
      );
    }

    if (!eventName.startsWith('client-')) {
      throw new Error(
        `Failed to trigger client event with an event name of ${eventName} on channel ${this.name}. The event name for client events must be prefixed with 'client-'.`
      );
    }

    this.client.sendEvent(ClientEvents.TRIGGER, {
      event: eventName,
      channel: this.name,
      data,
    });
  }

  /** Sends a subscription request. For internal use only. */
  public subscribe() {
    if (this.isSubscribed) {
      return;
    }

    if (this.isPrivateChannel()) {
      this.authorize(this.name)
        .then(({ auth }) => {
          this.client.sendEvent(ClientEvents.SUBSCRIBE, {
            channel: this.name,
            auth,
          });
        })
        .catch(console.error);

      return;
    }

    this.client.sendEvent(ClientEvents.SUBSCRIBE, {
      channel: this.name,
    });
  }

  /** Unsubscribes from this channel. */
  public unsubscribe() {
    if (!this.isSubscribed) {
      return;
    }

    this.client.sendEvent(ClientEvents.UNSUBSCRIBE, {
      channel: this.name,
    });
  }

  /** Gets the listeners for an event. For internal use only. */
  public getListeners(event: string) {
    return this.listeners.filter(listener => listener.event === event);
  }

  /** Gets the one-time listeners for an event. For internal use only. */
  public getOneTimeListeners(event: string) {
    return this.oneTimeListeners.filter(listener => listener.event === event);
  }

  /** Removes the one-time listeners for an event. For internal use only. */
  public removeOneTimeListeners(event: string) {
    this.oneTimeListeners = this.oneTimeListeners.filter(
      listener => listener.event !== event
    );
  }

  /** Gets the global listeners. For internal use only. */
  public getGlobalListeners() {
    return this.globalListeners;
  }

  private isPrivateChannel() {
    return this.name.startsWith('private-');
  }

  private async authorize(channelName: string) {
    if (!this.client.config?.auth?.endpoint) {
      throw new Error(
        `An auth endpoint must be provided to subscribe to private channels.`
      );
    }

    try {
      const authResponse = await json<AuthResponse>(
        {
          socket_id: this.client.socketId,
          channel_name: channelName,
        },
        this.client.config.auth.endpoint,
        this.client.config.auth.headers
      );

      if (!authResponse.auth) {
        throw new Error(
          `The auth endpoint didn't return a valid authentication string.`
        );
      }

      return authResponse;
    } catch (error) {
      throw new Error(error.message);
    }
  }
}
