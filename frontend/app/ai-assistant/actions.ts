'use server';

const API_BASE_URL = process.env.API_BASE_URL ?? '';

type Citation = {
  content: string;
  location: string;
  score?: number | null;
};

type RagResponse = {
  answer: string;
  sessionId: string;
  citations: Citation[];
  error?: string;
};

export async function askQuestion(
  query: string,
  sessionId?: string,
): Promise<RagResponse> {
  if (!API_BASE_URL) {
    return {
      answer: '⚠️ API_BASE_URL が設定されていません。.env.local を確認してください。',
      sessionId: '',
      citations: [],
    };
  }

  const res = await fetch(`${API_BASE_URL}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, sessionId }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return {
      answer: `エラーが発生しました (${res.status}): ${body.error ?? '不明なエラー'}`,
      sessionId: sessionId ?? '',
      citations: [],
      error: body.error,
    };
  }

  return res.json() as Promise<RagResponse>;
}
