import { query } from './db';
import { logger } from './logger';
import { fetchBrokerCandles, fetchBrokerQuotes, getBrokerHealth } from './broker-providers';
import type { BrokerLiveQuote } from './broker-providers';
import type { BrokerProvider } from '../shared/types';
import { checkEntry } from './risk-engine';
import { analyzeMarket } from './strategy';
import type { Candle, StrategySignal } from './strategy';
import { closePosition, submitOrder } from './execution';
import { isHalted } from './admin-emergency';
import { getAiAssessments, isAiEnabled } from './ai-context';
import { chargeAiAssessment } from './billing';
import { RATES } from './credit-rates';
import { AppError } from './errors';

const TIMEFRAME = '1m' as const;
const CANDLE_SECONDS = 60;
const CANDLE_COUNT = 150;

interface BotTick {
  id: string;
  user_id: string;
  broker_account_id: string;
  name: string;
  state: string;
  is_live: boolean;
  account_mode: 'demo' | 'live';
  broker_name: string;
  trading_enabled: boolean;
  connection_provider: BrokerProvider;
  provider_account_id: string | null;
  strategy_version_id: string;
  strategy_name: string;
  strategy_params: Record<string, unknown>;
  lot_size: string;
  entry_batch_size: number;
  max_concurrent_positions: number;
  daily_loss_limit: string;
  drawdown_limit: string;
  margin_utilization_limit: string;
  max_spread_points: number | null;
  cooldown_seconds: number;
  trading_sessions: Record<string, Array<[string, string]>> | null;
  peak_equity: string;
}

interface TickInstrument {
  id: string;
  broker_symbol: string;
  canonical_symbol: string;
  category: string;
  digits: number | null;
  min_volume: string | null;
  max_volume: string | null;
  volume_step: string | null;
  is_tradable: boolean;
}

function currentCandleBucket(): number {
  return Math.floor(Date.now() / (CANDLE_SECONDS * 1000)) * CANDLE_SECONDS;
}

function reasonText(reason: string): string {
  const messages: Record<string, string> = {
    bullish_cross: 'The market showed a bullish EMA crossover on the latest closed candle.',
    bearish_cross: 'The market showed a bearish EMA crossover on the latest closed candle.',
    no_cross: 'No EMA crossover was detected on the latest closed candle.',
    insufficient_history: 'Waiting for enough 1-minute market history to analyze this instrument.',
    invalid_params: 'The bot configuration is invalid; review its settings.',
    spread_too_wide: 'The current spread is too wide for this bot.',
    ai_assessment: 'AI analysis recommends this direction; independent risk checks still apply.',
    ai_disabled: 'AI analysis is not enabled on this server; no trade was placed.',
    ai_assessment_unavailable: 'AI analysis could not be completed; no trade was placed.',
    insufficient_ai_credits: 'The wallet does not have enough credits for an AI assessment.',
    invalid_lot_size: 'The configured lot size is invalid.',
    exceeds_max_lot: 'The configured lot size exceeds the platform or broker limit.',
    max_concurrent_positions_reached: 'The bot has reached its maximum number of open positions.',
    aggregate_exposure_exceeded: 'The bot would exceed its aggregate exposure limit.',
    daily_loss_limit_reached: 'The bot has reached its daily loss limit.',
    drawdown_limit_reached: 'The bot has reached its drawdown limit.',
    margin_utilization_exceeded: 'Account margin utilization is above the configured limit.',
    no_free_margin: 'The broker account has no free margin available.',
    spread_too_high: 'The current spread exceeds the configured maximum.',
    outside_trading_session: 'The current time is outside this bot’s configured trading session.',
    broker_not_tradable: 'The broker reports that this instrument cannot be traded on this account.',
    broker_not_connected: 'The broker account is not ready for trading.',
    live_trading_not_authorized: 'Live trading has not been authorized for this broker account.',
    account_mode_mismatch: 'The bot and broker account modes do not match; no order was placed.',
    quote_unavailable: 'A current broker quote is unavailable; no order was placed.',
    stale_quote: 'The broker quote is stale; no order was placed.',
    market_closed: 'The broker reports that this market is closed.',
    market_trade_disabled: 'The broker does not currently allow new positions on this instrument.',
    side_not_allowed: 'The broker does not currently allow this order side on this instrument.',
    spread_unavailable: 'The broker did not provide spread data, so the configured spread limit could not be verified.',
    volume_below_minimum: 'The configured lot size is below the broker’s minimum volume.',
    volume_above_maximum: 'The configured lot size exceeds the broker’s maximum volume.',
    invalid_volume_step: 'The configured lot size does not match the broker’s volume step.',
    market_data_unavailable: 'Market data could not be loaded from the broker.',
    cooldown_active: 'The bot is waiting for its configured cooldown before another entry.',
    bot_not_running: 'The bot was paused before this order could be submitted.',
    position_already_open: 'A position is already open in the direction of this signal; no duplicate entry was placed.',
    opposite_position_close_failed: 'An existing opposite position could not be closed, so no new order was placed.',
    emergency_control_active: 'New bot trading is halted by an active emergency control.',
  };
  return messages[reason] ?? reason.replace(/_/g, ' ');
}

async function saveDecision(args: {
  bot: BotTick;
  instrument: TickInstrument;
  candleTime: number;
  signal: StrategySignal;
  summary: string;
  riskOutcome?: 'approved' | 'rejected' | null;
  riskReason?: string | null;
  structuredOutput?: Record<string, unknown>;
  quote?: Record<string, unknown> | null;
}): Promise<string> {
  const existing = await query<{ id: string }>(
    `SELECT id FROM ai_decisions
      WHERE bot_id=$1 AND broker_symbol_id=$2
        AND input_summary->>'candleTime'=$3
      LIMIT 1`,
    [args.bot.id, args.instrument.id, String(args.candleTime)],
  );
  const values = [
    args.signal.verdict,
    args.signal.confidence,
    args.summary,
    JSON.stringify({
      ...args.signal,
      quote: args.quote ?? null,
      ...(args.structuredOutput ?? {}),
    }),
    args.riskOutcome ?? null,
    args.riskReason ?? null,
    JSON.stringify({ timeframe: TIMEFRAME, candleTime: args.candleTime }),
  ];
  if (existing.rows[0]) {
    await query(
      `UPDATE ai_decisions
          SET verdict=$2, confidence=$3, reasoning_summary=$4, structured_output=$5::jsonb,
              risk_outcome=$6, risk_reason=$7, input_summary=$8::jsonb
        WHERE id=$1`,
      [existing.rows[0].id, ...values],
    );
    return existing.rows[0].id;
  }

  const inserted = await query<{ id: string }>(
    `INSERT INTO ai_decisions
       (bot_id, broker_symbol_id, strategy_version_id, verdict, confidence,
        reasoning_summary, structured_output, risk_outcome, risk_reason,
        input_summary, latency_ms)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0)
     RETURNING id`,
    [
      args.bot.id,
      args.instrument.id,
      args.bot.strategy_version_id,
      ...values.slice(0, 7),
    ],
  );
  const decisionId = inserted.rows[0]?.id;
  if (!decisionId) throw new Error('Failed to persist bot decision');
  return decisionId;
}

function quoteEntryBlock(
  quote: Awaited<ReturnType<typeof fetchBrokerQuotes>>[number] | undefined,
  side: 'buy' | 'sell',
): string | null {
  if (!quote || quote.status !== 'ok' || quote.bid === null || quote.ask === null) return 'quote_unavailable';
  if (quote.stale) return 'stale_quote';
  if (quote.marketOpen === false) return 'market_closed';
  if (quote.tradeMode === 'disabled' || quote.tradeMode === 'closeOnly') return 'market_trade_disabled';
  if ((side === 'buy' && quote.tradeMode === 'shortOnly')
    || (side === 'sell' && quote.tradeMode === 'longOnly')) return 'side_not_allowed';
  return null;
}

function volumeBlock(instrument: TickInstrument, volume: number): string | null {
  const minimum = instrument.min_volume === null ? null : Number(instrument.min_volume);
  const maximum = instrument.max_volume === null ? null : Number(instrument.max_volume);
  const step = instrument.volume_step === null ? null : Number(instrument.volume_step);
  if (minimum !== null && volume < minimum - 1e-8) return 'volume_below_minimum';
  if (maximum !== null && volume > maximum + 1e-8) return 'volume_above_maximum';
  if (step !== null && step > 0) {
    const steps = (volume - (minimum ?? 0)) / step;
    if (Math.abs(steps - Math.round(steps)) > 1e-6) return 'invalid_volume_step';
  }
  return null;
}

async function saveNoTrade(
  bot: BotTick,
  instrument: TickInstrument,
  candleTime: number,
  reason: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  const text = reasonText(reason);
  await saveDecision({
    bot,
    instrument,
    candleTime,
    signal: { verdict: 'NO_TRADE', confidence: 0, reason, meta: details },
    summary: text,
    riskOutcome: 'rejected',
    riskReason: reason,
  });
  logger.info({ botId: bot.id, symbol: instrument.broker_symbol, reason }, 'Bot skipped an instrument');
}

export async function runBotTick(botId: string): Promise<void> {
  const botResult = await query<BotTick>(
    `SELECT b.id, b.user_id, b.broker_account_id, b.name, b.state, b.is_live,
            b.strategy_params, b.lot_size, b.entry_batch_size,
            b.max_concurrent_positions, b.daily_loss_limit, b.drawdown_limit,
            b.margin_utilization_limit, b.max_spread_points, b.cooldown_seconds,
            b.trading_sessions, b.peak_equity,
            sv.id AS strategy_version_id, sv.name AS strategy_name,
            ba.mode AS account_mode, ba.broker_name, ba.trading_enabled,
            ba.connection_provider, ba.provider_account_id
       FROM bots b
       JOIN strategy_versions sv ON sv.id = b.strategy_version_id
       JOIN broker_accounts ba ON ba.id = b.broker_account_id
      WHERE b.id = $1`,
    [botId],
  );
  const bot = botResult.rows[0];
  if (!bot || bot.state !== 'running') return;

  const instrumentResult = await query<TickInstrument>(
    `SELECT s.id, s.broker_symbol, s.canonical_symbol, s.category, s.digits,
            s.min_volume, s.max_volume, s.volume_step, s.is_tradable
       FROM bot_instruments bi
       JOIN broker_symbols s ON s.id = bi.broker_symbol_id
      WHERE bi.bot_id = $1
      ORDER BY s.canonical_symbol`,
    [bot.id],
  );
  const instruments = instrumentResult.rows;
  const candleTimeFallback = currentCandleBucket();
  if (instruments.length === 0) {
    await query(`UPDATE bots SET last_run_at=now() WHERE id=$1`, [bot.id]);
    logger.warn({ botId: bot.id }, 'Running bot has no instruments to analyze');
    return;
  }
  const providerAccountId = bot.provider_account_id;
  if (!providerAccountId) {
    for (const instrument of instruments) {
      await saveNoTrade(bot, instrument, candleTimeFallback, 'broker_not_connected');
    }
    await query(`UPDATE bots SET last_run_at=now() WHERE id=$1`, [bot.id]);
    return;
  }

  const tradableInstruments = instruments.filter((instrument) => instrument.is_tradable);
  const candleResults = await Promise.all(tradableInstruments.map(async (instrument) => {
    try {
      const candles = await fetchBrokerCandles(
        bot.connection_provider,
        providerAccountId,
        instrument.broker_symbol,
        TIMEFRAME,
        CANDLE_COUNT,
      );
      const closedCandles = candles
        .filter((candle) => candle.time + CANDLE_SECONDS <= Math.floor(Date.now() / 1000))
        .sort((a, b) => a.time - b.time);
      return { instrument, candles: closedCandles, error: null as string | null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Market data request failed.';
      logger.warn({ err: error, botId: bot.id, symbol: instrument.broker_symbol }, 'Bot market data request failed');
      return { instrument, candles: [], error: message.slice(0, 300) };
    }
  }));
  const candleById = new Map(candleResults.map((result) => [result.instrument.id, result]));
  const symbolsWithCandles = candleResults.filter((result) => result.candles.length > 0);

  let quotes: Awaited<ReturnType<typeof fetchBrokerQuotes>> = [];
  let quoteError: string | null = null;
  if (symbolsWithCandles.length > 0) {
    try {
      quotes = await fetchBrokerQuotes(
        bot.connection_provider,
        providerAccountId,
        symbolsWithCandles.map(({ instrument }) => ({
          symbol: instrument.broker_symbol,
          digits: instrument.digits,
        })),
      );
    } catch (error) {
      quoteError = error instanceof Error ? error.message : 'Broker quote request failed.';
      logger.warn({ err: error, botId: bot.id }, 'Bot quote request failed');
    }
  }
  const quoteBySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));

  let health: Awaited<ReturnType<typeof getBrokerHealth>> | null = null;
  if (symbolsWithCandles.length > 0) {
    try {
      health = await getBrokerHealth(bot.connection_provider, providerAccountId);
    } catch (error) {
      logger.warn({ err: error, botId: bot.id }, 'Bot broker health request failed');
    }
  }

  let dailyStartBalance = 0;
  if (health?.info) {
    await query(
      `UPDATE broker_accounts
          SET status='connected', account_currency=$2, account_balance=$3,
              account_equity=$4, account_free_margin=$5, account_used_margin=$6,
              account_margin_level=$7, account_leverage=$8, is_hedging=$9,
              last_health_check_at=now(), last_health_status='ok', last_error=NULL, updated_at=now()
        WHERE id=$1`,
      [
        bot.broker_account_id, health.info.currency, health.info.balance, health.info.equity,
        health.info.freeMargin, health.info.usedMargin, health.info.marginLevel,
        health.info.leverage, health.info.isHedging,
      ],
    );
    const riskBaseline = await query<{ peak_equity: string; daily_start_balance: string }>(
      `UPDATE bots
          SET peak_equity=GREATEST(
                peak_equity,
                COALESCE($2::numeric, 0::numeric),
                COALESCE($3::numeric, 0::numeric)
              ),
              daily_start_balance=CASE
                WHEN $3::numeric IS NOT NULL AND daily_balance_date IS DISTINCT FROM CURRENT_DATE THEN $3::numeric
                ELSE daily_start_balance
              END,
              daily_balance_date=CASE
                WHEN $3::numeric IS NOT NULL AND daily_balance_date IS DISTINCT FROM CURRENT_DATE THEN CURRENT_DATE
                ELSE daily_balance_date
              END
        WHERE id=$1
        RETURNING peak_equity, daily_start_balance`,
      [bot.id, health.info.equity, health.info.balance],
    );
    dailyStartBalance = Number(riskBaseline.rows[0]?.daily_start_balance ?? 0);
  }

  const alreadyAnalyzed = new Set<string>();
  const assessmentTargets: Array<{
    instrument: TickInstrument;
    candles: Candle[];
    candleTime: number;
    quote: BrokerLiveQuote;
  }> = [];
  for (const instrument of instruments) {
    if (!instrument.is_tradable) continue;
    const candles = candleById.get(instrument.id)?.candles ?? [];
    if (candles.length === 0) continue;
    const latestCandle = candles[candles.length - 1];
    if (!latestCandle) continue;
    const candleTime = latestCandle.time;
    const existing = await query(
      `SELECT id FROM ai_decisions
        WHERE bot_id=$1 AND broker_symbol_id=$2
          AND input_summary->>'candleTime'=$3
        LIMIT 1`,
      [bot.id, instrument.id, String(candleTime)],
    );
    if (existing.rows.length > 0) {
      alreadyAnalyzed.add(instrument.id);
      continue;
    }

    const quote = quoteBySymbol.get(instrument.broker_symbol);
    if (candles.length < 50 || !health || health.status !== 'connected' || !health.info
      || quoteError || !quote || quote.status !== 'ok' || quote.bid === null || quote.ask === null
      || quote.stale || quote.marketOpen === false || quote.tradeMode === 'disabled' || quote.tradeMode === 'closeOnly') {
      continue;
    }
    assessmentTargets.push({ instrument, candles, candleTime, quote });
  }

  const assessmentSignals = new Map<string, StrategySignal>();
  let assessmentFailureReason: string | null = null;
  if (assessmentTargets.length > 0) {
    if (!isAiEnabled()) {
      assessmentFailureReason = 'ai_disabled';
    } else {
      const wallet = await query<{ available_credits: number }>(
        `SELECT available_credits FROM wallets WHERE user_id=$1`,
        [bot.user_id],
      );
      if ((wallet.rows[0]?.available_credits ?? 0) < RATES.aiAssessment) {
        assessmentFailureReason = 'insufficient_ai_credits';
      } else {
        let aiDecisions: Awaited<ReturnType<typeof getAiAssessments>> | null = null;
        try {
          aiDecisions = await getAiAssessments({
            timeframe: TIMEFRAME,
            bot: {
              name: bot.name,
              lotSize: Number(bot.lot_size),
              maxConcurrentPositions: bot.max_concurrent_positions,
              dailyLossLimit: Number(bot.daily_loss_limit),
              drawdownLimit: Number(bot.drawdown_limit),
              marginUtilizationLimit: Number(bot.margin_utilization_limit),
              maxSpreadPoints: bot.max_spread_points,
            },
            account: {
              mode: bot.account_mode,
              currency: health?.info?.currency,
              balance: health?.info?.balance,
              equity: health?.info?.equity,
              freeMargin: health?.info?.freeMargin,
              usedMargin: health?.info?.usedMargin,
              marginLevel: health?.info?.marginLevel,
            },
            markets: assessmentTargets.map(({ instrument, candles, quote }) => ({
              symbol: instrument.broker_symbol,
              canonicalSymbol: instrument.canonical_symbol,
              category: instrument.category,
              quote: {
                bid: quote.bid,
                ask: quote.ask,
                spreadPoints: quote.spreadPoints,
                marketOpen: quote.marketOpen,
                tradeMode: quote.tradeMode,
              },
              indicators: analyzeMarket(candles),
            })),
          });
        } catch (error) {
          assessmentFailureReason = 'ai_assessment_unavailable';
          logger.warn({ err: error, botId: bot.id }, 'Bot AI market assessment failed');
        }

        if (aiDecisions) {
          const decisionIds: string[] = [];
          for (const target of assessmentTargets) {
            const decision = aiDecisions.find((item) => item.symbol === target.instrument.broker_symbol);
            if (!decision) throw new Error(`AI assessment omitted ${target.instrument.broker_symbol}`);
            const signal: StrategySignal = {
              verdict: decision.verdict,
              confidence: decision.confidence,
              reason: 'ai_assessment',
              meta: {
                reasoning: decision.reasoning,
                indicators: analyzeMarket(target.candles),
              },
            };
            const decisionId = await saveDecision({
              bot,
              instrument: target.instrument,
              candleTime: target.candleTime,
              signal,
              summary: decision.reasoning,
              quote: {
                bid: target.quote.bid,
                ask: target.quote.ask,
                spreadPoints: target.quote.spreadPoints,
                time: target.quote.time,
                marketOpen: target.quote.marketOpen,
                tradeMode: target.quote.tradeMode,
              },
            });
            assessmentSignals.set(target.instrument.id, signal);
            decisionIds.push(decisionId);
          }

          try {
            const chargeDecisionId = decisionIds[0];
            if (!chargeDecisionId) throw new Error('AI assessment has no saved decision to bill');
            await chargeAiAssessment({
              userId: bot.user_id,
              botId: bot.id,
              brokerAccountId: bot.broker_account_id,
              decisionId: chargeDecisionId,
            });
          } catch (error) {
            if (!(error instanceof AppError) || error.code !== 'INSUFFICIENT_CREDITS') throw error;
            assessmentFailureReason = 'insufficient_ai_credits';
            const noCreditSignal: StrategySignal = {
              verdict: 'NO_TRADE',
              confidence: 0,
              reason: assessmentFailureReason,
              meta: {},
            };
            for (const target of assessmentTargets) {
              assessmentSignals.set(target.instrument.id, noCreditSignal);
              await saveDecision({
                bot,
                instrument: target.instrument,
                candleTime: target.candleTime,
                signal: noCreditSignal,
                summary: reasonText(assessmentFailureReason),
                riskOutcome: 'rejected',
                riskReason: assessmentFailureReason,
              });
            }
          }
        }
      }
    }
  }

  for (const instrument of instruments) {
    if (!instrument.is_tradable) {
      await saveNoTrade(bot, instrument, candleTimeFallback, 'broker_not_tradable');
      continue;
    }

    const candleResult = candleById.get(instrument.id);
    const candles = candleResult?.candles ?? [];
    const candleTime = candles[candles.length - 1]?.time ?? candleTimeFallback;
    if (candles.length < 50) {
      await saveNoTrade(
        bot,
        instrument,
        candleTime,
        candleResult?.error ? 'market_data_unavailable' : 'insufficient_history',
        { detail: candleResult?.error ?? null },
      );
      continue;
    }

    if (alreadyAnalyzed.has(instrument.id)) continue;

    if (!health || health.status !== 'connected' || !health.info) {
      await saveNoTrade(bot, instrument, candleTime, 'broker_not_connected', {
        status: health?.status ?? 'unavailable',
        detail: health?.detail ?? null,
      });
      continue;
    }
    if (quoteError) {
      await saveNoTrade(bot, instrument, candleTime, 'quote_unavailable', { detail: quoteError.slice(0, 200) });
      continue;
    }

    const quote = quoteBySymbol.get(instrument.broker_symbol);
    if (!quote || quote.status !== 'ok' || quote.bid === null || quote.ask === null) {
      await saveNoTrade(bot, instrument, candleTime, 'quote_unavailable', {
        quoteStatus: quote?.status ?? 'missing',
      });
      continue;
    }
    const quoteSummary = {
      bid: quote.bid,
      ask: quote.ask,
      spreadPoints: quote.spreadPoints,
      time: quote.time,
      marketOpen: quote.marketOpen,
      tradeMode: quote.tradeMode,
    };

    if (quote.stale) {
      await saveNoTrade(bot, instrument, candleTime, 'stale_quote', { quote: quoteSummary });
      continue;
    }
    if (quote.marketOpen === false) {
      await saveNoTrade(bot, instrument, candleTime, 'market_closed', { quote: quoteSummary });
      continue;
    }
    if (quote.tradeMode === 'disabled' || quote.tradeMode === 'closeOnly') {
      await saveNoTrade(bot, instrument, candleTime, 'market_trade_disabled', { quote: quoteSummary });
      continue;
    }

    const signal = assessmentSignals.get(instrument.id);
    if (!signal) {
      await saveNoTrade(bot, instrument, candleTime, assessmentFailureReason ?? 'ai_assessment_unavailable', {
        quote: quoteSummary,
      });
      continue;
    }

    if (signal.verdict !== 'BUY' && signal.verdict !== 'SELL') {
      await saveDecision({
        bot,
        instrument,
        candleTime,
        signal,
        summary: typeof signal.meta.reasoning === 'string' ? signal.meta.reasoning : reasonText(signal.reason),
        quote: quoteSummary,
      });
      continue;
    }

    const side = signal.verdict === 'BUY' ? 'buy' : 'sell';
    const quoteDataBlock = !quote || quote.status !== 'ok' || quote.bid === null || quote.ask === null
      ? 'quote_unavailable'
      : quote.stale
        ? 'stale_quote'
        : null;
    if (quoteDataBlock) {
      await saveDecision({
        bot,
        instrument,
        candleTime,
        signal,
        summary: reasonText(quoteDataBlock),
        riskOutcome: 'rejected',
        riskReason: quoteDataBlock,
        quote: quoteSummary,
      });
      continue;
    }
    const halt = await isHalted({
      userId: bot.user_id,
      brokerAccountId: bot.broker_account_id,
      brokerName: bot.broker_name,
      strategyName: bot.strategy_name,
    });
    if (halt.halted) {
      await saveDecision({
        bot, instrument, candleTime, signal,
        summary: `${reasonText('emergency_control_active')} ${halt.reason ?? ''}`.trim(),
        riskOutcome: 'rejected',
        riskReason: 'emergency_control_active',
        quote: quoteSummary,
      });
      continue;
    }

    const openSymbolPositions = await query<{ id: string; side: 'buy' | 'sell' }>(
      `SELECT id, side FROM positions
        WHERE bot_id=$1 AND broker_symbol_id=$2 AND closed_at IS NULL`,
      [bot.id, instrument.id],
    );
    if (openSymbolPositions.rows.some((position) => position.side === side)) {
      await saveDecision({
        bot, instrument, candleTime, signal,
        summary: reasonText('position_already_open'),
        riskOutcome: 'rejected',
        riskReason: 'position_already_open',
        quote: quoteSummary,
      });
      continue;
    }
    let closeFailure: string | null = null;
    for (const position of openSymbolPositions.rows) {
      try {
        await closePosition({ userId: bot.user_id, positionId: position.id });
      } catch (error) {
        closeFailure = error instanceof Error ? error.message : 'Broker rejected the close request.';
        logger.warn({ err: error, botId: bot.id, positionId: position.id }, 'Bot could not close an opposite position');
        break;
      }
    }
    if (closeFailure) {
      await saveDecision({
        bot, instrument, candleTime, signal,
        summary: `${reasonText('opposite_position_close_failed')} ${closeFailure}`.slice(0, 500),
        riskOutcome: 'rejected',
        riskReason: 'opposite_position_close_failed',
        quote: quoteSummary,
      });
      continue;
    }
    if (openSymbolPositions.rows.length > 0) {
      const remaining = await query<{ count: number }>(
        `SELECT count(*)::int AS count FROM positions
          WHERE bot_id=$1 AND broker_symbol_id=$2 AND closed_at IS NULL`,
        [bot.id, instrument.id],
      );
      if ((remaining.rows[0]?.count ?? 0) > 0) {
        await saveDecision({
          bot, instrument, candleTime, signal,
          summary: reasonText('opposite_position_close_failed'),
          riskOutcome: 'rejected',
          riskReason: 'opposite_position_close_failed',
          quote: quoteSummary,
        });
        continue;
      }
    }

    const blockReason = quoteEntryBlock(quote, side);
    if (blockReason) {
      await saveDecision({
        bot, instrument, candleTime, signal,
        summary: reasonText(blockReason),
        riskOutcome: 'rejected',
        riskReason: blockReason,
        quote: quoteSummary,
      });
      continue;
    }
    if (bot.account_mode === 'live' && (!bot.is_live || !bot.trading_enabled)) {
      await saveDecision({
        bot, instrument, candleTime, signal,
        summary: reasonText('live_trading_not_authorized'),
        riskOutcome: 'rejected',
        riskReason: 'live_trading_not_authorized',
        quote: quoteSummary,
      });
      continue;
    }
    if (bot.account_mode === 'demo' && bot.is_live) {
      await saveDecision({
        bot, instrument, candleTime, signal,
        summary: 'The bot and broker account modes do not match; no order was placed.',
        riskOutcome: 'rejected',
        riskReason: 'account_mode_mismatch',
        quote: quoteSummary,
      });
      continue;
    }
    if (bot.max_spread_points !== null && quote.spreadPoints === null) {
      await saveDecision({
        bot, instrument, candleTime, signal,
        summary: reasonText('spread_unavailable'),
        riskOutcome: 'rejected',
        riskReason: 'spread_unavailable',
        quote: quoteSummary,
      });
      continue;
    }
    const volumeReason = volumeBlock(instrument, Number(bot.lot_size));
    if (volumeReason) {
      await saveDecision({
        bot, instrument, candleTime, signal,
        summary: reasonText(volumeReason),
        riskOutcome: 'rejected',
        riskReason: volumeReason,
        quote: quoteSummary,
      });
      continue;
    }

    const platformMaxLotResult = await query<{ limit_value: string }>(
      `SELECT limit_value FROM risk_limits
        WHERE scope='platform' AND scope_id IS NULL AND limit_key='max_lot'
        LIMIT 1`,
    );
    const platformMaxLot = platformMaxLotResult.rows[0] ? Number(platformMaxLotResult.rows[0].limit_value) : null;
    const symbolMaxLot = instrument.max_volume === null ? Number(bot.lot_size) : Number(instrument.max_volume);
    const maxLot = platformMaxLot !== null && Number.isFinite(platformMaxLot)
      ? Math.min(platformMaxLot, symbolMaxLot)
      : symbolMaxLot;
    const orderResults: Array<{ orderId: string; status: string; message?: string }> = [];
    let riskReason: string | null = null;
    let riskOutcome: 'approved' | 'rejected' = 'approved';

    for (let batch = 0; batch < bot.entry_batch_size; batch++) {
      const currentBot = await query<{ state: string }>(`SELECT state FROM bots WHERE id=$1`, [bot.id]);
      if (currentBot.rows[0]?.state !== 'running') {
        riskOutcome = orderResults.length > 0 ? 'approved' : 'rejected';
        riskReason = 'bot_not_running';
        break;
      }

      const exposure = await query<{ open_positions: number; aggregate_lots: number }>(
        `SELECT count(*)::int AS open_positions, COALESCE(sum(volume), 0)::float AS aggregate_lots
           FROM positions WHERE bot_id=$1 AND closed_at IS NULL`,
        [bot.id],
      );
      const snapshot = {
        equity: health.info.equity ?? 0,
        balance: health.info.balance ?? 0,
        freeMargin: health.info.freeMargin ?? 0,
        usedMargin: health.info.usedMargin ?? 0,
        marginLevel: health.info.marginLevel,
        openPositions: exposure.rows[0]?.open_positions ?? 0,
        aggregateLots: exposure.rows[0]?.aggregate_lots ?? 0,
        dailyRealizedLoss: Math.max(0, dailyStartBalance - (health.info.balance ?? dailyStartBalance)),
        peakEquity: Math.max(Number(bot.peak_equity), health.info.equity ?? 0, health.info.balance ?? 0),
      };
      const risk = checkEntry({
        lotSize: Number(bot.lot_size),
        currentSpreadPoints: quote.spreadPoints,
        now: new Date(),
        tradingSessions: bot.trading_sessions,
      }, snapshot, {
        maxConcurrentPositions: bot.max_concurrent_positions,
        maxLot,
        dailyLossLimit: Number(bot.daily_loss_limit),
        drawdownLimit: Number(bot.drawdown_limit),
        marginUtilizationLimit: Number(bot.margin_utilization_limit),
        maxSpreadPoints: bot.max_spread_points,
      });
      if (risk.outcome === 'rejected') {
        riskOutcome = 'rejected';
        riskReason = risk.reason;
        break;
      }

      if (batch === 0 && openSymbolPositions.rows.length === 0) {
        const recentOrder = await query(
          `SELECT id FROM orders
            WHERE bot_id=$1 AND created_at > now() - ($2 || ' seconds')::interval
              AND status IN ('pending', 'accepted', 'unknown')
            LIMIT 1`,
          [bot.id, bot.cooldown_seconds],
        );
        if (recentOrder.rows.length > 0) {
          riskOutcome = 'rejected';
          riskReason = 'cooldown_active';
          break;
        }
      }

      const order = await submitOrder({
        userId: bot.user_id,
        botId: bot.id,
        brokerAccountId: bot.broker_account_id,
        connectionProvider: bot.connection_provider,
        providerAccountId,
        brokerSymbolId: instrument.id,
        brokerSymbol: instrument.broker_symbol,
        side,
        volume: Number(bot.lot_size),
        idempotencyKey: `bot:${bot.id}:${instrument.id}:${candleTime}:${side}:${batch}`,
        comment: `VANTA ${bot.name}`,
      });
      orderResults.push({ orderId: order.orderId, status: order.status, message: order.message });
      if (order.status === 'rejected') {
        riskOutcome = 'rejected';
        riskReason = order.message ?? 'broker_rejected_order';
        break;
      }
      if (order.status === 'unknown' || order.status === 'duplicate') {
        riskReason = order.message ?? 'Order is awaiting broker confirmation.';
        break;
      }
    }

    const analysisSummary = typeof signal.meta.reasoning === 'string'
      ? signal.meta.reasoning
      : reasonText(signal.reason);
    const summary = orderResults.some((order) => order.status === 'accepted')
      ? `${analysisSummary} Broker accepted ${orderResults.filter((order) => order.status === 'accepted').length} order(s).`
      : riskReason
        ? `${reasonText(riskReason)}${orderResults[0]?.message ? ` ${orderResults[0].message}` : ''}`
        : analysisSummary;
    await saveDecision({
      bot,
      instrument,
      candleTime,
      signal,
      summary,
      riskOutcome,
      riskReason,
      quote: quoteSummary,
      structuredOutput: { orders: orderResults },
    });
  }

  await query(`UPDATE bots SET last_run_at=now() WHERE id=$1`, [bot.id]);
}
