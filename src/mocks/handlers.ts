import { rest } from 'msw';
import { Client } from '@fungi-realtime/node';

export const TEST_BASE_URL = 'http://localhost:9999';

const client = new Client({
  httpEndpoint: 'http://localhost:8080',
  key: 'app-test-key',
  secret: 'app-test-secret',
});

export const handlers = [
  rest.post<{ socket_id: string; channel_name: string }>(
    TEST_BASE_URL + '/authorize_socket',
    async (req, res, ctx) => {
      const auth = client.authenticate(
        req.body.socket_id,
        req.body.channel_name
      );

      return res(ctx.json(auth), ctx.status(200));
    }
  ),

  rest.post<{ socket_id: string; channel_name: string }>(
    TEST_BASE_URL + '/invalid_authorize_socket',
    async (req, res, ctx) => {
      const auth = client.authenticate(
        req.body.socket_id,
        req.body.channel_name
      );

      const invalidAuth = {
        auth: auth.auth.slice(0, auth.auth.length - 1), // Make this an invalid auth string
      };

      return res(ctx.json(invalidAuth), ctx.status(200));
    }
  ),

  rest.post<{ channel_names: string[]; event_name: string }>(
    TEST_BASE_URL + '/trigger',
    async (req, res, ctx) => {
      await client.trigger(req.body.channel_names, req.body.event_name, {
        test: true,
      });

      return res(ctx.json({ ok: true }), ctx.status(200));
    }
  ),
];
