import { isValidationError } from '@mastra/core/tools';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { amenitySchema, bookingSchema, hotelSummarySchema, isoDateSchema } from '../data/types';
import { createBookingTool, searchHotelsTool } from '../tools/hotel-tools';

const searchParamsSchema = z.object({
  city: z.string(),
  checkIn: isoDateSchema,
  checkOut: isoDateSchema,
  guests: z.number().int().positive(),
  maxPrice: z.number().positive().optional(),
  amenities: z.array(amenitySchema).optional(),
});
type SearchParams = z.infer<typeof searchParamsSchema>;

const candidateSchema = hotelSummarySchema.extend({
  nights: z.number().int(),
  totalPrice: z.number().int(),
});

const shortlistedSchema = candidateSchema.extend({ reason: z.string() });

const proposalSchema = z.object({
  hotelId: z.string(),
  hotelName: z.string(),
  city: z.string(),
  checkIn: isoDateSchema,
  checkOut: isoDateSchema,
  nights: z.number().int(),
  guests: z.number().int(),
  pricePerNight: z.number().int(),
  totalPrice: z.number().int(),
  reason: z.string(),
});

const inputSchema = z.object({
  request: z.string().describe('Natural-language request, e.g. "2 nights in Lisbon from 2027-05-10, 2 guests, with breakfast, under €150"'),
  guestName: z.string().min(1),
});

/** Every way the workflow can end. Early exits use bail(), so the run still finishes with status "success". */
const outputSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('booked'), booking: bookingSchema }),
  z.object({ status: z.literal('cancelled'), reason: z.string() }),
  z.object({ status: z.literal('needs_info'), missing: z.array(z.string()), message: z.string() }),
  z.object({ status: z.literal('no_results'), message: z.string(), searchParams: searchParamsSchema }),
]);
type WorkflowOutput = z.infer<typeof outputSchema>;

// Step 1: the agent turns free text into typed search parameters. No tools, no memory: pure extraction.
const parseRequest = createStep({
  id: 'parse-request',
  description: 'Extract city, dates, guests and filters from the natural-language request.',
  inputSchema,
  outputSchema: searchParamsSchema,
  execute: async ({ inputData, mastra, bail }) => {
    const agent = mastra.getAgent('conciergeAgent');
    const today = new Date().toISOString().slice(0, 10);
    const extracted = await agent.generate(inputData.request, {
      instructions: `Today is ${today}. Extract hotel search parameters from the user's message. Resolve relative dates against today. Do not ask questions and do not call tools. Leave a field null when the message does not state or clearly imply it. guests defaults to 1 only when the message gives no hint at all.`,
      toolChoice: 'none',
      maxSteps: 1,
      structuredOutput: {
        schema: z.object({
          city: z.string().nullable(),
          checkIn: z.string().nullable().describe('YYYY-MM-DD'),
          checkOut: z.string().nullable().describe('YYYY-MM-DD'),
          guests: z.number().int().positive().nullable(),
          maxPrice: z.number().positive().nullable().describe('EUR per night'),
          amenities: z.array(amenitySchema).nullable(),
        }),
      },
    });
    const parsed = extracted.object;

    const missing = (['city', 'checkIn', 'checkOut'] as const).filter((key) => !parsed?.[key]);
    if (!parsed || missing.length > 0) {
      return bail({
        status: 'needs_info',
        missing,
        message: `I need the ${missing.join(' and ')} before I can search. Please add ${missing.length > 1 ? 'them' : 'it'} to the request.`,
      } satisfies WorkflowOutput);
    }

    const candidate = {
      city: parsed.city!,
      checkIn: parsed.checkIn!,
      checkOut: parsed.checkOut!,
      guests: parsed.guests ?? 1,
      maxPrice: parsed.maxPrice ?? undefined,
      amenities: parsed.amenities ?? undefined,
    };
    const valid = searchParamsSchema.safeParse(candidate);
    if (!valid.success) {
      return bail({
        status: 'needs_info',
        missing: valid.error.issues.map((issue) => issue.path.join('.')),
        message: `Some details were unclear: ${valid.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}`,
      } satisfies WorkflowOutput);
    }
    return valid.data;
  },
});

// Step 2: deterministic search through the same tool the agent uses.
const searchStep = createStep({
  id: 'search',
  description: 'Find available hotels for the parsed parameters.',
  inputSchema: searchParamsSchema,
  outputSchema: z.object({ searchParams: searchParamsSchema, results: z.array(candidateSchema) }),
  execute: async ({ inputData, requestContext, bail }) => {
    const outcome = await searchHotelsTool.execute!(inputData, { requestContext });
    if (!outcome || isValidationError(outcome)) throw new Error('search_hotels rejected the parsed parameters');
    if (outcome.error) throw new Error(outcome.error);
    if (outcome.results.length === 0) {
      return bail({
        status: 'no_results',
        message: `No available hotels in ${inputData.city} for ${inputData.checkIn} to ${inputData.checkOut} with the given filters.`,
        searchParams: inputData,
      } satisfies WorkflowOutput);
    }
    return { searchParams: inputData, results: outcome.results };
  },
});

// Step 3: the agent ranks the real results. Ids are validated against the search output, so it cannot add a hotel.
const shortlistStep = createStep({
  id: 'shortlist',
  description: 'Pick up to three hotels from the results with a one-line reason each.',
  inputSchema: z.object({ searchParams: searchParamsSchema, results: z.array(candidateSchema) }),
  outputSchema: z.object({ searchParams: searchParamsSchema, shortlist: z.array(shortlistedSchema).min(1) }),
  execute: async ({ inputData, mastra }) => {
    const { searchParams, results } = inputData;
    const agent = mastra.getAgent('conciergeAgent');
    const ranked = await agent.generate(
      `Guest request: ${JSON.stringify(searchParams)}\n\nAvailable hotels (JSON):\n${JSON.stringify(results)}\n\nPick the best three for this guest, best first.`,
      {
        instructions: 'You rank hotels for a guest. Choose only from the provided JSON list, using the exact hotelId values. Prefer fit with the request (budget, amenities), then rating, then price. Prices are EUR (write €). Do not call tools.',
        toolChoice: 'none',
        maxSteps: 1,
        structuredOutput: {
          schema: z.object({
            picks: z.array(z.object({ hotelId: z.string(), reason: z.string().max(160) })).max(3),
          }),
        },
      },
    );

    const byId = new Map(results.map((hotel) => [hotel.id, hotel]));
    const shortlist = (ranked.object?.picks ?? [])
      .flatMap((pick) => {
        const hotel = byId.get(pick.hotelId);
        return hotel ? [{ ...hotel, reason: pick.reason }] : [];
      })
      .slice(0, 3);

    // If the model returned nothing usable, fall back to the search ranking so the flow still proposes something real.
    if (shortlist.length === 0) {
      shortlist.push(...results.slice(0, 3).map((hotel) => ({ ...hotel, reason: 'Top search result by rating and price.' })));
    }
    return { searchParams, shortlist };
  },
});

// Step 4: propose the top pick and SUSPEND until a human confirms (or picks an alternative, or declines).
const confirmStep = createStep({
  id: 'confirm-booking',
  description: 'Suspend with a booking proposal; resume with the human decision.',
  inputSchema: z.object({ searchParams: searchParamsSchema, shortlist: z.array(shortlistedSchema).min(1) }),
  suspendSchema: z.object({
    message: z.string(),
    proposal: proposalSchema,
    alternatives: z.array(shortlistedSchema),
  }),
  resumeSchema: z.object({
    confirmed: z.boolean(),
    /** Optionally switch to another hotel from the shortlist before confirming. */
    hotelId: z.string().optional(),
  }),
  outputSchema: proposalSchema,
  execute: async ({ inputData, resumeData, suspend, bail }) => {
    const { searchParams, shortlist } = inputData;
    const toProposal = (hotel: z.infer<typeof shortlistedSchema>) => ({
      hotelId: hotel.id,
      hotelName: hotel.name,
      city: hotel.city,
      checkIn: searchParams.checkIn,
      checkOut: searchParams.checkOut,
      nights: hotel.nights,
      guests: searchParams.guests,
      pricePerNight: hotel.pricePerNight,
      totalPrice: hotel.totalPrice,
      reason: hotel.reason,
    });

    if (!resumeData) {
      const [top, ...alternatives] = shortlist;
      const proposal = toProposal(top!);
      return await suspend({
        message: `Book ${proposal.hotelName} (${proposal.city}) for ${proposal.nights} night(s), ${proposal.checkIn} → ${proposal.checkOut}, ${proposal.guests} guest(s) at €${proposal.pricePerNight}/night = €${proposal.totalPrice}? Resume with { confirmed: true } or pick an alternative hotelId.`,
        proposal,
        alternatives,
      });
    }

    if (!resumeData.confirmed) {
      return bail({ status: 'cancelled', reason: 'Guest declined the proposal.' } satisfies WorkflowOutput);
    }
    const chosen = resumeData.hotelId ? shortlist.find((hotel) => hotel.id === resumeData.hotelId) : shortlist[0];
    if (!chosen) {
      return bail({
        status: 'cancelled',
        reason: `Hotel ${resumeData.hotelId} is not on the shortlist (${shortlist.map((hotel) => hotel.id).join(', ')}).`,
      } satisfies WorkflowOutput);
    }
    return toProposal(chosen);
  },
});

// Step 5: the only place create_booking is ever called.
const bookStep = createStep({
  id: 'create-booking',
  description: 'Create the booking for the confirmed proposal.',
  inputSchema: proposalSchema,
  outputSchema,
  execute: async ({ inputData, getInitData, requestContext }) => {
    const { guestName } = getInitData<z.infer<typeof inputSchema>>();
    const outcome = await createBookingTool.execute!(
      { hotelId: inputData.hotelId, checkIn: inputData.checkIn, checkOut: inputData.checkOut, guests: inputData.guests, guestName },
      { requestContext },
    );
    if (!outcome || isValidationError(outcome)) throw new Error('create_booking rejected the proposal');
    if (!outcome.booking) {
      return { status: 'cancelled', reason: outcome.error ?? 'create_booking returned nothing' } satisfies WorkflowOutput;
    }
    return { status: 'booked', booking: outcome.booking } satisfies WorkflowOutput;
  },
});

export const bookingWorkflow = createWorkflow({
  id: 'booking-workflow',
  description: 'Search → shortlist → propose → human confirmation (suspend/resume) → create booking.',
  inputSchema,
  outputSchema,
})
  .then(parseRequest)
  .then(searchStep)
  .then(shortlistStep)
  .then(confirmStep)
  .then(bookStep)
  .commit();

export { confirmStep };
