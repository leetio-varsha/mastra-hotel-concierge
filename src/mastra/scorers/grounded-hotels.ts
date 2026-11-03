import { createScorer, type ScorerRunInputForAgent, type ScorerRunOutputForAgent } from '@mastra/core/evals';
import { extractAgentResponseMessages, extractToolResults, getTextContentFromMastraDBMessage } from '@mastra/evals/scorers/utils';
import { HOTELS } from '../data/hotels';

const MAX_NIGHTS_FOR_TOTALS = 14;

type Grounding = {
  /** Lower-cased hotel names that appeared in tool results or were named by the user. */
  knownNames: string[];
  /** EUR amounts that can be traced to a tool result or to the user's own words. */
  allowedPrices: number[];
  /** Everything the agent said in this run. */
  text: string;
};

/** EUR amounts in free text: "€145", "145 EUR", "145€", "145 euros". */
export function extractEurAmounts(text: string): number[] {
  const amounts = new Set<number>();
  for (const match of text.matchAll(/(?:€|EUR)\s?(\d{2,5})\b|\b(\d{2,5})\s?(?:€|EUR\b|euros?\b)/gi)) {
    const value = Number(match[1] ?? match[2]);
    if (!Number.isNaN(value)) amounts.add(value);
  }
  return [...amounts];
}

/**
 * Collect what the agent was allowed to talk about: hotel names and prices returned by tools in this
 * run or earlier in the thread (remembered messages), plus anything the user typed themselves
 * (a budget like "under €130", or a hotel they named).
 */
export function collectGrounding(input: ScorerRunInputForAgent | undefined, output: ScorerRunOutputForAgent): Grounding {
  const knownNames = new Set<string>();
  const perNight = new Set<number>();
  const allowed = new Set<number>();

  const remembered = input?.rememberedMessages ?? [];
  for (const { toolName, args, result } of [...extractToolResults(remembered), ...extractToolResults(output)]) {
    const payload = result as Record<string, unknown> | undefined;
    if (typeof (args as Record<string, unknown> | undefined)?.maxPrice === 'number') allowed.add((args as { maxPrice: number }).maxPrice);
    if (!payload) continue;
    const hotels: Array<Record<string, unknown>> = [];
    if (toolName === 'search_hotels' && Array.isArray(payload.results)) hotels.push(...(payload.results as Array<Record<string, unknown>>));
    if (toolName === 'get_hotel_details' && payload.hotel) hotels.push(payload.hotel as Record<string, unknown>);
    for (const hotel of hotels) {
      if (typeof hotel.name === 'string') knownNames.add(hotel.name.toLowerCase());
      if (typeof hotel.pricePerNight === 'number') perNight.add(hotel.pricePerNight);
      if (typeof hotel.totalPrice === 'number') allowed.add(hotel.totalPrice);
    }
    if (toolName === 'check_availability' && typeof payload.totalPrice === 'number') allowed.add(payload.totalPrice);
  }

  const userText = [...remembered, ...(input?.inputMessages ?? [])]
    .filter((message) => message.role === 'user')
    .map(getTextContentFromMastraDBMessage)
    .join('\n')
    .toLowerCase();
  for (const hotel of HOTELS) if (userText.includes(hotel.name.toLowerCase())) knownNames.add(hotel.name.toLowerCase());
  for (const amount of extractEurAmounts(userText)) allowed.add(amount);

  // A per-night price may legitimately be quoted as a total for any plausible stay length.
  for (const price of perNight) {
    for (let nights = 1; nights <= MAX_NIGHTS_FOR_TOTALS; nights += 1) allowed.add(price * nights);
  }

  return {
    knownNames: [...knownNames],
    allowedPrices: [...allowed],
    text: extractAgentResponseMessages(output).join('\n'),
  };
}

export function findUngrounded(grounding: Grounding): { mentioned: string[]; inventedHotels: string[]; inventedPrices: number[] } {
  const lower = grounding.text.toLowerCase();
  const mentioned = HOTELS.filter((hotel) => lower.includes(hotel.name.toLowerCase())).map((hotel) => hotel.name);
  const inventedHotels = mentioned.filter((name) => !grounding.knownNames.includes(name.toLowerCase()));
  const inventedPrices = extractEurAmounts(grounding.text).filter((price) => !grounding.allowedPrices.includes(price));
  return { mentioned, inventedHotels, inventedPrices };
}

/**
 * Deterministic hallucination check: the answer may only name hotels and quote prices that a tool
 * returned (in this run or earlier in the thread) or that the user themselves mentioned. Hotel names
 * are matched against the whole catalogue, so a hotel the model "remembers" from training or from
 * another session is caught; prices are matched against per-night rates, stay totals and the user's budget.
 */
export const groundedHotelsScorer = createScorer({
  id: 'grounded-hotels',
  description: 'Answer only mentions hotels and prices returned by tools in this run (no hallucinated hotels or prices).',
  type: 'agent',
})
  .preprocess(({ run }) => collectGrounding(run.input, run.output))
  .analyze(({ results }) => findUngrounded(results.preprocessStepResult))
  .generateScore(({ results }) => {
    const { inventedHotels, inventedPrices } = results.analyzeStepResult;
    return inventedHotels.length === 0 && inventedPrices.length === 0 ? 1 : 0;
  })
  .generateReason(({ results, score }) => {
    const { mentioned, inventedHotels, inventedPrices } = results.analyzeStepResult;
    if (score === 1) {
      return mentioned.length > 0
        ? `All ${mentioned.length} mentioned hotel(s) and every quoted price came from tool results.`
        : 'No hotels or prices were mentioned, so nothing could be invented.';
    }
    const parts: string[] = [];
    if (inventedHotels.length) parts.push(`hotels not returned by any tool: ${inventedHotels.join(', ')}`);
    if (inventedPrices.length) parts.push(`prices not traceable to a tool result: ${inventedPrices.map((p) => `€${p}`).join(', ')}`);
    return `Ungrounded content — ${parts.join('; ')}.`;
  });
