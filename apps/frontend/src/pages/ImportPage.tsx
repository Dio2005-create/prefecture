import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
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
  const [type, setType] = useState<DocumentType>('ARRETE');
  const nav = useNavigate();
  const client = useQueryClient();
  const upload = useMutation({ mutationFn: () => documentService.upload(file!, { type }), onSuccess: async (doc) => { await client.invalidateQueries({ queryKey: ['documents'] }); await client.invalidateQueries({ queryKey: ['document', doc.id] }); nav(`/back/documents/${doc.id}`); } });
  return <><PageIntro eyebrow={t('Nouveau document')} title={t('Importer une archive')} description={t('Déposez un fichier pour l’inscrire dans le pipeline documentaire.')} /><div className="import-layout"><div className="panel import-panel"><label className={file ? 'dropzone has-file' : 'dropzone'}><input type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" onChange={(event) => setFile(event.target.files?.[0])} /><UploadCloud size={30} /><strong>{file ? file.name : t('Déposez votre document ici')}</strong><span>{file ? `${Math.round(file.size / 1024)} Ko` : 'PDF, DOCX, PNG ou JPG'}</span></label><div className="form-row"><label>{t('Type de document')}<select value={type} onChange={(event) => setType(event.target.value as DocumentType)}>{types.map((item) => <option key={item}>{item}</option>)}</select></label></div><button className="button primary full" disabled={!file || upload.isPending} onClick={() => upload.mutate()}>{t(upload.isPending ? 'Envoi en cours…' : 'Lancer l’import')}</button>{upload.isError && <p className="error-message">{t('Le document a été enregistré, mais son traitement automatique a échoué. Consultez sa fiche pour le détail.')}</p>}</div><div className="panel pipeline-card"><p className="eyebrow">{t('Traitement automatique')}</p><h2>{t('Un parcours traçable')}</h2><p>{t('OCR, classification, chunks, embeddings puis indexation vectorielle.')}</p>{['Réception du fichier', 'Extraction OCR', 'Classification IA', 'Découpage en chunks', 'Embeddings locaux', 'Indexation vectorielle'].map((item, index) => <div className="mini-step" key={item}><span>{index + 1}</span>{t(item)}<small>{t('À venir')}</small></div>)}</div></div><NavLink className="text-link" to="/back/documents">{t('Retour aux documents')}</NavLink></>;
}
