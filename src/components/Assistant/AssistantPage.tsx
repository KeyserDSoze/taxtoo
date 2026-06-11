import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Sparkles, Loader2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { Card } from '../ui/ui';
import { chatAssistant } from '../../services/ai';
import { isAiConfigured } from '../../services/aiClient';
import { uid } from '../../lib/utils';
import type { ChatMessage } from '../../types';

export default function AssistantPage() {
  const { t } = useTranslation();
  const { settings, taxpayers, properties, calculations, activeFiscalCode } = useStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const aiConfigured = isAiConfigured(settings);

  const context = JSON.stringify({
    taxpayer: taxpayers.find((tp) => tp.fiscalCode === activeFiscalCode) ?? taxpayers[0],
    properties: properties.slice(0, 10),
    calculations: calculations.slice(0, 5),
  });

  const send = async () => {
    if (!input.trim() || !settings || !aiConfigured) return;
    const userMsg: ChatMessage = {
      id: uid('msg'),
      role: 'user',
      content: input.trim(),
      createdAt: new Date().toISOString(),
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const reply = await chatAssistant(next, context, settings);
      setMessages((m) => [
        ...m,
        { id: uid('msg'), role: 'assistant', content: reply, createdAt: new Date().toISOString() },
      ]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          id: uid('msg'),
          role: 'assistant',
          content: e instanceof Error ? e.message : 'Error',
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setBusy(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-180px)]">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-5 h-5 text-sky-500" />
        <h1 className="text-2xl font-bold tracking-tight">{t('assistant.title')}</h1>
      </div>

      {!aiConfigured && (
        <Card className="p-4 text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 mb-3">
          {t('assistant.needsSettings')}
        </Card>
      )}

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {messages.length === 0 && (
          <Card className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
            {t('assistant.empty')}
          </Card>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                m.role === 'user'
                  ? 'bg-gradient-to-br from-sky-500 to-indigo-600 text-white'
                  : 'bg-white dark:bg-slate-900 ring-1 ring-black/5 dark:ring-white/5'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('assistant.thinking')}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <p className="text-[11px] text-slate-400 text-center mt-2">{t('assistant.disclaimer')}</p>

      <div className="flex items-center gap-2 mt-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !busy && send()}
          placeholder={t('assistant.placeholder')}
          disabled={!aiConfigured || busy}
          className="flex-1 rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-sky-500"
        />
        <button
          onClick={send}
          disabled={!aiConfigured || busy || !input.trim()}
          className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white flex items-center justify-center disabled:opacity-50 active:scale-95 transition-transform"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
