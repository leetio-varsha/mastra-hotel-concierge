import type { ClarificationGroundTruth } from '../src/mastra/scorers/clarifies-missing-info';
import type { ToolCallGroundTruth } from '../src/mastra/scorers/tool-call-correctness';

export type GroundTruth = Partial<ClarificationGroundTruth & ToolCallGroundTruth>;

export type EvalCase = {
  id: string;
  /** Single-turn input, or several turns sent on one memory thread. */
  input: string | string[];
  groundTruth?: GroundTruth;
  note: string;
};

/** Fixed dates far enough in the future that "today" never catches up with them. */
export const CASES: EvalCase[] = [
  {
    id: 'complete-request',
    input: 'Find me a hotel in Lisbon from 2027-05-10 to 2027-05-12 for 2 guests.',
    groundTruth: {
      expectsClarification: false,
      expectedTools: [{ tool: 'search_hotels', args: { city: 'Lisbon', checkIn: '2027-05-10', checkOut: '2027-05-12', guests: 2 } }],
    },
    note: 'Baseline: all required fields present → one correct search.',
  },
  {
    id: 'filters-budget-amenities',
    input: 'Prague, 2027-06-10 to 2027-06-13, two of us, max 120 a night, needs breakfast and wifi.',
    groundTruth: {
      expectsClarification: false,
      expectedTools: [{ tool: 'search_hotels', args: { city: 'Prague', checkIn: '2027-06-10', checkOut: '2027-06-13', guests: 2, maxPrice: 120, amenities: ['breakfast', 'wifi'] } }],
    },
    note: 'Optional filters are mapped to the typed tool arguments.',
  },
  {
    id: 'missing-dates',
    input: 'I need a hotel in Barcelona for two people.',
    groundTruth: { expectsClarification: true },
    note: 'No dates → ask, do not search.',
  },
  {
    id: 'missing-city',
    input: 'Something nice from 2027-05-10 to 2027-05-12 for one person, with a pool.',
    groundTruth: { expectsClarification: true },
    note: 'No city → ask, do not search.',
  },
  {
    id: 'vague-everything',
    input: 'Can you find me a hotel?',
    groundTruth: { expectsClarification: true },
    note: 'Nothing to go on → ask.',
  },
  {
    id: 'hotel-details-by-id',
    input: 'Tell me more about ams-003.',
    groundTruth: { expectedTools: [{ tool: 'get_hotel_details', args: { hotelId: 'ams-003' } }] },
    note: 'Direct lookup by id.',
  },
  {
    id: 'availability-check',
    input: 'Is ams-003 available from 2027-07-01 to 2027-07-03?',
    groundTruth: { expectedTools: [{ tool: 'check_availability', args: { hotelId: 'ams-003', checkIn: '2027-07-01', checkOut: '2027-07-03' } }] },
    note: 'The hotel is blocked on 2027-07-02; the answer must relay that, not guess.',
  },
  {
    id: 'hallucination-trap-brand',
    input: 'Is there a Ritz-Carlton in Prague for 2027-06-01 to 2027-06-03, 2 guests?',
    groundTruth: {
      expectsClarification: false,
      expectedTools: [{ tool: 'search_hotels', args: { city: 'Prague', checkIn: '2027-06-01', checkOut: '2027-06-03' } }],
    },
    note: 'No such hotel in the catalogue; the agent must search and answer from results only.',
  },
  {
    id: 'unknown-city',
    input: 'Hotel in Tokyo, 2027-05-10 to 2027-05-12, 1 guest.',
    groundTruth: {
      expectsClarification: false,
      expectedTools: [{ tool: 'search_hotels', args: { city: 'Tokyo' } }],
    },
    note: 'Search returns nothing; the agent must say so rather than invent hotels.',
  },
  {
    id: 'booking-attempt-in-chat',
    input: 'Book lis-002 for me from 2027-05-10 to 2027-05-12, 2 guests, name Ada Lovelace.',
    groundTruth: { expectedTools: [{ tool: 'check_availability', args: { hotelId: 'lis-002' } }] },
    note: 'The agent has no booking tool: it should verify availability and hand off to the confirmed flow.',
  },
  {
    id: 'follow-up-cheaper',
    input: ['Hotels in Amsterdam from 2027-08-10 to 2027-08-12 for 2 guests.', 'Cheaper option?'],
    groundTruth: { expectedTools: [{ tool: 'search_hotels', args: { city: 'Amsterdam' } }] },
    note: 'Memory: the follow-up must be answered from the earlier results on the same thread.',
  },
  {
    id: 'follow-up-second-one',
    input: ['Show me hotels in Prague for 2027-06-10 to 2027-06-12, 2 guests.', 'The second one — does it have breakfast, and what would the total be?'],
    groundTruth: { expectedTools: [{ tool: 'search_hotels', args: { city: 'Prague' } }] },
    note: 'Memory: "the second one" refers to the list from the previous turn.',
  },
];
