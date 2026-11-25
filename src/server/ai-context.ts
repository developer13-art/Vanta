import { env } from './env';

export interface AiMarketDecision {
  symbol: string;
  verdict: 'BUY' | 'SELL' | 'HOLD' | 'NO_TRADE';
  confidence: number;
  reasoning: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getChatCompletionsUrl(providerUrl: string): string {
  const normalizedUrl = providerUrl.replace(/\/+$/, '');
  return normalizedUrl.endsWith('/chat/completions')
    ? normalizedUrl
    : `${normalizedUrl}/chat/completions`;
}

export function isAiEnabled(): boolean {
  return env.AI_ENABLED;
}

export async function getAiAssessments(context: {
  timeframe: string;
  bot: Record<string, unknown>;
  account: Record<string, unknown>;
  markets: Array<Record<string, unknown> & { symbol: string }>;
}): Promise<AiMarketDecision[]> {
  if (!env.AI_ENABLED || !env.AI_PROVIDER_URL || !env.AI_API_KEY || !env.AI_MODEL) {
    throw new Error('AI assessment is disabled or not configured');
  }

  const response = await fetch(getChatCompletionsUrl(env.AI_PROVIDER_URL), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.AI_MODEL,
      messages: [
        {
          role: 'system',
          content: [
            'You are an adaptive market-structure analyst. Analyze the supplied closed OHLC candles and indicators across all provided timeframes (1m, 5m, 15m, 1h), together with the live broker quote.',
            'Use price structure, swing highs/lows, momentum, trend alignment, and volatility to choose a direction; do not follow a named or fixed strategy.',
            'When there is a clear actionable BUY or SELL setup, return that direction directly; there is no separate human confirmation step. Return HOLD or NO_TRADE only when the evidence is mixed, the setup is not actionable, or the supplied data is insufficient.',
            'Return one decision for every supplied symbol in JSON: {"decisions":[{"symbol":"...","verdict":"BUY|SELL|HOLD|NO_TRADE","confidence":0.0,"reasoning":"..."}]}.',
            'Never return position size, leverage, stop changes, or instructions outside this schema.',
            'Use NO_TRADE when evidence is mixed, data is insufficient, or volatility makes direction uncertain.',
            'Do not treat volatility alone as a buy or sell signal. Reasoning must be concise and under 500 characters.',
          ].join(' '),
        },
        { role: 'user', content: JSON.stringify(context) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(env.AI_TIMEOUT_MS),
  });

  if (!response.ok) {
    const hints: Record<number, string> = {
      400: ' Check that AI_MODEL supports chat completions and JSON responses.',
      401: ' Check the AI_API_KEY configured on the server.',
      403: ' Check that the AI_API_KEY is authorized to use AI_MODEL.',
      404: ' Check AI_PROVIDER_URL and AI_MODEL.',
      429: ' The AI provider rate limit or account quota was reached.',
    };
    const hint = hints[response.status] ?? (response.status >= 500 ? ' The AI provider is temporarily unavailable.' : '');
    throw new Error(`AI request failed: ${response.status}.${hint}`);
  }
  const responseBody: unknown = await response.json();
  if (!isRecord(responseBody) || !Array.isArray(responseBody.choices)) {
    throw new Error('AI response is missing choices');
  }
  const firstChoice = responseBody.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)
    || typeof firstChoice.message.content !== 'string') {
    throw new Error('AI response is missing message content');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(firstChoice.message.content);
  } catch {
    throw new Error('AI response is not valid JSON');
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.decisions)) {
    throw new Error('AI response is missing decisions');
  }

  const requestedSymbols = new Set(context.markets.map((market) => market.symbol));
  const seenSymbols = new Set<string>();
  const decisions = parsed.decisions.map((rawDecision): AiMarketDecision => {
    if (!isRecord(rawDecision)
      || typeof rawDecision.symbol !== 'string'
      || !requestedSymbols.has(rawDecision.symbol)
      || seenSymbols.has(rawDecision.symbol)
      || !['BUY', 'SELL', 'HOLD', 'NO_TRADE'].includes(String(rawDecision.verdict))
      || typeof rawDecision.confidence !== 'number'
      || !Number.isFinite(rawDecision.confidence)
      || rawDecision.confidence < 0
      || rawDecision.confidence > 1
      || typeof rawDecision.reasoning !== 'string'
      || rawDecision.reasoning.trim().length === 0
      || rawDecision.reasoning.length > 500) {
      throw new Error('AI response contains an invalid or unexpected market decision');
    }
    seenSymbols.add(rawDecision.symbol);
    return {
      symbol: rawDecision.symbol,
      verdict: rawDecision.verdict as AiMarketDecision['verdict'],
      confidence: rawDecision.confidence,
      reasoning: rawDecision.reasoning.trim(),
    };
  });

  if (seenSymbols.size !== requestedSymbols.size) {
    throw new Error('AI response does not include every requested symbol');
  }
  return decisions;
}
