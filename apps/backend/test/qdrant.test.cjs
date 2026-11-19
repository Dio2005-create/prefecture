const assert = require('node:assert/strict');
const { test } = require('node:test');
const { QdrantService } = require('../src/ai/qdrant.service');

test('authenticates Qdrant requests with the configured Cloud API key', async (t) => {
  const previousEnvironment = {
    QDRANT_URL: process.env.QDRANT_URL,
    QDRANT_API_KEY: process.env.QDRANT_API_KEY,
    QDRANT_COLLECTION: process.env.QDRANT_COLLECTION,
  };
  const originalFetch = global.fetch;
  const calls = [];

  t.after(() => {
    global.fetch = originalFetch;
    for (const [name, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  process.env.QDRANT_URL = 'https://cluster.example/';
  process.env.QDRANT_API_KEY = 'test-api-key';
  process.env.QDRANT_COLLECTION = 'archives_prefecture';
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), headers: options.headers ?? {} });
    return new Response(JSON.stringify({ result: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const qdrant = new QdrantService();
  await qdrant.indexer([{ id: 'point-1', vector: [0.1], payload: {} }]);
  await qdrant.rechercher([0.1], 5);
  await qdrant.supprimerDocument('document-1');

  assert.equal(calls.length, 6);
  assert.ok(calls.every(({ url }) => url.startsWith('https://cluster.example/collections/')));
  assert.ok(calls.every(({ headers }) => headers['api-key'] === 'test-api-key'));
});
