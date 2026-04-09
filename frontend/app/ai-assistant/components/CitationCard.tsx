type Citation = {
  content: string;
  location: string;
  score?: number | null;
};

export function CitationCard({ citation, index }: { citation: Citation; index: number }) {
  const filename = citation.location
    ? citation.location.split('/').pop() ?? citation.location
    : '不明なソース';

  return (
    <div className="border border-gray-200 rounded-lg p-3 text-sm bg-gray-50">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
          {index + 1}
        </span>
        <span className="text-gray-500 text-xs font-mono truncate" title={citation.location}>
          {filename}
        </span>
        {citation.score != null && (
          <span className="ml-auto text-xs text-gray-400">
            スコア: {(citation.score * 100).toFixed(0)}%
          </span>
        )}
      </div>
      <p className="text-gray-700 line-clamp-3">{citation.content}</p>
    </div>
  );
}
