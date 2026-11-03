import type { MastraDBMessage } from '@mastra/core/agent';
import { describe, expect, it } from 'vitest';
import { clarifiesMissingInfoScorer } from './clarifies-missing-info';
import { extractEurAmounts, groundedHotelsScorer } from './grounded-hotels';
import { toolCallCorrectnessScorer } from './tool-call-correctness';

/** Minimal stored-message builders matching the shape @mastra/evals helpers read. */
let counter = 0;
const next = () => `id-${(counter += 1)}`;

function user(text: string): MastraDBMessage {
  return { id: next(), role: 'user', createdAt: new Date(), content: { format: 2, parts: [{ type: 'text', text }] } };
}

function assistant(text: string, toolCalls: Array<{ toolName: string; args: Record<string, unknown>; result: unknown }> = []): MastraDBMessage {
  return {
    id: next(),
    role: 'assistant',
    createdAt: new Date(),
    content: {
      format: 2,
      parts: [
        ...toolCalls.map((call) => ({
          type: 'tool-invocation' as const,
          toolInvocation: { state: 'result' as const, toolCallId: next(), toolName: call.toolName, args: call.args, result: call.result },
        })),
        { type: 'text' as const, text },
      ],
    },
  };
}

const emptyInput = (...inputMessages: MastraDBMessage[]) => ({ inputMessages, rememberedMessages: [], systemMessages: [], taggedSystemMessages: {} });

const searchCall = {
  toolName: 'search_hotels',
  args: { city: 'Prague', checkIn: '2027-06-10', checkOut: '2027-06-12', guests: 2, maxPrice: 130 },
  result: { results: [{ id: 'prg-001', name: 'Old Town Clock Hotel', pricePerNight: 120, totalPrice: 240 }] },
};

describe('grounded-hotels', () => {
  it('parses EUR amounts in the common spellings', () => {
    expect(extractEurAmounts('€145, 240 EUR, 90€ and 300 euros, but not 2027 or room 12').sort((a, b) => a - b)).toEqual([90, 145, 240, 300]);
  });

  it('passes when every hotel and price comes from a tool result', async () => {
    const run = await groundedHotelsScorer.run({
      input: emptyInput(user('Prague 2027-06-10 to 2027-06-12, 2 guests, under €130')),
      output: [assistant('Old Town Clock Hotel is €120/night, €240 for 2 nights, within your €130 budget.', [searchCall])],
    });
    expect(run.score).toBe(1);
  });

  it('fails on a hotel the tools never returned', async () => {
    const run = await groundedHotelsScorer.run({
      input: emptyInput(user('Prague hotels please')),
      output: [assistant('I recommend Castle Hill Grand.', [searchCall])],
    });
    expect(run.score).toBe(0);
    expect(run.reason).toMatch(/Castle Hill Grand/);
  });

  it('fails on a price that is neither a rate, a stay total nor the user budget', async () => {
    const run = await groundedHotelsScorer.run({
      input: emptyInput(user('Prague hotels please')),
      output: [assistant('Old Town Clock Hotel is €99 per night.', [searchCall])],
    });
    expect(run.score).toBe(0);
    expect(run.reason).toMatch(/€99/);
  });

  it('accepts hotels returned earlier in the thread (follow-up turns)', async () => {
    const run = await groundedHotelsScorer.run({
      input: { ...emptyInput(user('Cheaper option?')), rememberedMessages: [user('Prague…'), assistant('Here are hotels', [searchCall])] },
      output: [assistant('The cheapest is Old Town Clock Hotel at €120.')],
    });
    expect(run.score).toBe(1);
  });

  it('is neutral when the agent only asks a question', async () => {
    const run = await groundedHotelsScorer.run({ input: emptyInput(user('A hotel?')), output: [assistant('Which city and dates?')] });
    expect(run.score).toBe(1);
  });
});

describe('clarifies-missing-info', () => {
  it('rewards a question without a search when info is missing', async () => {
    const run = await clarifiesMissingInfoScorer.run({ input: emptyInput(user('Hotel in Barcelona for two')), output: [assistant('What dates?')], groundTruth: { expectsClarification: true } });
    expect(run.score).toBe(1);
  });

  it('penalises guessing', async () => {
    const run = await clarifiesMissingInfoScorer.run({
      input: emptyInput(user('Hotel in Barcelona for two')),
      output: [assistant('Here you go', [{ ...searchCall, args: { ...searchCall.args, city: 'Barcelona' } }])],
      groundTruth: { expectsClarification: true },
    });
    expect(run.score).toBe(0);
  });

  it('expects a search when the request is complete', async () => {
    const run = await clarifiesMissingInfoScorer.run({ input: emptyInput(user('complete')), output: [assistant('Sure, which budget?')], groundTruth: { expectsClarification: false } });
    expect(run.score).toBe(0);
  });

  it('skips items without ground truth', async () => {
    const run = await clarifiesMissingInfoScorer.run({ input: emptyInput(user('x')), output: [assistant('y')] });
    expect(run.score).toBeUndefined();
  });
});

describe('tool-call-correctness', () => {
  const output = [assistant('ok', [searchCall])];

  it('matches a subset of arguments case-insensitively', async () => {
    const run = await toolCallCorrectnessScorer.run({
      input: emptyInput(user('x')),
      output,
      groundTruth: { expectedTools: [{ tool: 'search_hotels', args: { city: 'prague', guests: 2 } }] },
    });
    expect(run.score).toBe(1);
  });

  it('gives partial credit per expectation and explains the miss', async () => {
    const run = await toolCallCorrectnessScorer.run({
      input: emptyInput(user('x')),
      output,
      groundTruth: { expectedTools: [{ tool: 'search_hotels', args: { city: 'Prague' } }, { tool: 'get_hotel_details', args: { hotelId: 'prg-001' } }] },
    });
    expect(run.score).toBe(0.5);
    expect(run.reason).toMatch(/get_hotel_details/);
  });

  it('treats array arguments as subsets', async () => {
    const withAmenities = [assistant('ok', [{ ...searchCall, args: { ...searchCall.args, amenities: ['wifi', 'breakfast', 'bar'] } }])];
    const run = await toolCallCorrectnessScorer.run({
      input: emptyInput(user('x')),
      output: withAmenities,
      groundTruth: { expectedTools: [{ tool: 'search_hotels', args: { amenities: ['breakfast'] } }] },
    });
    expect(run.score).toBe(1);
  });
});
