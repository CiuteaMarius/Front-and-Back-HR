import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { MessageCircle, Plus, Send, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  createHrMessageRequest,
  fetchRequestMessages,
  fetchRequests,
  replyToHrMessageRequest,
  subscribeToDataChanges,
} from '../../utils/data';
import type { Request, RequestMessage } from '../../types';

function statusClass(status: Request['status']) {
  if (status === 'closed') return 'from-slate-300 to-slate-500 shadow-slate-500/25';
  if (status === 'in_review') return 'from-emerald-300 to-cyan-600 shadow-emerald-500/30';
  return 'from-amber-300 to-orange-500 shadow-amber-500/30';
}

export function ContactHR() {
  const { user } = useAuth();
  const { t, formatDate } = useLanguage();
  const [searchParams] = useSearchParams();
  const highlightedRequestId = searchParams.get('requestId') ?? undefined;
  const [conversations, setConversations] = useState<Request[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [messages, setMessages] = useState<RequestMessage[]>([]);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [subject, setSubject] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId),
    [conversations, selectedId],
  );

  useEffect(() => {
    const loadConversations = async () => {
      const items = (await fetchRequests())
        .filter((request) => request.type === 'hr-message' && request.employeeId === user?.id)
        .sort((first, second) => new Date(second.submittedDate).getTime() - new Date(first.submittedDate).getTime());
      setConversations(items);
      setSelectedId((current) => highlightedRequestId && items.some((item) => item.id === highlightedRequestId)
        ? highlightedRequestId
        : current ?? items[0]?.id);
    };

    loadConversations();
    return subscribeToDataChanges(loadConversations);
  }, [highlightedRequestId, user?.id]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }

    let mounted = true;
    const loadMessages = async () => {
      const items = await fetchRequestMessages(selectedId);
      if (mounted) setMessages(items);
    };

    loadMessages();
    return () => {
      mounted = false;
    };
  }, [selectedId, conversations]);

  const submitNewConversation = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;

    setError('');
    setIsSubmitting(true);
    try {
      const requestId = await createHrMessageRequest({
        employeeId: user.id,
        employeeName: user.name,
        subject,
        message: newMessage,
      });
      setSubject('');
      setNewMessage('');
      setShowNewConversation(false);
      setSelectedId(requestId);
      setConversations(await fetchRequests().then((items) =>
        items.filter((request) => request.type === 'hr-message' && request.employeeId === user.id),
      ));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : t('messageSendFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitReply = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedConversation || selectedConversation.status === 'closed') return;

    setError('');
    setIsSubmitting(true);
    try {
      await replyToHrMessageRequest(selectedConversation.id, reply);
      setReply('');
      setMessages(await fetchRequestMessages(selectedConversation.id));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : t('messageSendFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="grid min-h-[calc(100vh-8rem)] gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <section className="aero-glass overflow-hidden rounded-[2rem] border-2 border-white/55 shadow-2xl shadow-cyan-500/15">
        <div className="border-b border-cyan-200/50 bg-gradient-to-r from-cyan-50/70 to-blue-50/60 p-5 dark:border-cyan-500/20 dark:from-cyan-950/40 dark:to-blue-950/30">
          <div className="flex items-center justify-between gap-3">
            <h1 className="bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-2xl font-black text-transparent dark:from-cyan-300 dark:to-blue-300">
              {t('contactHr')}
            </h1>
            <button
              type="button"
              onClick={() => setShowNewConversation(true)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border-2 border-white/60 bg-gradient-to-b from-cyan-300 to-blue-600 text-white shadow-xl shadow-cyan-500/35 transition hover:scale-105"
              aria-label={t('newConversation')}
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="max-h-[calc(100vh-15rem)] overflow-y-auto p-3">
          {conversations.length === 0 ? (
            <div className="rounded-2xl border border-cyan-200/60 bg-white/45 p-5 text-sm font-bold text-cyan-700 dark:border-cyan-500/25 dark:bg-cyan-950/25 dark:text-cyan-200">
              {t('noHrConversations')}
            </div>
          ) : (
            conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setSelectedId(conversation.id)}
                className={`mb-3 block w-full rounded-2xl border p-4 text-left shadow-lg transition hover:scale-[1.015] ${
                  selectedId === conversation.id
                    ? 'border-cyan-300/80 bg-white/75 shadow-cyan-500/20 dark:border-cyan-300/35 dark:bg-cyan-900/45'
                    : 'border-white/55 bg-white/40 hover:bg-white/60 dark:border-cyan-500/20 dark:bg-cyan-950/25'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="line-clamp-2 font-black text-cyan-900 dark:text-cyan-100">{conversation.details}</p>
                  <span className={`shrink-0 rounded-full bg-gradient-to-b px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-lg ${statusClass(conversation.status)}`}>
                    {conversation.status === 'in_review' ? t('answered') : conversation.status === 'closed' ? t('closed') : t('open')}
                  </span>
                </div>
                <p className="mt-2 text-xs font-bold text-cyan-700 dark:text-cyan-300">
                  {formatDate(new Date(conversation.submittedDate), { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="aero-glass flex min-h-[620px] flex-col overflow-hidden rounded-[2rem] border-2 border-white/55 shadow-2xl shadow-blue-500/15">
        {selectedConversation ? (
          <>
            <div className="border-b border-cyan-200/50 bg-gradient-to-r from-white/70 via-cyan-50/70 to-blue-50/60 p-5 dark:border-cyan-500/20 dark:from-cyan-950/45 dark:via-blue-950/30 dark:to-cyan-900/25">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700 dark:text-white">{t('hrMessage')}</p>
                  <h2 className="mt-1 text-2xl font-black text-cyan-950 dark:text-cyan-100">{selectedConversation.details}</h2>
                </div>
                <span className={`rounded-full bg-gradient-to-b px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white shadow-lg ${statusClass(selectedConversation.status)}`}>
                  {selectedConversation.status === 'in_review' ? t('answered') : selectedConversation.status === 'closed' ? t('closed') : t('open')}
                </span>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {messages.map((message) => {
                const isMine = message.senderProfileId === (user.profileId || user.id);
                return (
                  <div key={message.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[78%] rounded-[1.5rem] border-2 px-5 py-4 shadow-xl ${
                      isMine
                        ? 'border-white/60 bg-gradient-to-br from-cyan-300 to-blue-600 text-white shadow-cyan-500/25'
                        : 'border-cyan-200/60 bg-white/70 text-cyan-900 shadow-cyan-500/10 dark:border-cyan-400/25 dark:bg-cyan-950/50 dark:text-cyan-100'
                    }`}>
                      <p className="whitespace-pre-wrap text-sm font-bold leading-relaxed">{message.body}</p>
                      <p className={`mt-2 text-[11px] font-black ${isMine ? 'text-white/80' : 'text-cyan-600 dark:text-cyan-300'}`}>
                        {formatDate(new Date(message.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={submitReply} className="border-t border-cyan-200/50 bg-white/40 p-5 dark:border-cyan-500/20 dark:bg-cyan-950/25">
              {selectedConversation.status === 'closed' ? (
                <p className="rounded-2xl border border-slate-200/70 bg-white/65 px-4 py-3 text-sm font-black text-slate-600 dark:border-slate-500/30 dark:bg-slate-900/40 dark:text-slate-200">
                  {t('conversationClosed')}
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                  <textarea
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    rows={3}
                    className="aero-input resize-none text-cyan-900 placeholder:text-cyan-700/60 dark:text-cyan-100 dark:placeholder:text-cyan-300/60"
                    placeholder={t('messageReplyPlaceholder')}
                    required
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-white/50 bg-gradient-to-b from-emerald-300 to-cyan-600 px-6 py-3 font-black text-white shadow-xl shadow-emerald-500/30 transition hover:scale-[1.02] disabled:opacity-60"
                  >
                    <Send className="h-5 w-5" />
                    {t('send')}
                  </button>
                </div>
              )}
              {error && <p className="mt-3 rounded-xl border border-red-200/70 bg-red-50/85 px-4 py-3 text-sm font-black text-red-700 dark:border-red-400/25 dark:bg-red-950/30 dark:text-red-200">{error}</p>}
            </form>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <div>
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-[1.75rem] border-2 border-white/60 bg-gradient-to-b from-cyan-200 to-blue-600 shadow-2xl shadow-cyan-500/30">
                <MessageCircle className="h-10 w-10 text-white" />
              </div>
              <p className="font-black text-cyan-800 dark:text-cyan-100">{t('selectConversation')}</p>
            </div>
          </div>
        )}
      </section>

      {showNewConversation && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setShowNewConversation(false)}>
          <form
            onSubmit={submitNewConversation}
            onClick={(event) => event.stopPropagation()}
            className="aero-glass w-full max-w-2xl rounded-[2rem] border-2 border-white/60 p-6 shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-2xl font-black text-transparent dark:from-cyan-300 dark:to-blue-300">
                {t('newConversation')}
              </h2>
              <button
                type="button"
                onClick={() => setShowNewConversation(false)}
                className="rounded-full border border-white/60 bg-white/55 p-2 text-cyan-700 shadow-lg transition hover:scale-105 dark:bg-cyan-950/50 dark:text-cyan-200"
                aria-label={t('close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="aero-input w-full text-cyan-900 placeholder:text-cyan-700/60 dark:text-cyan-100 dark:placeholder:text-cyan-300/60"
                placeholder={t('messageSubjectPlaceholder')}
                required
              />
              <textarea
                value={newMessage}
                onChange={(event) => setNewMessage(event.target.value)}
                rows={7}
                className="aero-input w-full resize-none text-cyan-900 placeholder:text-cyan-700/60 dark:text-cyan-100 dark:placeholder:text-cyan-300/60"
                placeholder={t('messageBodyPlaceholder')}
                required
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-white/50 bg-gradient-to-b from-cyan-300 to-blue-600 px-6 py-3 font-black text-white shadow-xl shadow-cyan-500/35 transition hover:scale-[1.01] disabled:opacity-60"
              >
                <Send className="h-5 w-5" />
                {t('sendToHr')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
