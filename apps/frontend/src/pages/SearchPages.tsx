import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { NavLink } from 'react-router-dom';
import { Bot, Check, ChevronRight, CircleHelp, History, Languages, MessageCircle, Pencil, Plus, Search, Send, ShieldCheck, Sparkles, Trash2, UserRound, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ragService, searchService } from '../services/api';
import { ErrorState, PageIntro } from '../components/ui';
import type { SearchHit } from '../types';
import { usePreferences } from '../preferences';

function Result({ hit, number }: { hit: SearchHit; number: number; }) {
	const { t } = usePreferences();
	return <article className="result-card">
		<span className="result-number">{String(number).padStart(2, '0')}</span>
		<div>
			<div className="result-meta"><span>{t('Document source')}</span><strong>{t('Score {{score}} %', { score: Math.round(hit.score * 100) })}</strong></div>
			<p>{hit.contenu}</p>
			<NavLink className="text-link" to={`/back/documents/${hit.documentId}`}>{t('Ouvrir le document')} <ChevronRight size={15} /></NavLink>
		</div>
	</article>;
}

export function SearchPage() {
	const { t } = usePreferences();
	const [query, setQuery] = useState('');
	const mutation = useMutation({ mutationFn: (searchQuery: string) => searchService.semantic(searchQuery) });
	const search = (event: FormEvent) => {
		event.preventDefault();
		const searchQuery = query.trim();
		if (searchQuery && !mutation.isPending) mutation.mutate(searchQuery);
	};

	return <>
		<PageIntro
			eyebrow={t('Exploration sémantique')}
			title={t('Chercher par le sens')}
			description={t('Interrogez le fonds avec vos propres mots, même sans connaître la référence exacte.')}
		/>
		<form className="hero-search" onSubmit={search}>
			<Search size={21} />
			<input
				value={query}
				onChange={(event) => setQuery(event.target.value)}
				placeholder={t('Quels arrêtés concernent les autorisations de construction ?')}
				aria-label={t('Votre recherche')}
			/>
			<button className="button primary" type="submit" disabled={!query.trim() || mutation.isPending}>
				{t(mutation.isPending ? 'Recherche…' : 'Rechercher')}
			</button>
		</form>
		{mutation.isError && <ErrorState message="La recherche a échoué. Vérifiez la connexion au service et réessayez." />}
		{mutation.isPending && <p role="status">{t('Recherche en cours…')}</p>}
		{mutation.data && <section className="results-section">
			<div className="results-heading">
				<h2>{t('{{count}} résultat(s) pertinent(s)', { count: mutation.data.length })}</h2>
				<span>{t('Recherche vectorielle locale')}</span>
			</div>
			{mutation.data.length === 0
				? <p>{t('Aucun résultat trouvé. Essayez d’autres mots-clés.')}</p>
				: mutation.data.map((hit, index) => <Result key={hit.chunkId} hit={hit} number={index + 1} />)}
		</section>}
	</>;
}
type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string; sources?: SearchHit[] };

const citizenSuggestions = [
	{ label: 'Pièces pour un acte de naissance', icon: Check },
	{ label: 'Suivre ma demande', icon: MessageCircle },
	{ label: 'Prendre rendez-vous', icon: CircleHelp },
];

function ChatAssistant({ staff = false }: { staff?: boolean }) {
	const { t, language } = usePreferences();
	const [draft, setDraft] = useState('');
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [conversationId, setConversationId] = useState<string | null>(null);
	const [showHistory, setShowHistory] = useState(false);
	const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
	const [editingTitle, setEditingTitle] = useState('');
	const queryClient = useQueryClient();
	const scrollRef = useRef<HTMLDivElement>(null);
	const mutation = useMutation({
		mutationFn: ({ question, activeId }: { question: string; activeId: string | null }) => ragService.ask(question, 5, activeId ?? undefined),
		onSuccess: (answer, question) => {
			setConversationId(answer.conversationId);
			setMessages((current) => [...current, { id: `${Date.now()}-assistant`, role: 'assistant', text: answer.reponse, sources: answer.sources }]);
			void queryClient.invalidateQueries({ queryKey: ['rag-history'] });
			window.setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 0);
		},
		onError: () => setMessages((current) => [...current, { id: `${Date.now()}-error`, role: 'assistant', text: t('Je rencontre un problème temporaire. Réessayez dans un instant.') }]),
	});
	const historyQuery = useQuery({ queryKey: ['rag-history'], queryFn: ragService.history, enabled: showHistory });
	const renameMutation = useMutation({
		mutationFn: ({ id, titre }: { id: string; titre: string }) => ragService.rename(id, titre),
		onSuccess: () => {
			setEditingConversationId(null);
			void queryClient.invalidateQueries({ queryKey: ['rag-history'] });
		},
	});
	const deleteMutation = useMutation({
		mutationFn: (id: string) => ragService.remove(id),
		onSuccess: (_result, deletedId) => {
			void queryClient.invalidateQueries({ queryKey: ['rag-history'] });
			if (conversationId === deletedId) {
				setConversationId(null);
				setMessages([]);
			}
		},
	});

	const sendMessage = (value = draft) => {
		const question = value.trim();
		if (!question || mutation.isPending) return;
		setMessages((current) => [...current, { id: `${Date.now()}-user`, role: 'user', text: question }]);
		setDraft('');
		mutation.mutate({ question, activeId: conversationId });
	};

	const submit = (event: FormEvent) => { event.preventDefault(); sendMessage(); };
	const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); }
	};

	return <div className="assistant-page">
		<div className="assistant-page-heading">
			<div>
				<p className="eyebrow">{t(staff ? 'Assistant archives' : 'Aide citoyenne')}</p>
				<h1>{t(staff ? 'Assistant Archives IA' : 'Votre assistant administratif')}</h1>
				<p>{t(staff ? 'Interrogez le fonds documentaire avec une réponse sourcée.' : 'Un accompagnement clair pour comprendre vos démarches, en français ou en malgache.')}</p>
			</div>
			<div className="assistant-status"><span className="status-dot" /> {t('Assistant disponible')}</div>
		</div>
		<div className="assistant-chat-layout">
			<section className="chat-card">
				<header className="chat-header">
					<div className="chat-identity"><span className="chat-avatar"><Sparkles size={18} /></span><div><strong>{t('Assistant e-Servisy')}</strong><small><span className="status-dot" /> {t('Répond en français ou en malgache')}</small></div></div>
					<div className="chat-header-actions"><button className="icon-button" type="button" onClick={() => setShowHistory(true)} aria-label={t('Voir l’historique')} title={t('Historique des conversations')}><History size={17} /></button><button className="icon-button chat-new-button" type="button" onClick={() => { setConversationId(null); setMessages([]); setDraft(''); }} aria-label={t('Nouvelle conversation')} title={t('Nouvelle conversation')}><Plus size={18} /></button></div>
				</header>
				<div className="chat-messages" ref={scrollRef}>
					{messages.length === 0 && <div className="chat-empty"><span className="chat-empty-icon"><Bot size={27} /></span><h2>{t('Bonjour, comment puis-je vous aider ?')}</h2><p>{t('Je vous guide uniquement pour les démarches de la préfecture.')}</p><div className="chat-capabilities"><span><Languages size={14} /> FR · MG</span><span><ShieldCheck size={14} /> {t('Réponses sécurisées')}</span></div></div>}
					{messages.map((message) => <article className={`chat-message ${message.role}`} key={message.id}><span className="message-avatar">{message.role === 'user' ? <UserRound size={15} /> : <Sparkles size={15} />}</span><div className="message-body"><span className="message-author">{t(message.role === 'user' ? 'Vous' : 'Assistant')}</span><p>{message.text}</p>{message.sources && message.sources.length > 0 && <div className="message-sources"><span>{t('Sources utilisées')}</span>{message.sources.slice(0, 3).map((source, index) => <span key={`${source.documentId}-${index}`}>{t('Source {{number}}', { number: index + 1 })} · {Math.round(source.score * 100)}%</span>)}</div>}</div></article>)}
					{mutation.isPending && <article className="chat-message assistant"><span className="message-avatar"><Sparkles size={15} /></span><div className="message-body"><span className="message-author">{t('Assistant')}</span><div className="typing-indicator"><i /><i /><i /></div></div></article>}
				</div>
				<form className="chat-composer" onSubmit={submit}><div className="composer-field"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKeyDown} rows={1} placeholder={t('Écrivez votre question…')} aria-label={t("Message à l'assistant")} /><span>{t('Entrée pour envoyer · Maj + Entrée pour une nouvelle ligne')}</span></div><button className="send-button" type="submit" disabled={!draft.trim() || mutation.isPending} aria-label={t('Envoyer le message')} title={t('Envoyer')}><Send size={18} /></button></form>
			</section>
			<aside className="assistant-help-card"><div className="help-heading"><span className="help-icon"><Sparkles size={17} /></span><div><h2>{t('Aide rapide')}</h2><p>{t('Commencez avec une question fréquente.')}</p></div></div><div className="suggestion-list">{citizenSuggestions.map(({ label, icon: Icon }) => <button className="suggestion-card" key={label} type="button" onClick={() => sendMessage(t(label))} disabled={mutation.isPending}><span className="suggestion-card-icon"><Icon size={17} /></span><span>{t(label)}</span><ChevronRight size={16} /></button>)}</div><div className="help-note"><ShieldCheck size={16} /><p>{t('Vos échanges restent liés à votre session et servent uniquement à vous orienter.')}</p></div></aside>
		</div>
		{showHistory && <div className="history-overlay" role="presentation" onClick={() => setShowHistory(false)}><aside className="history-drawer" role="dialog" aria-modal="true" aria-labelledby="history-title" onClick={(event) => event.stopPropagation()}><header><div><p className="eyebrow">{t('Conversations')}</p><h2 id="history-title">{t('Historique du chat')}</h2></div><button className="icon-button" type="button" onClick={() => setShowHistory(false)} aria-label={t('Fermer l’historique')}><X size={17} /></button></header>{historyQuery.isError ? <p className="history-empty">{t('Impossible de charger l’historique. Réessayez après avoir vérifié la connexion au service.')}</p> : historyQuery.isLoading ? <p className="history-empty">{t('Chargement de l’historique...')}</p> : historyQuery.data?.length ? <div className="history-list">{historyQuery.data.map((item) => <div className="history-item" key={item.id}>
					{editingConversationId === item.id ? <form className="history-edit-form" onSubmit={(event) => { event.preventDefault(); renameMutation.mutate({ id: item.id, titre: editingTitle }); }}><input autoFocus maxLength={80} value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} aria-label={t('Nouveau titre de la discussion')} /><button className="icon-button" type="submit" disabled={!editingTitle.trim() || renameMutation.isPending} aria-label={t('Enregistrer le titre')}><Check size={15} /></button><button className="icon-button" type="button" onClick={() => setEditingConversationId(null)} aria-label={t('Annuler')}><X size={15} /></button></form> : <>
						<button className="history-item-open" type="button" onClick={() => { setConversationId(item.id); setMessages(item.messages.flatMap((entry) => { const restored: ChatMessage[] = [{ id: `${entry.id}-user`, role: 'user', text: entry.texte }]; if (entry.reponseGeneree) restored.push({ id: `${entry.id}-assistant`, role: 'assistant', text: entry.reponseGeneree }); return restored; })); setDraft(''); setShowHistory(false); window.setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 0); }}><span className="history-item-icon"><MessageCircle size={15} /></span><span className="history-item-copy"><strong>{item.titre}</strong><small>{new Date(item.updatedAt).toLocaleString(language === 'mg' ? 'mg-MG' : 'fr-FR')} · {t('échange(s)', { count: item.messages.length })}</small></span><ChevronRight size={15} /></button>
						<div className="history-actions"><button className="icon-button" type="button" onClick={() => { setEditingConversationId(item.id); setEditingTitle(item.titre); }} aria-label={t('Renommer {{title}}', { title: item.titre })} title={t('Renommer')}><Pencil size={14} /></button><button className="icon-button history-delete-button" type="button" onClick={() => { if (window.confirm(t('Supprimer la discussion « {{title}} » et tous ses messages ?', { title: item.titre }))) deleteMutation.mutate(item.id); }} aria-label={t('Supprimer {{title}}', { title: item.titre })} title={t('Supprimer')} disabled={deleteMutation.isPending}><Trash2 size={14} /></button></div>
					</>}
				</div>)}</div> : <p className="history-empty">{t('Aucune conversation enregistrée.')}</p>}</aside></div>}
	</div>;
}

export function AssistantPage() { return <ChatAssistant staff />; }
export function CitizenAssistantPage() { return <ChatAssistant />; }
