import { FungiClient } from '../FungiClient';

export async function connect(existingClient?: FungiClient) {
  if (existingClient) {
    await new Promise(res => {
      existingClient.config = {
        ...(existingClient.config || {}),
        onConnectionEstablished: () => {
          res(undefined);
        },
      };
    });

    return existingClient;
  }

  let client: FungiClient;

  await new Promise(res => {
    client = new FungiClient('ws://localhost:8081', {
      onConnectionEstablished: () => {
        res(undefined);
      },
    });
  });

  return client!;
}
