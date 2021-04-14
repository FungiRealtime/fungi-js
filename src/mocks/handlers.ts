import { rest } from 'msw';

export const TEST_BASE_URL = 'http://localhost:9999';
export const HANDLER_WAIT_MS = 50;

export const handlers = [
  // Handler for testing timeouts.
  rest.get(TEST_BASE_URL + '/timeout', async (_req, res, ctx) => {
    await new Promise(res => setTimeout(res, HANDLER_WAIT_MS));
    return res(ctx.status(200));
  }),
  rest.post(TEST_BASE_URL + '/some_json', async (req, res, ctx) => {
    return res(ctx.json(req.body), ctx.status(200));
  }),
];
