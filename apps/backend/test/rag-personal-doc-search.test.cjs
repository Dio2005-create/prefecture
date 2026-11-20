const assert = require('node:assert/strict');
const { test } = require('node:test');
const { RagService } = require('../src/rag/rag.service');

test('does not OCR personal attachments for a general request question', async () => {
  let generated = false;
  const service = new RagService(
    {},
    {
      generer: async () => {
        generated = true;
        return 'Réponse';
      },
    },
    {},
  );
  service.obtenirOuCreerConversation = async () => 'conversation';
  service.rechercherDansDocumentsPersonnels = async () => {
    throw new Error('Personal OCR should not run for a general question');
  };
  service.enregistrerHistorique = async (_question, reponse) => ({ reponse });

  const response = await service.repondre('Comment demander un permis de construire ?', 5, 'citizen-id');

  assert.equal(generated, true);
  assert.equal(response.reponse, 'Réponse');
});
