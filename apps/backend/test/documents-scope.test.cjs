const assert = require('node:assert/strict');
const { test } = require('node:test');
const { BadRequestException } = require('@nestjs/common');
const { DocumentsService } = require('../src/documents/documents.service');

function createService() {
  const calls = { findMany: [] };
  const prisma = {
    documentAdministratif: {
      create: async ({ data }) => {
        calls.createData = data;
        return data;
      },
      findMany: async ({ where }) => {
        calls.findMany.push(where);
        return [];
      },
      count: async () => 0,
    },
    $transaction: async (queries) => {
      calls.findAllWhere = calls.findMany[0];
      return [[], 0];
    },
  };
  return {
    calls,
    service: new DocumentsService(prisma, {}, {}, {}),
  };
}

test('stores publication uploads separately from internal archives', async () => {
  const { calls, service } = createService();
  await service.create({
    titre: 'Texte officiel',
    type: 'ARRETE',
    scope: 'PUBLICATION',
    cheminFichier: 'uploads/file.pdf',
  });

  assert.equal(calls.createData.isPublication, true);
});

test('rejects non-publication document types from the citizen-facing publication list', () => {
  const { calls, service } = createService();
  assert.throws(
    () => service.create({
      titre: 'Archive',
      type: 'ACTE',
      scope: 'PUBLICATION',
      cheminFichier: 'uploads/file.pdf',
    }),
    BadRequestException,
  );
  assert.equal(calls.createData, undefined);
});

test('keeps archive and publication queries in separate scopes', async () => {
  const { calls, service } = createService();
  await service.findAll({ page: 1, limit: 5 });
  await service.listPublic({ page: 1, limit: 5 });
  await service.listPublications({ page: 1, limit: 5 });

  assert.equal(calls.findAllWhere.isPublication, false);
  assert.equal(calls.findMany[1].isPublication, true);
  assert.deepEqual(calls.findMany[1].statut, { in: ['VALIDE', 'ARCHIVE'] });
  assert.equal(calls.findMany[2].isPublication, true);
});
