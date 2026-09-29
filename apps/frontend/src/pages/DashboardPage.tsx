import { NavLink } from 'react-router-dom';
import { FilePlus2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { documentService } from '../services/api';
import { Empty, Loading, PageIntro, Status } from '../components/ui';
import type { Document } from '../types';

function Stat({ label, value, note, accent }: { label: string; value: string | number; note: string; accent?: string }) { return <div className={`stat-card ${accent ?? ''}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>; }
function DocumentRow({ doc }: { doc: Document }) { return <NavLink className="recent-row" to={`/back/documents/${doc.id}`}><span className="file-icon">▣</span><span><strong>{doc.titre}</strong><small>{doc.reference ?? doc.type}</small></span><Status status={doc.statut} /></NavLink>; }

export function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ['documents'], queryFn: () => documentService.list({ page: 1, limit: 100 }), refetchInterval: (query) => query.state.data?.items.some((doc) => doc.statut === 'EN_TRAITEMENT') ? 2000 : false });
  const docs = data?.items ?? [];
  const latest = docs[0];
  const indexedCount = docs.filter((doc) => doc.statut === 'VALIDE' || (doc._count?.chunks ?? 0) > 0).length;
  const count = (status: string) => status === 'EN_TRAITEMENT' ? docs.filter((doc) => doc.statut === status || doc.statut === 'BROUILLON').length : docs.filter((doc) => doc.statut === status).length;
  const steps = ['Upload', 'OCR', 'Classification', 'Chunking', 'Embedding', 'Indexation'];
  const stageOrder = ['OCR', 'CLASSIFICATION', 'CHUNKING', 'EMBEDDING', 'INDEXATION'];
  const currentStage = latest?.etapeTraitement ? stageOrder.indexOf(latest.etapeTraitement) : -1;
  const pipelineStatus = latest?.statut === 'VALIDE' ? steps.map(() => 'Terminé') : latest?.statut === 'ERREUR' ? ['Terminé', latest.erreurTraitement ?? 'Erreur', 'Arrêté', 'Arrêté', 'Arrêté', 'Arrêté'] : latest ? steps.map((_, index) => index === 0 ? 'Terminé' : index - 1 === currentStage ? 'En cours' : index - 1 < currentStage ? 'Terminé' : 'En attente') : steps.map(() => 'En attente');
  return <><PageIntro eyebrow="Pilotage documentaire" title="Vue d’ensemble" description="Un regard clair sur le fonds et les traitements en cours." action={<NavLink className="button primary" to="/back/documents/import"><FilePlus2 size={17} />Importer un document</NavLink>} /><section className="stat-grid"><Stat label="Documents au fonds" value={isLoading ? '—' : data?.total ?? 0} note="Source PostgreSQL" /><Stat label="Indexés" value={isLoading ? '—' : indexedCount} note="Texte et chunks disponibles" accent="green" /><Stat label="En traitement" value={isLoading ? '—' : count('EN_TRAITEMENT')} note="Pipeline documentaire" accent="blue" /><Stat label="En erreur" value={isLoading ? '—' : count('ERREUR')} note="À examiner" accent="red" /></section><section className="dashboard-grid"><div className="panel process-panel"><div className="panel-heading"><div><p className="eyebrow">Chaîne IA</p><h2>Du document à la réponse</h2></div><span className="live-dot">Système local</span></div><div className="pipeline">{steps.map((step, index) => <div className="pipeline-step" key={step}><span>{String(index + 1).padStart(2, '0')}</span><strong>{step}</strong><small>{pipelineStatus[index]}</small></div>)}</div></div><div className="panel"><div className="panel-heading"><div><p className="eyebrow">Activité récente</p><h2>Derniers documents</h2></div><NavLink to="/back/documents" className="text-link">Tout voir</NavLink></div>{isLoading ? <Loading /> : docs.length === 0 ? <Empty text="Aucun document importé." /> : <div className="recent-list">{docs.slice(0, 4).map((doc) => <DocumentRow key={doc.id} doc={doc} />)}</div>}</div></section></>;
}