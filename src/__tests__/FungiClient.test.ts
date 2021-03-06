import { TEST_BASE_URL } from '../mocks/handlers';
import { server } from '../mocks/server';
import { FungiClient } from '../FungiClient';
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
    channel.on(ServerEvents.SUBSCRIPTION_SUCCEEDED, () => {
      res(undefined);
    });
  });

  expect(channel.isSubscribed).toBe(true);

  channel.unsubscribe();

  await new Promise(res => {
    channel.on(ServerEvents.UNSUBSCRIPTION_SUCCEEDED, () => {
      res(undefined);
    });
  });

  expect(channel.isSubscribed).toBe(false);

  client.disconnect();
});

it('queues subscriptions if client subscribes before connection is established', async () => {
  const client = new FungiClient('ws://localhost:8080');

  expect(client.isConnectionEstablished).toBe(false);

  // Subscribe before connection is established
  const channel1 = client.subscribe('test-channel-1');
  const channel2 = client.subscribe('test-channel-2');

  expect(channel1.isSubscribed).toBe(false);
  expect(channel2.isSubscribed).toBe(false);

  await connect(client);

  // Listen to the subscription succeeded event after connecting
  await Promise.all([
    new Promise(res => {
      channel1.on(ServerEvents.SUBSCRIPTION_SUCCEEDED, () => {
        res(undefined);
      });
    }),
    new Promise(res => {
      channel2.on(ServerEvents.SUBSCRIPTION_SUCCEEDED, () => {
        res(undefined);
      });
    }),
  ]);

  expect(channel1.isSubscribed).toBe(true);
  expect(channel2.isSubscribed).toBe(true);

  client.disconnect();
});

it('subscribes and unsubscribes to private channels', async () => {
  const client = await connect(
    new FungiClient('ws://localhost:8080', {
      auth: {
        endpoint: TEST_BASE_URL + '/authorize_socket',
      },
    })
  );

  server.listen();

  const channel = client.subscribe('private-channel');

  await new Promise(res => {
    channel.on(ServerEvents.SUBSCRIPTION_SUCCEEDED, () => {
      res(undefined);
    });
  });

  expect(channel.isSubscribed).toBe(true);

  channel.unsubscribe();

  await new Promise(res => {
    channel.on(ServerEvents.UNSUBSCRIPTION_SUCCEEDED, () => {
      res(undefined);
    });
  });

  expect(channel.isSubscribed).toBe(false);

  server.close();
  client.disconnect();
});

it('allows client events on private channels', async () => {
  const client = await connect(
    new FungiClient('ws://localhost:8080', {
      auth: {
        endpoint: TEST_BASE_URL + '/authorize_socket',
      },
    })
  );

  server.listen();

  const channel = client.subscribe('private-channel');

  await new Promise(res => {
    channel.on(ServerEvents.SUBSCRIPTION_SUCCEEDED, () => {
      res(undefined);
    });
  });

  channel.trigger('client-test-event', { test: true });

  server.close();
  client.disconnect();
});

it(`doesn't allow client events on public channels`, async () => {
  expect.assertions(1);

  const client = await connect(new FungiClient('ws://localhost:8080'));

  server.listen();

  const channel = client.subscribe('test-channel');

  await new Promise(res => {
    channel.on(ServerEvents.SUBSCRIPTION_SUCCEEDED, () => {
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

it('listens to events', async () => {
  expect.assertions(2);

  const client = await connect(
    new FungiClient('ws://localhost:8080', {
      auth: {
        endpoint: TEST_BASE_URL + '/authorize_socket',
      },
    })
  );

  server.listen();

  const publicChannel = client.subscribe('test-channel');
  const privateChannel = client.subscribe('private-test-channel');

  await Promise.all([
    new Promise(res =>
      publicChannel.on(ServerEvents.SUBSCRIPTION_SUCCEEDED, () => {
        res(undefined);
      })
    ),
    new Promise(res =>
      privateChannel.on(ServerEvents.SUBSCRIPTION_SUCCEEDED, () => {
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
      publicChannel.on('test-event', data => {
        expect(data).toMatchInlineSnapshot(`
            Object {
              "test": true,
            }
          `);
        res(undefined);
      });
    }),
    new Promise(res => {
      privateChannel.on('test-event', data => {
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

it('stops listening to events', async () => {
  let eventsReceivedCount = 0;

  const client = await connect(new FungiClient('ws://localhost:8080'));

  server.listen();

  const channel = client.subscribe('test-channel');

  await new Promise(res =>
    channel.on(ServerEvents.SUBSCRIPTION_SUCCEEDED, () => {
      res(undefined);
    })
  );

  channel.on('test-event', () => {
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

  channel.off('test-event');

  await json(
    {
      channel_names: ['test-channel', 'private-test-channel'],
      event_name: 'test-event',
    },
    TEST_BASE_URL + '/trigger'
  );

  // We stopped listening so it should still be 1.
  expect(eventsReceivedCount).toBe(1);

  server.close();
  client.disconnect();
});

it('allows listening to any event', async () => {
  let eventsReceivedCount = 0;

  const client = await connect(new FungiClient('ws://localhost:8080'));

  server.listen();

  const channel = client.subscribe('test-channel');

  await new Promise(res =>
    channel.on(ServerEvents.SUBSCRIPTION_SUCCEEDED, () => {
      res(undefined);
    })
  );

  channel.onAny(() => {
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

  channel.offAny();

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

it('removes one time listeners after they fire', async () => {
  let eventsReceivedCount = 0;

  const client = await connect(new FungiClient('ws://localhost:8080'));

  server.listen();

  const channel = client.subscribe('test-channel');

  await new Promise(res =>
    channel.on(ServerEvents.SUBSCRIPTION_SUCCEEDED, () => {
      res(undefined);
    })
  );

  channel.once('test-event', () => {
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

  await json(
    {
      channel_names: ['test-channel', 'private-test-channel'],
      event_name: 'test-event',
    },
    TEST_BASE_URL + '/trigger'
  );

  // We triggered again but because it's a one time
  // listener, this should still be 1.
  expect(eventsReceivedCount).toBe(1);

  server.close();
  client.disconnect();
});

it('client events', async () => {
  const client1 = await connect(
    new FungiClient('ws://localhost:8080', {
      auth: {
        endpoint: TEST_BASE_URL + '/authorize_socket',
      },
    })
  );

  const client2 = await connect(
    new FungiClient('ws://localhost:8080', {
      auth: {
        endpoint: TEST_BASE_URL + '/authorize_socket',
      },
    })
  );

  server.listen();

  const channel1 = client1.subscribe('private-test-channel');
  const channel2 = client2.subscribe('private-test-channel');

  await new Promise(res =>
    channel1.on(ServerEvents.SUBSCRIPTION_SUCCEEDED, () => {
      res(undefined);
    })
  );

  await new Promise(res =>
    channel2.on(ServerEvents.SUBSCRIPTION_SUCCEEDED, () => {
      res(undefined);
    })
  );

  channel1.trigger('client-test-event', {
    test: true,
  });

  let eventData = await new Promise(res => {
    channel2.on('client-test-event', data => {
      res(data);
    });
  });

  expect(eventData).toMatchInlineSnapshot(`
    Object {
      "test": true,
    }
  `);

  server.close();
  client1.disconnect();
  client2.disconnect();
});

it("resets the client's state when disconnecting", async () => {
  let client = new FungiClient('ws://localhost:8080');

  await connect(client);

  const channel = client.subscribe('test-channel');

  await new Promise(res =>
    channel.on(ServerEvents.SUBSCRIPTION_SUCCEEDED, () => {
      res(undefined);
    })
  );

  client.disconnect();

  expect(client.isConnectionEstablished).toBe(false);
  expect(client.socketId).toBeNull();
});
