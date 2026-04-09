'use client';

import { useRef, useState, useTransition } from 'react';
import { ChatMessage } from './components/ChatMessage';
import { askQuestion } from './actions';

type Citation = {
  content: string;
  location: string;
  score?: number | null;
};

type Message = {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
};

export default function AiAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        'こんにちは！Platform Engineering に関する質問にお答えします。\n例: 「新規プロジェクトの立ち上げ手順を教えてください」',
    },
  ]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = input.trim();
    if (!query || isPending) return;

    const userMessage: Message = { role: 'user', content: query };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');

    startTransition(async () => {
      const response = await askQuestion(query, sessionId);
      setSessionId(response.sessionId);

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.answer || 'エラーが発生しました。もう一度お試しください。',
        citations: response.citations,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // 最新メッセージにスクロール
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    });
  };

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 p-4 border-b bg-white">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold">
          AI
        </div>
        <div>
          <h1 className="font-semibold text-gray-900">Platform AI アシスタント</h1>
          <p className="text-xs text-gray-500">Powered by Amazon Bedrock + Claude 3 Haiku</p>
        </div>
        <div className="ml-auto">
          <a
            href="/"
            className="text-sm text-blue-600 hover:underline"
          >
            ← Todoアプリへ
          </a>
        </div>
      </div>

      {/* メッセージ一覧 */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-gray-50">
        {messages.map((message, i) => (
          <ChatMessage key={i} message={message} />
        ))}
        {isPending && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-700">
              AI
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 入力フォーム */}
      <form ref={formRef} onSubmit={handleSubmit} className="p-4 bg-white border-t">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="質問を入力してください... (例: CDKのデプロイ手順)"
            disabled={isPending}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isPending || !input.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded-full text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            送信
          </button>
        </div>
        {sessionId && (
          <p className="mt-1 text-xs text-gray-400 text-center">
            セッション: {sessionId.slice(0, 8)}...
          </p>
        )}
      </form>
    </div>
  );
}
