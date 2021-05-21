import { Client } from '../Client';

export async function connect(existingClient?: Client) {
  if (existingClient) {
    await new Promise(res => {
      if (existingClient.config) {
        existingClient.config.onConnectionEstablished = () => {
          res(undefined);
        };
      } else {
        existingClient.config = {
          onConnectionEstablished: () => {
            res(undefined);
          },
        };
      }
    });

    return existingClient;
  }

  let client: Client;

  await new Promise(res => {
    client = new Client('ws://localhost:8081', {
      onConnectionEstablished: () => {
        res(undefined);
      },
    });
  });

  return client!;
}
