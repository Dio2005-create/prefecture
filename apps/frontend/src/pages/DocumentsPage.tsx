import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronRight, Search, UploadCloud } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { documentService } from '../services/api';
import { Empty, ErrorState, Loading, PageIntro, Pagination, Status } from '../components/ui';

export function DocumentsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useQuery({ queryKey: ['documents', search, page], queryFn: () => documentService.list({ page, limit: 5, search }) });
  return <><PageIntro eyebrow="Fonds documentaire" title="Documents" description="Consultez, filtrez et préparez les archives pour l’indexation." action={<NavLink className="button primary" to="/back/documents/import"><UploadCloud size={17} />Importer</NavLink>} /><div className="toolbar"><label className="search-field"><Search size={18} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Rechercher par titre ou référence" /></label><span className="result-count">{data?.total ?? 0} documents</span></div><div className="panel table-panel">{isLoading ? <Loading /> : isError ? <ErrorState /> : data?.items.length ? <><table><thead><tr><th>Document</th><th>Type</th><th>Catégorie</th><th>Statut</th><th>Date</th><th /></tr></thead><tbody>{data.items.map((doc) => <tr key={doc.id}><td><NavLink className="doc-cell" to={`/back/documents/${doc.id}`}><span className="file-icon">▣</span><span><strong>{doc.titre}</strong><small>{doc.reference ?? 'Référence non renseignée'}</small></span></NavLink></td><td><span className="type-label">{doc.type}</span></td><td>{doc.categorie?.libelle ?? <span className="muted">Non classé</span>}</td><td><Status status={doc.statut} /></td><td>{doc.date ? new Date(doc.date).toLocaleDateString('fr-FR') : '—'}</td><td><NavLink className="row-arrow" to={`/back/documents/${doc.id}`}><ChevronRight size={18} /></NavLink></td></tr>)}</tbody></table><Pagination page={page} totalPages={Math.max(1, Math.ceil((data.total ?? 0) / 5))} onChange={setPage} /></> : <Empty text="Aucun document trouvé." />}</div></>;
}

export function DocumentDetailPage() {
  const id = window.location.pathname.split('/').pop() ?? '';
  const { data: document, isLoading, isError } = useQuery({
    queryKey: ['document', id],
    queryFn: () => documentService.get(id),
    enabled: Boolean(id),
    refetchInterval: (query) => query.state.data?.statut === 'EN_TRAITEMENT' ? 2000 : false,
  });

  if (isLoading) return <Loading />;
  if (isError || !document) return <ErrorState message="Impossible de charger ce document depuis le backend local." />;

  return <>
    <PageIntro eyebrow="Fiche documentaire" title={document.titre} description="Informations et contenu enregistrés dans le fonds documentaire." action={<NavLink className="button" to="/back/documents">Retour aux documents</NavLink>} />
    <div className="detail-grid">
      <section className="panel detail-panel">
        <div className="panel-heading"><div><p className="eyebrow">Métadonnées</p><h2>Informations du document</h2></div><Status status={document.statut} /></div>
        <dl className="metadata-list">
          <div><dt>Type</dt><dd>{document.type}</dd></div>
          <div><dt>Référence</dt><dd>{document.reference ?? 'Non renseignée'}</dd></div>
          <div><dt>Date</dt><dd>{document.date ? new Date(document.date).toLocaleDateString('fr-FR') : 'Non renseignée'}</dd></div>
          <div><dt>Service émetteur</dt><dd>{document.serviceEmetteur ?? 'Non renseigné'}</dd></div>
          <div><dt>Catégorie</dt><dd>{document.categorie?.libelle ?? 'Non classé'}</dd></div>
          <div><dt>Importé le</dt><dd>{new Date(document.createdAt).toLocaleString('fr-FR')}</dd></div>
        </dl>
      </section>
      <section className="panel detail-panel">
        <div className="panel-heading"><div><p className="eyebrow">Traitement</p><h2>Contenu indexé</h2></div><span className="result-count">{document.chunks?.length ?? 0} chunks</span></div>
        {document.contenuTexte ? <p className="document-content">{document.contenuTexte}</p> : <Empty text="Le texte de ce document n’a pas encore été extrait." />}
      </section>
    </div>
  </>;
}
