import WebSocket from 'ws';

test('connects', done => {
  const port = 9009;
  const wss = new WebSocket.Server({ port }, () => {
    const ws = new WebSocket(`ws://localhost:${port}`);

    ws.on('open', () => {
      console.log('opened');
      wss.close(done);
    });
  });

  wss.on('connection', socket => {
    socket.on('error', err => {
      console.log({ err });
    });

    socket.on('close', (code, reason) => {
      console.log({ code, reason });
    });
  });
});
