import { TEST_BASE_URL } from '../../mocks/handlers';
import { json } from '../json';

test('sends and returns json', async () => {
  const data = await json({ hello: 'there' }, TEST_BASE_URL + '/some_json');

  expect(data).toMatchInlineSnapshot(`
    Object {
      "hello": "there",
    }
  `);
});
