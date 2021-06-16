import WebSocket from 'isomorphic-ws';
import ReconnectingWebSocket from 'reconnecting-websocket';
import { CONNECTION_TIMEOUT } from './constants';
import { Channel } from './Channel';
import {
  ClientEvent,
  FungiConnectionEstablished,
  FungiError,
  FungiSubscriptionError,
  FungiSubscriptionSucceeded,
  FungiUnsubscriptionSucceeded,
  ServerEvent,
  ServerEvents,
  TriggeredEvent,
  FungiClientConfig,
} from './types';

export class FungiClient {
  private ws: ReconnectingWebSocket | null = null;
  private channels: Channel[] = [];
  public socketId: string | null = null;
  public isConnectionEstablished: boolean = false;

  constructor(private address: string, public config?: FungiClientConfig) {
    if (
      (config?.clientOnly && typeof window !== 'undefined') ||
      !config?.clientOnly
    ) {
      this.initialize(this.address);
    }
  }

  private initialize(address: string) {
    this.isConnectionEstablished = false;
    this.channels = [];

    this.ws = new ReconnectingWebSocket(address, [], {
      connectionTimeout: CONNECTION_TIMEOUT,
      WebSocket,
    });

    this.addEventListeners();
  }

  private addEventListeners() {
    this.addOpenEventListener();
    this.addMessageEventListener();
    this.addCloseEventListener();
    this.addErrorEventListener();
  }

  private addOpenEventListener() {
    this.ws?.addEventListener('open', event => {
      this.config?.onOpen?.(event);
    });
  }

  private addErrorEventListener() {
    this.ws?.addEventListener('error', error => {
      this.config?.onError?.(error);
    });
  }

  private addMessageEventListener() {
    this.ws?.addEventListener('message', rawMessage => {
      let message;
      try {
        message = JSON.parse(rawMessage.data) as ServerEvent;
      } catch (error) {
        return console.error(error);
      }

      switch (message.event) {
        case ServerEvents.CONNECTION_ESTABLISHED: {
          this.handleConnectionEstablishedEvent(message);
          break;
        }

        case ServerEvents.SUBSCRIPTION_SUCCEEDED: {
          this.handleSubscriptionSucceededEvent(message);
          break;
        }

        case ServerEvents.UNSUBSCRIPTION_SUCCEEDED: {
          this.handleUnsubscriptionSucceededEvent(message);
          break;
        }

        case ServerEvents.SUBSCRIPTION_ERROR: {
          this.handleSubscriptionErrorEvent(message);
          break;
        }

        case ServerEvents.ERROR: {
          this.handleErrorEvent(message);
          break;
        }

        default: {
          this.handleTriggeredEvent(message);
          break;
        }
      }
    });
  }

  private handleUnsubscriptionSucceededEvent(message: ServerEvent) {
    const { data, event } = message as FungiUnsubscriptionSucceeded;

    const channel = this.getChannel(data.channel);

    // Channel will always be defined but typescript
    // doesn't know this so we check that it's defined.
    if (!channel) {
      return;
    }

    channel.isSubscribed = false;
    this.fireListeners(channel, event, data);
  }

  private fireListeners(
    channel: Channel,
    event: string,
    data: Record<string, unknown>
  ) {
    const listeners = channel.getListeners(event);
    const oneTimeListeners = channel.getOneTimeListeners(event);
    const globalListeners = channel.getGlobalListeners();

    listeners.forEach(listener => listener.callback(data));
    oneTimeListeners.forEach(listener => listener.callback(data));
    globalListeners.forEach(listener => listener(channel.name, event, data));

    channel.removeOneTimeListeners(event);
  }

  private handleTriggeredEvent(message: ServerEvent) {
    const { channel: channelName, event, data } = message as TriggeredEvent;

    const channel = this.getChannel(channelName);

    if (!channel || !channel.isSubscribed) {
      return;
    }

    this.fireListeners(channel, event, data);
  }

  private handleErrorEvent(message: ServerEvent) {
    const { data } = message as FungiError;
    this.config?.onErrorEvent?.(data.message, data.code);
  }

  private handleSubscriptionErrorEvent(message: ServerEvent) {
    const { data, event } = message as FungiSubscriptionError;

    const channel = this.channels.find(
      channel => channel.name === data.channel
    );

    if (!channel) {
      return;
    }

    this.fireListeners(channel, event, data);
  }

  private handleSubscriptionSucceededEvent(message: ServerEvent) {
    const { data, event } = message as FungiSubscriptionSucceeded;

    const channel = this.getChannel(data.channel);

    // Channel will always be defined but typescript
    // doesn't know this so we check that it's defined.
    if (!channel) {
      return;
    }

    channel.isSubscribed = true;

    this.fireListeners(channel, event, data);
  }

  private handleConnectionEstablishedEvent(message: ServerEvent) {
    this.isConnectionEstablished = true;

    const { data } = message as FungiConnectionEstablished;
    this.socketId = data.socket_id;

    this.channels.forEach(channel => channel.subscribe());

    this.config?.onConnectionEstablished?.();
  }

  private addCloseEventListener() {
    this.ws?.addEventListener('close', event => {
      this.isConnectionEstablished = false;
      this.socketId = null;
      this.channels = [];

      this.config?.onClose?.(event);
    });
  }

  private getChannel(channelName: string) {
    return this.channels.find(channel => channel.name === channelName);
  }

  /** Sends an event. For internal use only. */
  public sendEvent(event: ClientEvent['event'], data: ClientEvent['data']) {
    this.ws?.send(JSON.stringify({ event, data }));
  }

  /**
   * Subscribes to a Fungi channel.
   * @param channelName The name of the channel to subscribe to.
   */
  public subscribe(channelName: string) {
    const existingChannel = this.getChannel(channelName);

    if (existingChannel) {
      if (this.isConnectionEstablished) {
        existingChannel.subscribe();
      }

      return existingChannel;
    }

    const channel = new Channel(channelName, this);
    this.channels.push(channel);

    if (this.isConnectionEstablished) {
      channel.subscribe();
    }

    return channel;
  }

  public unsubscribe(channelName: string) {
    const channel = this.getChannel(channelName);
    if (!channel) {
      return;
    }

    channel.unsubscribe();
  }

  /**
   * Closes the WebSocket connection with Fungi and resets
   * the client's state.
   */
  public disconnect() {
    this.ws?.close();
    this.ws = null;
    this.isConnectionEstablished = false;
    this.socketId = null;
    this.channels = [];
  }
}
