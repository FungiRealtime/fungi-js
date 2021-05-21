import { Client } from '../Client';
import { TEST_BASE_URL } from '../mocks/handlers';
import { server } from '../mocks/server';
import { connect } from '../test/connect';
import { ServerEvents } from '../types';
import { json } from '../utils/json';

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
  const client = new Client('ws://localhost:8081');

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

it('subscribes and unsubscribes to private channels', async () => {
  const client = await connect(new Client('ws://localhost:8081'));

  server.listen();

  const channel = client.subscribe('private-channel');

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

  server.close();
  client.disconnect();
});

it('requires valid authentication to subscribe to private channels', async () => {
  const client = await connect(new Client('ws://localhost:8081'));

  server.listen();

  const channel = client.subscribe('private-channel');

  await new Promise((res, rej) => {
    channel.bind(ServerEvents.SUBSCRIPTION_ERROR, () => {
      res(undefined);
    });
    channel.bind(ServerEvents.SUBSCRIPTION_SUCCEEDED, () => {
      rej();
    });
  });

  expect(channel.isSubscribed).toBe(false);

  server.close();
  client.disconnect();
});

it('allows client events on private channels', async () => {
  const client = await connect(new Client('ws://localhost:8081'));

  server.listen();

  const channel = client.subscribe('private-channel');

  await new Promise(res => {
    channel.bind(ServerEvents.SUBSCRIPTION_SUCCEEDED, () => {
      res(undefined);
    });
  });

  channel.trigger('client-test-event', { test: true });

  await new Promise(res => {
    channel.bind('client-test-event', data => {
      expect(data).toMatchInlineSnapshot(`
        Object {
          "test": true,
        }
      `);

      res(undefined);
    });
  });

  server.close();
  client.disconnect();
});

it(`doesn't allow client events on public channels`, async () => {
  expect.assertions(1);

  const client = await connect(new Client('ws://localhost:8081'));

  server.listen();

  const channel = client.subscribe('test-channel');

  await new Promise(res => {
    channel.bind(ServerEvents.SUBSCRIPTION_SUCCEEDED, () => {
      res(undefined);
    });
  });

  try {
    channel.trigger('client-test-event', { test: true });
  } catch (error) {
    expect(error.message).toBe(
      `Failed to trigger client event with an event name of client-test-event on channel ${channel.name}. Client events can only be triggered on authenticated channels.`
    );
  }

  server.close();
  client.disconnect();
});

it('allows binding events', async () => {
  expect.assertions(2);

  const client = await connect(new Client('ws://localhost:8081'));

  server.listen();

  const publicChannel = client.subscribe('test-channel');
  const privateChannel = client.subscribe('private-test-channel');

  await Promise.all([
    new Promise(res =>
      publicChannel.bind(ServerEvents.SUBSCRIPTION_SUCCEEDED, () => {
        res(undefined);
      })
    ),
    new Promise(res =>
      privateChannel.bind(ServerEvents.SUBSCRIPTION_SUCCEEDED, () => {
        res(undefined);
      })
    ),
  ]);

  // We don't await here because we want to bind to events before
  // this completes.
  json(
    {
      channel_names: ['test-channel', 'private-test-channel'],
      event_name: 'test-event',
    },
    TEST_BASE_URL + '/trigger'
  );

  await Promise.all([
    new Promise(res => {
      publicChannel.bind('test-event', data => {
        expect(data).toMatchInlineSnapshot(`
            Object {
              "test": true,
            }
          `);
        res(undefined);
      });
    }),
    new Promise(res => {
      privateChannel.bind('test-event', data => {
        expect(data).toMatchInlineSnapshot(`
            Object {
              "test": true,
            }
          `);
        res(undefined);
      });
    }),
  ]);

  server.close();
  client.disconnect();
});

it('allows unbinding events', async () => {
  const consoleWarnSpy = jest
    .spyOn(console, 'warn')
    .mockImplementation(() => {});

  let eventsReceivedCount = 0;

  const client = await connect(new Client('ws://localhost:8081'));

  server.listen();

  const channel = client.subscribe('test-channel');

  await new Promise(res =>
    channel.bind(ServerEvents.SUBSCRIPTION_SUCCEEDED, () => {
      res(undefined);
    })
  );

  channel.bind('test-event', () => {
    eventsReceivedCount++;
  });

  await json(
    {
      channel_names: ['test-channel', 'private-test-channel'],
      event_name: 'test-event',
    },
    TEST_BASE_URL + '/trigger'
  );

  expect(eventsReceivedCount).toBe(1);

  channel.unbind('test-event');

  await json(
    {
      channel_names: ['test-channel', 'private-test-channel'],
      event_name: 'test-event',
    },
    TEST_BASE_URL + '/trigger'
  );

  // We unbound so it should still be 1.
  expect(eventsReceivedCount).toBe(1);

  // A warning should have been logged since we received an unbound event.
  expect(consoleWarnSpy).toHaveBeenCalledTimes(1);

  server.close();
  client.disconnect();
});

it('allows global binding and unbinding', async () => {
  let eventsReceivedCount = 0;

  const client = await connect(new Client('ws://localhost:8081'));

  server.listen();

  const channel = client.subscribe('test-channel');

  await new Promise(res =>
    channel.bind(ServerEvents.SUBSCRIPTION_SUCCEEDED, () => {
      res(undefined);
    })
  );

  channel.bindGlobal(() => {
    eventsReceivedCount++;
  });

  const batchCount = 10;

  await json(
    {
      channel_name: 'test-channel',
      amount: batchCount,
    },
    TEST_BASE_URL + '/trigger_batch'
  );

  expect(eventsReceivedCount).toBe(batchCount);

  channel.unbindGlobal();

  await json(
    {
      channel_names: ['test-channel'],
      event_name: 'test-event',
    },
    TEST_BASE_URL + '/trigger'
  );

  // Since we unbound globally the events received count
  // should be the same even though we just triggered an event.
  expect(eventsReceivedCount).toBe(batchCount);

  server.close();
  client.disconnect();
});
