import { CloseEvent } from 'reconnecting-websocket';

export interface FungiClientConfig {
  /**
   * An auth endpoint must be provided if the application subscribes to
   * channels that require authentication (i.e., private channels).
   * ```
   * const fungi = new FungiClient('wss://your-app.com', {
   *   auth: {
   *     endpoint: '/api/fungi/auth',
   *     headers: {
   *       'X-CSRF-Token': 'token'
   *     }
   *   }
   * })
   * ```
   */
  auth?: {
    endpoint: string;
    headers?: HeadersInit;
  };

  /**
   * Callback which will be called when a `fungi:error` event
   * is triggered. This won't be called for the subscription error
   * event `fungi:subscription_error`.
   */
  onError?: (message: string, code: number) => void;

  /**
   * Callback which will be called when the websocket's connection
   * is closed.
   */
  onClose?: (event: CloseEvent) => void;

  /**
   * Callback which will be called when the websocket's connection
   * is closed.
   */
  onConnectionEstablished?: () => void;

  /**
   * If true, the websocket connection will only be open
   * client-side (if `window` is defined).
   */
  clientOnly?: boolean;
}

export interface AuthResponse {
  auth: string;
}

export type EventBindHandler<TData> = (data: TData) => void;

export type ChannelGlobalHandler<TData> = (
  channelName: string,
  event: string,
  data: TData
) => void;

export interface ChannelEventHandler {
  event: string;
  handler: EventBindHandler<any>;
}

export interface BindOptions {
  /**
   * Replace all bound handlers for this event by this handler.
   */
  replace: boolean;
}

export enum ClientEvents {
  SUBSCRIBE = 'fungi:subscribe',
  UNSUBSCRIBE = 'fungi:unsubscribe',
  TRIGGER = 'fungi:trigger',
  PING = 'fungi:ping',
}

export enum ServerEvents {
  CONNECTION_ESTABLISHED = 'fungi:connection_established',
  SUBSCRIPTION_SUCCEEDED = 'fungi:subscription_succeeded',
  SUBSCRIPTION_ERROR = 'fungi:subscription_error',
  UNSUBSCRIPTION_SUCCEEDED = 'fungi:unsubscription_succeeded',
  ERROR = 'fungi:error',
  PONG = 'fungi:pong',
}

export interface FungiConnectionEstablished {
  event: ServerEvents.CONNECTION_ESTABLISHED;
  data: {
    socket_id: string; // The unique identifier for the socket
    activity_timeout: number; // The interval to send ping events to the server
  };
}

export interface FungiSubscriptionSucceeded {
  event: ServerEvents.SUBSCRIPTION_SUCCEEDED;
  data: {
    channel: string; // The name of the channel
  };
}

export interface FungiUnsubscriptionSucceeded {
  event: ServerEvents.UNSUBSCRIPTION_SUCCEEDED;
  data: {
    channel: string; // The name of the channel
  };
}

export interface FungiSubscriptionError {
  event: ServerEvents.SUBSCRIPTION_ERROR;
  data: {
    channel: string; // The name of the channelr
    reason: string;
  };
}

export interface FungiSubscribe {
  event: ClientEvents.SUBSCRIBE;
  data: {
    channel: string; // Name of the channel to subscribe to
    auth?: string; // Authentication token for private channels
  };
}

export interface FungiUnsubscribe {
  event: ClientEvents.UNSUBSCRIBE;
  data: {
    channel: string; // Name of the channel to unsubscribe from
  };
}

export interface FungiTrigger {
  event: ClientEvents.TRIGGER;
  data: {
    event: string;
    channel: string;
    data: Record<string, unknown>;
  };
}

export interface TriggeredEvent {
  channel: string;
  event: string;
  data: Record<string, unknown>;
}

export interface FungiError {
  event: ServerEvents.ERROR;
  data: {
    message: string; // A textual description of the error
    code: number; // Fungi re-uses HTTP error codes, 401 for Unauthorized, etc.
  };
}

export type ServerEvent =
  | FungiConnectionEstablished
  | FungiSubscriptionSucceeded
  | FungiSubscriptionError
  | FungiUnsubscriptionSucceeded
  | FungiError
  | TriggeredEvent;

export type ClientEvent = FungiSubscribe | FungiUnsubscribe | FungiTrigger;
