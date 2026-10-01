import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { NavLink } from 'react-router-dom';
import { Bot, Check, ChevronRight, CircleHelp, History, Languages, MessageCircle, Pencil, Plus, Search, Send, ShieldCheck, Sparkles, Trash2, UserRound, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ragService, searchService } from '../services/api';
import { ErrorState, PageIntro } from '../components/ui';
import type { RagResponse, SearchHit } from '../types';

function Result({ hit, number }: { hit: SearchHit; number?: number }) { return <article className="result-card"><span className="result-number">{String(number ?? '•').padStart(2, '0')}</span><div><div className="result-meta"><span>Document source</span><strong>Score {Math.round(hit.score * 100)} %</strong></div><p>{hit.contenu}</p><NavLink className="text-link" to={`/back/documents/${hit.documentId}`}>Ouvrir le document <ChevronRight size={15} /></NavLink></div></article>; }
export function SearchPage() { const [query, setQuery] = useState(''); const mutation = useMutation({ mutationFn: () => searchService.semantic(query) }); return <><PageIntro eyebrow="Exploration sémantique" title="Chercher par le sens" description="Interrogez le fonds avec vos propres mots, même sans connaître la référence exacte." /><div className="hero-search"><Search size={21} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && query && mutation.mutate()} placeholder="Quels arrêtés concernent les autorisations de construction ?" /><button className="button primary" disabled={!query || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Recherche…' : 'Rechercher'}</button></div>{mutation.isError && <ErrorState />}{mutation.data && <section className="results-section"><div className="results-heading"><h2>{mutation.data.length} résultats pertinents</h2><span>Recherche vectorielle locale</span></div>{mutation.data.map((hit) => <Result key={hit.chunkId} hit={hit} />)}</section>}</>; }
type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string; sources?: SearchHit[] };

const citizenSuggestions = [
	{ label: 'Pièces pour un acte de naissance', icon: Check },
	{ label: 'Suivre ma demande', icon: MessageCircle },
	{ label: 'Prendre rendez-vous', icon: CircleHelp },
];

function ChatAssistant({ staff = false }: { staff?: boolean }) {
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
		onError: () => setMessages((current) => [...current, { id: `${Date.now()}-error`, role: 'assistant', text: 'Je rencontre un problème temporaire. Réessayez dans un instant.' }]),
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
				<p className="eyebrow">{staff ? 'Assistant archives' : 'Aide citoyenne'}</p>
				<h1>{staff ? 'Assistant Archives IA' : 'Votre assistant administratif'}</h1>
				<p>{staff ? 'Interrogez le fonds documentaire avec une réponse sourcée.' : 'Un accompagnement clair pour comprendre vos démarches, en français ou en malgache.'}</p>
			</div>
			<div className="assistant-status"><span className="status-dot" /> Assistant disponible</div>
		</div>
		<div className="assistant-chat-layout">
			<section className="chat-card">
				<header className="chat-header">
					<div className="chat-identity"><span className="chat-avatar"><Sparkles size={18} /></span><div><strong>Assistant e-Préfecture</strong><small><span className="status-dot" /> Répond en français ou en malgache</small></div></div>
					<div className="chat-header-actions"><button className="icon-button" type="button" onClick={() => setShowHistory(true)} aria-label="Voir l’historique" title="Historique des conversations"><History size={17} /></button><button className="icon-button chat-new-button" type="button" onClick={() => { setConversationId(null); setMessages([]); setDraft(''); }} aria-label="Nouvelle conversation" title="Nouvelle conversation"><Plus size={18} /></button></div>
				</header>
				<div className="chat-messages" ref={scrollRef}>
					{messages.length === 0 && <div className="chat-empty"><span className="chat-empty-icon"><Bot size={27} /></span><h2>Bonjour, comment puis-je vous aider ?</h2><p>Je vous guide uniquement pour les démarches de la préfecture.</p><div className="chat-capabilities"><span><Languages size={14} /> FR · MG</span><span><ShieldCheck size={14} /> Réponses sécurisées</span></div></div>}
					{messages.map((message) => <article className={`chat-message ${message.role}`} key={message.id}><span className="message-avatar">{message.role === 'user' ? <UserRound size={15} /> : <Sparkles size={15} />}</span><div className="message-body"><span className="message-author">{message.role === 'user' ? 'Vous' : 'Assistant'}</span><p>{message.text}</p>{message.sources && message.sources.length > 0 && <div className="message-sources"><span>Sources utilisées</span>{message.sources.slice(0, 3).map((source, index) => <span key={`${source.documentId}-${index}`}>Source {index + 1} · {Math.round(source.score * 100)}%</span>)}</div>}</div></article>)}
					{mutation.isPending && <article className="chat-message assistant"><span className="message-avatar"><Sparkles size={15} /></span><div className="message-body"><span className="message-author">Assistant</span><div className="typing-indicator"><i /><i /><i /></div></div></article>}
				</div>
				<form className="chat-composer" onSubmit={submit}><div className="composer-field"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKeyDown} rows={1} placeholder="Écrivez votre question…" aria-label="Message à l'assistant" /><span>Entrée pour envoyer · Maj + Entrée pour une nouvelle ligne</span></div><button className="send-button" type="submit" disabled={!draft.trim() || mutation.isPending} aria-label="Envoyer le message" title="Envoyer"><Send size={18} /></button></form>
			</section>
			<aside className="assistant-help-card"><div className="help-heading"><span className="help-icon"><Sparkles size={17} /></span><div><h2>Aide rapide</h2><p>Commencez avec une question fréquente.</p></div></div><div className="suggestion-list">{citizenSuggestions.map(({ label, icon: Icon }) => <button className="suggestion-card" key={label} type="button" onClick={() => sendMessage(label)} disabled={mutation.isPending}><span className="suggestion-card-icon"><Icon size={17} /></span><span>{label}</span><ChevronRight size={16} /></button>)}</div><div className="help-note"><ShieldCheck size={16} /><p>Vos échanges restent liés à votre session et servent uniquement à vous orienter.</p></div></aside>
		</div>
		{showHistory && <div className="history-overlay" role="presentation" onClick={() => setShowHistory(false)}><aside className="history-drawer" role="dialog" aria-modal="true" aria-labelledby="history-title" onClick={(event) => event.stopPropagation()}><header><div><p className="eyebrow">Conversations</p><h2 id="history-title">Historique du chat</h2></div><button className="icon-button" type="button" onClick={() => setShowHistory(false)} aria-label="Fermer l’historique"><X size={17} /></button></header>{historyQuery.isError ? <p className="history-empty">Impossible de charger l’historique. Réessayez après avoir vérifié la connexion au service.</p> : historyQuery.isLoading ? <p className="history-empty">Chargement de l’historique...</p> : historyQuery.data?.length ? <div className="history-list">{historyQuery.data.map((item) => <div className="history-item" key={item.id}>
					{editingConversationId === item.id ? <form className="history-edit-form" onSubmit={(event) => { event.preventDefault(); renameMutation.mutate({ id: item.id, titre: editingTitle }); }}><input autoFocus maxLength={80} value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} aria-label="Nouveau titre de la discussion" /><button className="icon-button" type="submit" disabled={!editingTitle.trim() || renameMutation.isPending} aria-label="Enregistrer le titre"><Check size={15} /></button><button className="icon-button" type="button" onClick={() => setEditingConversationId(null)} aria-label="Annuler"><X size={15} /></button></form> : <>
						<button className="history-item-open" type="button" onClick={() => { setConversationId(item.id); setMessages(item.messages.flatMap((entry) => { const restored: ChatMessage[] = [{ id: `${entry.id}-user`, role: 'user', text: entry.texte }]; if (entry.reponseGeneree) restored.push({ id: `${entry.id}-assistant`, role: 'assistant', text: entry.reponseGeneree }); return restored; })); setDraft(''); setShowHistory(false); window.setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 0); }}><span className="history-item-icon"><MessageCircle size={15} /></span><span className="history-item-copy"><strong>{item.titre}</strong><small>{new Date(item.updatedAt).toLocaleString('fr-FR')} · {item.messages.length} échange{item.messages.length > 1 ? 's' : ''}</small></span><ChevronRight size={15} /></button>
						<div className="history-actions"><button className="icon-button" type="button" onClick={() => { setEditingConversationId(item.id); setEditingTitle(item.titre); }} aria-label={`Renommer ${item.titre}`} title="Renommer"><Pencil size={14} /></button><button className="icon-button history-delete-button" type="button" onClick={() => { if (window.confirm(`Supprimer la discussion « ${item.titre} » et tous ses messages ?`)) deleteMutation.mutate(item.id); }} aria-label={`Supprimer ${item.titre}`} title="Supprimer" disabled={deleteMutation.isPending}><Trash2 size={14} /></button></div>
					</>}
				</div>)}</div> : <p className="history-empty">Aucune conversation enregistrée.</p>}</aside></div>}
	</div>;
}

export function AssistantPage() { return <ChatAssistant staff />; }
export function CitizenAssistantPage() { return <ChatAssistant />; }
