import { useState } from 'react';
import { NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { UploadCloud } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { documentService } from '../services/api';
import { PageIntro } from '../components/ui';
import type { DocumentType } from '../types';
import { usePreferences } from '../preferences';

const types: DocumentType[] = ['ACTE', 'ARRETE', 'COURRIER', 'AUTRE'];
export function ImportPage() {
  const { t } = usePreferences();
  const [file, setFile] = useState<File>();
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type');
  const scope = searchParams.get('scope') === 'publication' ? 'PUBLICATION' : 'ARCHIVE';
  const isPublication = scope === 'PUBLICATION';
  const availableTypes: DocumentType[] = isPublication ? ['ARRETE', 'COURRIER'] : types;
  const [type, setType] = useState<DocumentType>(availableTypes.includes(initialType as DocumentType) ? initialType as DocumentType : 'ARRETE');
  const nav = useNavigate();
  const client = useQueryClient();
  const returnPath = isPublication ? '/back/publications' : '/back/documents';
  const upload = useMutation({
    mutationFn: () => documentService.upload(file!, { type, scope }),
    onSuccess: async (doc) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['documents'] }),
        client.invalidateQueries({ queryKey: ['admin-publications'] }),
        client.invalidateQueries({ queryKey: ['public-documents'] }),
        client.invalidateQueries({ queryKey: ['document', doc.id] }),
      ]);
      nav(`/back/documents/${doc.id}`);
    },
  });
  return <><PageIntro eyebrow={t(isPublication ? 'Texte officiel' : 'Nouveau document')} title={t(isPublication ? 'Importer un texte officiel' : 'Importer une archive')} description={t(isPublication ? 'Ce document sera destiné aux citoyens dans les textes officiels.' : 'Déposez un fichier dans les archives internes réservées à l’administration.')} /><div className="import-layout"><div className="panel import-panel"><label className={file ? 'dropzone has-file' : 'dropzone'}><input type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" onChange={(event) => setFile(event.target.files?.[0])} /><UploadCloud size={30} /><strong>{file ? file.name : t('Déposez votre document ici')}</strong><span>{file ? `${Math.round(file.size / 1024)} Ko` : 'PDF, DOCX, PNG ou JPG'}</span></label><div className="form-row"><label>{t('Type de document')}<select value={type} onChange={(event) => setType(event.target.value as DocumentType)}>{availableTypes.map((item) => <option key={item}>{item}</option>)}</select></label></div><button className="button primary full" disabled={!file || upload.isPending} onClick={() => upload.mutate()}>{t(upload.isPending ? 'Envoi en cours…' : 'Lancer l’import')}</button>{upload.isError && <p className="error-message">{t('Le document a été enregistré, mais son traitement automatique a échoué. Consultez sa fiche pour le détail.')}</p>}</div><div className="panel pipeline-card"><p className="eyebrow">{t('Traitement automatique')}</p><h2>{t('Un parcours traçable')}</h2><p>{t('OCR, classification, chunks, embeddings puis indexation vectorielle.')}</p>{['Réception du fichier', 'Extraction OCR', 'Classification IA', 'Découpage en chunks', 'Embeddings locaux', 'Indexation vectorielle'].map((item, index) => <div className="mini-step" key={item}><span>{index + 1}</span>{t(item)}<small>{t('À venir')}</small></div>)}</div></div><NavLink className="text-link" to={returnPath}>{t(isPublication ? 'Retour aux publications' : 'Retour aux documents')}</NavLink></>;
}
