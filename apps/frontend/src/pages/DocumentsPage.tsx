import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronRight, Search, UploadCloud } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { documentService } from '../services/api';
import { Empty, ErrorState, Loading, PageIntro, Pagination, Status } from '../components/ui';
import { usePreferences } from '../preferences';

export function DocumentsPage() {
  const { t, language } = usePreferences();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useQuery({ queryKey: ['documents', search, page], queryFn: () => documentService.list({ page, limit: 5, search }) });
  return <><PageIntro eyebrow={t('Fonds documentaire')} title={t('Documents')} description={t('Consultez, filtrez et préparez les archives pour l’indexation.')} action={<NavLink className="button primary" to="/back/documents/import"><UploadCloud size={17} />{t('Importer')}</NavLink>} /><div className="toolbar"><label className="search-field"><Search size={18} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={t('Rechercher par titre ou référence')} /></label><span className="result-count">{data?.total ?? 0} {t('documents')}</span></div><div className="panel table-panel">{isLoading ? <Loading /> : isError ? <ErrorState /> : data?.items.length ? <><table><thead><tr><th>{t('Document')}</th><th>{t('Type')}</th><th>{t('Catégorie')}</th><th>{t('Statut')}</th><th>{t('Date')}</th><th /></tr></thead><tbody>{data.items.map((doc) => <tr key={doc.id}><td><NavLink className="doc-cell" to={`/back/documents/${doc.id}`}><span className="file-icon">▣</span><span><strong>{doc.titre}</strong><small>{doc.reference ?? t('Référence non renseignée')}</small></span></NavLink></td><td><span className="type-label">{t(doc.type)}</span></td><td>{doc.categorie?.libelle ? t(doc.categorie.libelle) : <span className="muted">{t('Non classé')}</span>}</td><td><Status status={doc.statut} /></td><td>{doc.date ? new Date(doc.date).toLocaleDateString(language === 'mg' ? 'mg-MG' : 'fr-FR') : '—'}</td><td><NavLink className="row-arrow" to={`/back/documents/${doc.id}`}><ChevronRight size={18} /></NavLink></td></tr>)}</tbody></table><Pagination page={page} totalPages={Math.max(1, Math.ceil((data.total ?? 0) / 5))} onChange={setPage} /></> : <Empty text="Aucun document trouvé." />}</div></>;
}

export function DocumentDetailPage() {
  const { t, language } = usePreferences();
  const id = window.location.pathname.split('/').pop() ?? '';
  const { data: document, isLoading, isError } = useQuery({
    queryKey: ['document', id],
    queryFn: () => documentService.get(id),
    enabled: Boolean(id),
    refetchInterval: (query) => query.state.data?.statut === 'EN_TRAITEMENT' ? 2000 : false,
  });

  if (isLoading) return <Loading />;
  if (isError || !document) return <ErrorState message={t('Impossible de charger ce document depuis le backend local.')} />;

  return <>
    <PageIntro eyebrow={t('Fiche documentaire')} title={document.titre} description={t('Informations et contenu enregistrés dans le fonds documentaire.')} action={<NavLink className="button" to="/back/documents">{t('Retour aux documents')}</NavLink>} />
    <div className="detail-grid">
      <section className="panel detail-panel">
        <div className="panel-heading"><div><p className="eyebrow">{t('Métadonnées')}</p><h2>{t('Informations du document')}</h2></div><Status status={document.statut} /></div>
        <dl className="metadata-list">
          <div><dt>{t('Type')}</dt><dd>{t(document.type)}</dd></div>
          <div><dt>{t('Référence')}</dt><dd>{document.reference ?? t('Non renseignée')}</dd></div>
          <div><dt>{t('Date')}</dt><dd>{document.date ? new Date(document.date).toLocaleDateString(language === 'mg' ? 'mg-MG' : 'fr-FR') : t('Non renseignée')}</dd></div>
          <div><dt>{t('Service émetteur')}</dt><dd>{document.serviceEmetteur ? t(document.serviceEmetteur) : t('Non renseigné')}</dd></div>
          <div><dt>{t('Catégorie')}</dt><dd>{document.categorie?.libelle ? t(document.categorie.libelle) : t('Non classé')}</dd></div>
          <div><dt>{t('Importé le')}</dt><dd>{new Date(document.createdAt).toLocaleString(language === 'mg' ? 'mg-MG' : 'fr-FR')}</dd></div>
        </dl>
      </section>
      <section className="panel detail-panel">
        <div className="panel-heading"><div><p className="eyebrow">{t('Traitement')}</p><h2>{t('Contenu indexé')}</h2></div><span className="result-count">{document.chunks?.length ?? 0} {t('chunks')}</span></div>
        {document.contenuTexte ? <p className="document-content">{document.contenuTexte}</p> : <Empty text="Le texte de ce document n’a pas encore été extrait." />}
      </section>
    </div>
  </>;
}
