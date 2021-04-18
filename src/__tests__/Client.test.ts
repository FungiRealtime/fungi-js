import { Client } from '../Client';
import { connect } from '../test/connect';
import { ServerEvents } from '../types';

it('connects and receives a socket id', async () => {
  const client = await connect();
  expect(client.isConnectionEstablished).toBe(true);
  expect(client.socketId).toBeDefined();

  client.disconnect();
});

it('subscribes and unsubcribes to public channels', async () => {
  const client = await connect();
  const channel = client.subscribe('test-channel');

  await new Promise(res => {
    channel.bind(ServerEvents.SUBSCRIPTION_SUCCEEDED, () => {
      res(undefined);
    });
  });

  expect(channel.isSubscribed).toBe(true);

  channel.unsubscribe();

  await new Promise(res => {
    channel.bind(ServerEvents.UNSUBSCRIPTION_SUCCEEDED, () => {
      res(undefined);
    });
  });

  expect(channel.isSubscribed).toBe(false);

  client.disconnect();
});

it('queues subscriptions if client subscribes before connection is established', async () => {
  const client = new Client({
    endpoint: 'ws://localhost:8081',
  });

  expect(client.isConnectionEstablished).toBe(false);

  // Subscribe before connection is established
  const channel1 = client.subscribe('test-channel-1');
  const channel2 = client.subscribe('test-channel-2');

  expect(channel1.isSubscribed).toBe(false);
  expect(channel2.isSubscribed).toBe(false);

  await connect(client);

  // Bind to the subscription succeeded event after connecting
  await Promise.all([
    new Promise(res =>
      channel1.bind(ServerEvents.SUBSCRIPTION_SUCCEEDED, () => {
        res(undefined);
      })
    ),
    new Promise(res =>
      channel2.bind(ServerEvents.SUBSCRIPTION_SUCCEEDED, () => {
        res(undefined);
      })
    ),
  ]);

  expect(channel1.isSubscribed).toBe(true);
  expect(channel2.isSubscribed).toBe(true);

  client.disconnect();
});
