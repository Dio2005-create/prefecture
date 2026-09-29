import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { UploadCloud } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { documentService } from '../services/api';
import { PageIntro } from '../components/ui';
import type { DocumentType } from '../types';

const types: DocumentType[] = ['ACTE', 'ARRETE', 'COURRIER', 'AUTRE'];
export function ImportPage() {
  const [file, setFile] = useState<File>();
  const [type, setType] = useState<DocumentType>('ARRETE');
  const nav = useNavigate();
  const client = useQueryClient();
  const upload = useMutation({ mutationFn: () => documentService.upload(file!, { type }), onSuccess: async (doc) => { await client.invalidateQueries({ queryKey: ['documents'] }); await client.invalidateQueries({ queryKey: ['document', doc.id] }); nav(`/back/documents/${doc.id}`); } });
  return <><PageIntro eyebrow="Nouveau document" title="Importer une archive" description="Déposez un fichier pour l’inscrire dans le pipeline documentaire." /><div className="import-layout"><div className="panel import-panel"><label className={file ? 'dropzone has-file' : 'dropzone'}><input type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" onChange={(event) => setFile(event.target.files?.[0])} /><UploadCloud size={30} /><strong>{file ? file.name : 'Déposez votre document ici'}</strong><span>{file ? `${Math.round(file.size / 1024)} Ko` : 'PDF, DOCX, PNG ou JPG'}</span></label><div className="form-row"><label>Type de document<select value={type} onChange={(event) => setType(event.target.value as DocumentType)}>{types.map((item) => <option key={item}>{item}</option>)}</select></label></div><button className="button primary full" disabled={!file || upload.isPending} onClick={() => upload.mutate()}>{upload.isPending ? 'Envoi en cours…' : 'Lancer l’import'}</button>{upload.isError && <p className="error-message">Le document a été enregistré, mais son traitement automatique a échoué. Consultez sa fiche pour le détail.</p>}</div><div className="panel pipeline-card"><p className="eyebrow">Traitement automatique</p><h2>Un parcours traçable</h2><p>OCR, classification, chunks, embeddings puis indexation vectorielle.</p>{['Réception du fichier', 'Extraction OCR', 'Classification IA', 'Découpage en chunks', 'Embeddings locaux', 'Indexation vectorielle'].map((item, index) => <div className="mini-step" key={item}><span>{index + 1}</span>{item}<small>À venir</small></div>)}</div></div><NavLink className="text-link" to="/back/documents">Retour aux documents</NavLink></>;
}
