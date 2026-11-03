import { z } from 'zod';

export const AMENITIES = [
  'wifi',
  'breakfast',
  'pool',
  'gym',
  'spa',
  'parking',
  'pet-friendly',
  'airport-shuttle',
  'bar',
  'restaurant',
  'kitchen',
  'view',
] as const;

export const amenitySchema = z.enum(AMENITIES);
export type Amenity = z.infer<typeof amenitySchema>;

/** ISO calendar date, e.g. 2027-05-10. Validated as a real date, not just the shape. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date like 2027-05-10')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Not a valid calendar date');

export const hotelSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  neighborhood: z.string(),
  pricePerNight: z.number().int().positive().describe('Price per room per night in EUR'),
  rating: z.number().min(1).max(5),
  amenities: z.array(amenitySchema),
  maxGuests: z.number().int().positive().describe('Guests per room'),
  rooms: z.number().int().positive().describe('Rooms of this type that can be booked per night'),
  blockedDates: z.array(isoDateSchema).describe('Nights that are sold out regardless of bookings'),
});
export type Hotel = z.infer<typeof hotelSchema>;

/** The shape tools return for a hotel: everything a guest cares about, nothing about inventory internals. */
export const hotelSummarySchema = hotelSchema.omit({ rooms: true, blockedDates: true });
export type HotelSummary = z.infer<typeof hotelSummarySchema>;

export const bookingSchema = z.object({
  id: z.string(),
  hotelId: z.string(),
  hotelName: z.string(),
  city: z.string(),
  guestName: z.string(),
  guests: z.number().int().positive(),
  checkIn: isoDateSchema,
  checkOut: isoDateSchema,
  nights: z.number().int().positive(),
  pricePerNight: z.number().int().positive(),
  totalPrice: z.number().int().positive(),
  createdAt: z.string().describe('ISO timestamp'),
});
export type Booking = z.infer<typeof bookingSchema>;

export const stayRequestSchema = z.object({
  checkIn: isoDateSchema,
  checkOut: isoDateSchema,
  guests: z.number().int().positive().default(1),
});
export type StayRequest = z.infer<typeof stayRequestSchema>;
