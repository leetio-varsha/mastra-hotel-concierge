import { createScorer } from '@mastra/core/evals';
import { extractAgentResponseMessages, extractToolResults } from '@mastra/evals/scorers/utils';
import { HOTELS } from '../data/hotels';

const MAX_NIGHTS_FOR_TOTALS = 14;

type Grounding = {
  returnedNames: string[];
  allowedPrices: Set<number>;
  text: string;
};

/** Collect every hotel name and price the tools actually returned during the run. */
function collectGrounding(output: Parameters<typeof extractToolResults>[0]): Grounding {
  const returnedNames = new Set<string>();
  const perNight = new Set<number>();
  const totals = new Set<number>();

  for (const { toolName, result } of extractToolResults(output)) {
    const payload = result as Record<string, unknown> | undefined;
    if (!payload) continue;
    const hotels: Array<Record<string, unknown>> = [];
    if (toolName === 'search_hotels' && Array.isArray(payload.results)) hotels.push(...(payload.results as Array<Record<string, unknown>>));
    if (toolName === 'get_hotel_details' && payload.hotel) hotels.push(payload.hotel as Record<string, unknown>);
    for (const hotel of hotels) {
      if (typeof hotel.name === 'string') returnedNames.add(hotel.name.toLowerCase());
      if (typeof hotel.pricePerNight === 'number') perNight.add(hotel.pricePerNight);
      if (typeof hotel.totalPrice === 'number') totals.add(hotel.totalPrice);
    }
    if (toolName === 'check_availability' && typeof payload.totalPrice === 'number') totals.add(payload.totalPrice);
  }

  // A per-night price may legitimately be quoted as a total for any plausible stay length.
  const allowedPrices = new Set<number>(totals);
  for (const price of perNight) {
    for (let nights = 1; nights <= MAX_NIGHTS_FOR_TOTALS; nights += 1) allowedPrices.add(price * nights);
  }

  return {
    returnedNames: [...returnedNames],
    allowedPrices,
    text: extractAgentResponseMessages(output).join('\n'),
  };
}

/** EUR amounts the model wrote: "€145", "145 EUR", "145€", "145 euros". */
function mentionedPrices(text: string): number[] {
  const amounts = new Set<number>();
  for (const match of text.matchAll(/(?:€|EUR)\s?(\d{2,5})\b|\b(\d{2,5})\s?(?:€|EUR\b|euros?\b)/gi)) {
    const value = Number(match[1] ?? match[2]);
    if (!Number.isNaN(value)) amounts.add(value);
  }
  return [...amounts];
}

/**
 * Deterministic hallucination check: the answer may only name hotels and quote prices that a
 * tool returned in this run. Hotel names are matched against the whole catalogue, so a hotel
 * the model "remembers" from an earlier session (or invents outright) is caught.
 */
export const groundedHotelsScorer = createScorer({
  id: 'grounded-hotels',
  description: 'Answer only mentions hotels and prices returned by tools in this run (no hallucinated hotels or prices).',
  type: 'agent',
})
  .preprocess(({ run }) => collectGrounding(run.output))
  .analyze(({ results }) => {
    const { returnedNames, allowedPrices, text } = results.preprocessStepResult;
    const lower = text.toLowerCase();
    const mentioned = HOTELS.filter((hotel) => lower.includes(hotel.name.toLowerCase())).map((hotel) => hotel.name);
    const inventedHotels = mentioned.filter((name) => !returnedNames.includes(name.toLowerCase()));
    const inventedPrices = mentionedPrices(text).filter((price) => !allowedPrices.has(price));
    return { mentioned, inventedHotels, inventedPrices };
  })
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
