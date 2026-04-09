import { CitationCard } from './CitationCard';

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

export function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
          isUser ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'
        }`}
      >
        {isUser ? 'U' : 'AI'}
      </div>
      <div className={`max-w-[75%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-2`}>
        <div
          className={`rounded-2xl px-4 py-2 ${
            isUser
              ? 'bg-blue-500 text-white rounded-tr-sm'
              : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'
          }`}
        >
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
        </div>
        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="w-full">
            <p className="text-xs text-gray-500 mb-1">参照元ドキュメント:</p>
            <div className="flex flex-col gap-2">
              {message.citations.map((citation, i) => (
                <CitationCard key={i} citation={citation} index={i} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
