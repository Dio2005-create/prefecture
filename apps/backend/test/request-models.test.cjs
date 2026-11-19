const assert = require('node:assert/strict');
const { test } = require('node:test');
const { findRequestModel } = require('../src/requests/request-models');

test('recognizes administrative requests despite one spelling mistake', () => {
  assert.equal(findRequestModel('Je veux un acte de naissnce'), 'BIRTH_CERTIFICATE');
  assert.equal(findRequestModel('Comment demander un permis de constuire ?'), 'BUILDING_PERMIT');
  assert.equal(findRequestModel('certificat de residense'), 'RESIDENCE_CERTIFICATE');
});

test('does not guess a request type for unrelated questions', () => {
  assert.equal(findRequestModel('Bonjour, peux-tu m’aider ?'), undefined);
});
