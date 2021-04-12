import { Client } from './Client';
import { json } from './utils/json';
import {
  AuthResponse,
  BindOptions,
  ChannelEventHandler,
  ChannelGlobalHandler,
  EventBindHandler,
  ClientEvents,
} from './types';

export class Channel {
  public isSubscribed: boolean;
  private eventHandlers: ChannelEventHandler[];
  private globalHandlers: ChannelGlobalHandler<any>[];

  constructor(public name: string, private client: Client) {
    this.isSubscribed = false;
    this.eventHandlers = [];
    this.globalHandlers = [];
  }

  /**
   * Binds an event of this channel.
   * @param event The event to bind.
   * @param handler The handler for this binding.
   * @param options Additional options for this binding.
   */
  public bind<TData>(
    event: string,
    handler: EventBindHandler<TData>,
    options?: Partial<BindOptions>
  ) {
    if (options?.replace) {
      this.eventHandlers = this.eventHandlers.filter(
        eventHandler => eventHandler.event !== event
      );
    }

    this.eventHandlers.push({ event, handler });
  }

  /**
   * Unbinds channel's events.
   * @param events List of events to unbind, if none are provided, all events will be unbound.
   */
  public unbind(...events: string[]) {
    if (events.length === 0) {
      this.eventHandlers = [];
      return;
    }

    this.eventHandlers = this.eventHandlers.filter(
      eventHandler => !events.includes(eventHandler.event)
    );
  }

  /**
   * Binds every event on this channel.
   * @param handler The handler for this binding.
   */
  public bindGlobal<TData>(handler: ChannelGlobalHandler<TData>) {
    this.globalHandlers.push(handler);
  }

  /**
   * Removes global bindings for this channel.
   */
  public unbindGlobal() {
    this.globalHandlers = [];
  }

  /**
   * Trigger a client event on this channel. The channel must be an
   * authenticated channel.
   * @param eventName The name of the event. Must be prefixed with `client-`.
   * @param data The object to be converted to JSON and distributed with the event.
   */
  public trigger(eventName: string, data: Record<string, unknown>) {
    if (!this.isSubscribed) {
      return console.error(
        `Failed to trigger client event with an event name of ${eventName} on channel ${this.name}. Client events can only be triggered after a subscription has been successfully registered.`
      );
    }

    if (!this.isPrivateChannel()) {
      return console.error(
        `Failed to trigger client event with an event name of ${eventName} on channel ${this.name}. Client events can only be triggered on authenticated channels.`
      );
    }

    if (!eventName.startsWith('client-')) {
      return console.error(
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

  /** Gets the event handlers for a bound event. For internal use only. */
  public getEventHandlers(event: string) {
    return this.eventHandlers.filter(
      eventHandler => eventHandler.event === event
    );
  }

  /** Gets the global handlers. For internal use only. */
  public getGlobalHandlers() {
    return this.globalHandlers;
  }

  private isPrivateChannel() {
    return this.name.startsWith('private-');
  }

  private async authorize(channelName: string) {
    if (!this.client.config.auth?.endpoint) {
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
