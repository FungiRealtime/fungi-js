import { FungiClient } from '../FungiClient';

export async function connect(existingClient?: FungiClient) {
  if (existingClient) {
    let onConnectionEstablished =
      existingClient.config?.onConnectionEstablished;

    await new Promise(res => {
      existingClient.config = {
        ...(existingClient.config || {}),
        onConnectionEstablished: () => {
          onConnectionEstablished?.();
          res(undefined);
        },
      };
    });

    return existingClient;
  }

  let client: FungiClient;

  await new Promise(res => {
    client = new FungiClient('ws://localhost:8080', {
      onConnectionEstablished: () => {
        res(undefined);
      },
    });
  });

  return client!;
}
