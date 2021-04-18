import WebSocket from 'ws';

test('idk', done => {
  const maxPayload = 20480;
  const wss = new WebSocket.Server(
    {
      perMessageDeflate: true,
      port: 0,
    },
    () => {
      const ws = new WebSocket(
        `ws://localhost:${(wss.address() as WebSocket.AddressInfo).port}`,
        {
          perMessageDeflate: true,
          maxPayload,
        }
      );

      ws.on('open', () => {
        console.log('opened');
        wss.close(done);
      });

      wss.on('connection', socket => {
        socket.send('hi!');
      });
    }
  );
});
