import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  CatalogError,
  checkAvailability,
  createBooking,
  getHotel,
  searchHotels,
  toSummary,
} from '../data/catalog';
import { amenitySchema, bookingSchema, hotelSummarySchema, isoDateSchema } from '../data/types';

/** Tools surface catalog failures as data, not thrown errors, so the model can explain them to the guest. */
function describeError(error: unknown): { error: string; code: string } {
  if (error instanceof CatalogError) return { error: error.message, code: error.code };
  return { error: error instanceof Error ? error.message : String(error), code: 'UNKNOWN' };
}

const searchResultSchema = hotelSummarySchema.extend({
  nights: z.number().int(),
  totalPrice: z.number().int().describe('Total for the whole stay in EUR'),
});

export const searchHotelsTool = createTool({
  id: 'search_hotels',
  description:
    'Search available hotels in a city for given dates. Returns only hotels that are free for every night of the stay. ' +
    'Prices are EUR per room per night. Returns an empty list when nothing matches — never guess hotels that are not in the result.',
  inputSchema: z.object({
    city: z.string().min(1).describe('City name, e.g. "Lisbon"'),
    checkIn: isoDateSchema.describe('Check-in date, YYYY-MM-DD'),
    checkOut: isoDateSchema.describe('Check-out date, YYYY-MM-DD, after checkIn'),
    guests: z.number().int().positive().describe('Number of guests sharing one room'),
    maxPrice: z.number().positive().optional().describe('Maximum price per night in EUR'),
    amenities: z.array(amenitySchema).optional().describe('Every listed amenity must be present'),
  }),
  outputSchema: z.object({
    results: z.array(searchResultSchema),
    error: z.string().optional(),
    code: z.string().optional(),
  }),
  execute: async (input) => {
    try {
      return { results: searchHotels(input) };
    } catch (error) {
      return { results: [], ...describeError(error) };
    }
  },
});

export const getHotelDetailsTool = createTool({
  id: 'get_hotel_details',
  description: 'Get the full record for one hotel by its id (e.g. "lis-001"): location, price per night, rating, amenities, room capacity.',
  inputSchema: z.object({
    hotelId: z.string().min(1),
  }),
  outputSchema: z.object({
    hotel: hotelSummarySchema.optional(),
    error: z.string().optional(),
    code: z.string().optional(),
  }),
  execute: async ({ hotelId }) => {
    const hotel = getHotel(hotelId);
    if (!hotel) return { error: `No hotel with id "${hotelId}"`, code: 'HOTEL_NOT_FOUND' };
    return { hotel: toSummary(hotel) };
  },
});

export const checkAvailabilityTool = createTool({
  id: 'check_availability',
  description: 'Check whether one hotel can be booked for a date range and what the whole stay would cost.',
  inputSchema: z.object({
    hotelId: z.string().min(1),
    checkIn: isoDateSchema,
    checkOut: isoDateSchema,
  }),
  outputSchema: z.object({
    available: z.boolean(),
    nights: z.number().int().optional(),
    totalPrice: z.number().int().optional(),
    unavailableNights: z.array(isoDateSchema).optional(),
    error: z.string().optional(),
    code: z.string().optional(),
  }),
  execute: async ({ hotelId, checkIn, checkOut }) => {
    try {
      return checkAvailability(hotelId, checkIn, checkOut);
    } catch (error) {
      return { available: false, ...describeError(error) };
    }
  },
});

/**
 * Creates a booking. Deliberately NOT given to the concierge agent: it is only invoked by the
 * booking workflow, after the human has confirmed the proposal (see workflows/booking-workflow.ts).
 */
export const createBookingTool = createTool({
  id: 'create_booking',
  description: 'Create a confirmed booking for a hotel, dates and guest. Fails if the hotel is unavailable.',
  inputSchema: z.object({
    hotelId: z.string().min(1),
    checkIn: isoDateSchema,
    checkOut: isoDateSchema,
    guests: z.number().int().positive(),
    guestName: z.string().trim().min(1),
  }),
  outputSchema: z.object({
    booking: bookingSchema.optional(),
    error: z.string().optional(),
    code: z.string().optional(),
  }),
  execute: async (input) => {
    try {
      return { booking: createBooking(input) };
    } catch (error) {
      return describeError(error);
    }
  },
});

/** Tools the concierge agent may call. Keys double as the tool names the model sees. */
export const conciergeTools = {
  search_hotels: searchHotelsTool,
  get_hotel_details: getHotelDetailsTool,
  check_availability: checkAvailabilityTool,
};
