import WebSocket from 'isomorphic-ws';
import ReconnectingWebSocket from 'reconnecting-websocket';
import { CONNECTION_TIMEOUT, PING_SECONDS } from './constants';
import { Channel } from './Channel';
import {
  ClientEvent,
  ClientEvents,
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
  private pingInterval: any = null;
  private channels: Channel[] = [];
  public socketId: string | null = null;
  public isConnectionEstablished: boolean = false;

  constructor(address: string, public config?: FungiClientConfig) {
    if (
      (config?.clientOnly && typeof window !== 'undefined') ||
      !config?.clientOnly
    ) {
      this.initialize(address);
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
    this.ws?.addEventListener('open', () => {
      console.log(`Fungi WebSocket connection opened`);
    });
  }

  private addErrorEventListener() {
    this.ws?.addEventListener('error', error => {
      console.error(
        `Fungi WebSocket connection error: ${JSON.stringify(error, null, 2)}`
      );
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

    channel
      .getEventHandlers(event)
      .forEach(eventHandler => eventHandler.handler(data));
  }

  private handleTriggeredEvent(message: ServerEvent) {
    const { channel: channelName, event, data } = message as TriggeredEvent;

    const channel = this.getChannel(channelName);

    if (!channel || !channel.isSubscribed) {
      return;
    }

    const eventHandlers = channel.getEventHandlers(event);
    const globalHandlers = channel.getGlobalHandlers();

    if (eventHandlers.length === 0 && globalHandlers.length === 0) {
      console.warn(
        `Received event '${event}' on channel '${channelName}' but no handlers are bound to it.`
      );

      return;
    }

    eventHandlers.forEach(eventHandler => eventHandler.handler(data));
    globalHandlers.forEach(handler => handler(channelName, event, data));
  }

  private handleErrorEvent(message: ServerEvent) {
    const { data } = message as FungiError;
    this.config?.onError?.(data.message, data.code);
  }

  private handleSubscriptionErrorEvent(message: ServerEvent) {
    const { data, event } = message as FungiSubscriptionError;

    const channel = this.channels.find(
      channel => channel.name === data.channel
    );

    if (!channel) {
      return;
    }

    this.channels = this.channels.filter(
      channel => channel.name === data.channel
    );

    channel
      .getEventHandlers(event)
      .forEach(eventHandler => eventHandler.handler(data));
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

    channel
      .getEventHandlers(event)
      .forEach(eventHandler => eventHandler.handler(data));
  }

  private handleConnectionEstablishedEvent(message: ServerEvent) {
    this.isConnectionEstablished = true;

    const { data } = message as FungiConnectionEstablished;
    this.socketId = data.socket_id;

    this.pingInterval = setInterval(() => {
      this.ws?.send(ClientEvents.PING);
    }, PING_SECONDS * 1000);

    this.channels.forEach(channel => channel.subscribe());

    this.config?.onConnectionEstablished?.();
  }

  private addCloseEventListener() {
    this.ws?.addEventListener('close', event => {
      console.log(`Fungi WebSocket connection closed`);

      this.isConnectionEstablished = false;
      this.socketId = null;
      this.channels = [];

      if (this.pingInterval) {
        clearInterval(this.pingInterval);
      }

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

  public disconnect() {
    this.ws?.close();
  }
}
