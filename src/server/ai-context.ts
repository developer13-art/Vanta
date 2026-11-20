import { env } from './env';

export async function getAiAssessment(context: Record<string, unknown>): Promise<{
  verdict: 'BUY' | 'SELL' | 'HOLD' | 'NO_TRADE';
  confidence: number;
  reasoning: string;
}> {
  if (!env.AI_ENABLED) {
    return { verdict: 'NO_TRADE', confidence: 0, reasoning: 'AI disabled' };
  }

  const response = await fetch(`${env.AI_PROVIDER_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.AI_MODEL,
      messages: [
        { role: 'system', content: 'You are a bounded trading analyst. Return JSON only.' },
        { role: 'user', content: JSON.stringify(context) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(env.AI_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`AI request failed: ${response.status}`);
  const data = await response.json();
  // Parse and validate structured output here
  return JSON.parse(data.choices[0].message.content);
}