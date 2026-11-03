import { randomUUID } from 'node:crypto';
import { HOTELS } from './hotels';
import type { Amenity, Booking, Hotel, HotelSummary } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** In-memory booking store. Resets with the process — this is a mock data layer, not a database. */
const bookings = new Map<string, Booking>();

export class CatalogError extends Error {
  constructor(
    message: string,
    readonly code: 'HOTEL_NOT_FOUND' | 'INVALID_DATES' | 'UNAVAILABLE' | 'TOO_MANY_GUESTS',
  ) {
    super(message);
    this.name = 'CatalogError';
  }
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new CatalogError('Dates must be ISO calendar dates (YYYY-MM-DD)', 'INVALID_DATES');
  }
  const nights = Math.round((end - start) / DAY_MS);
  if (nights < 1) {
    throw new CatalogError('checkOut must be at least one day after checkIn', 'INVALID_DATES');
  }
  return nights;
}

/** Every night of the stay as an ISO date: check-in night up to, excluding, the check-out day. */
export function nightsOf(checkIn: string, checkOut: string): string[] {
  const nights = nightsBetween(checkIn, checkOut);
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  return Array.from({ length: nights }, (_, index) =>
    new Date(start + index * DAY_MS).toISOString().slice(0, 10),
  );
}

export function toSummary(hotel: Hotel): HotelSummary {
  const { rooms: _rooms, blockedDates: _blockedDates, ...summary } = hotel;
  return summary;
}

export function getHotel(hotelId: string): Hotel | undefined {
  return HOTELS.find((hotel) => hotel.id === hotelId);
}

function requireHotel(hotelId: string): Hotel {
  const hotel = getHotel(hotelId);
  if (!hotel) throw new CatalogError(`No hotel with id "${hotelId}"`, 'HOTEL_NOT_FOUND');
  return hotel;
}

function roomsBookedOn(hotelId: string, night: string): number {
  let count = 0;
  for (const booking of bookings.values()) {
    if (booking.hotelId === hotelId && nightsOf(booking.checkIn, booking.checkOut).includes(night)) {
      count += 1;
    }
  }
  return count;
}

export type AvailabilityResult = {
  available: boolean;
  nights: number;
  totalPrice: number;
  /** Nights that cannot be booked, empty when available. */
  unavailableNights: string[];
};

export function checkAvailability(hotelId: string, checkIn: string, checkOut: string): AvailabilityResult {
  const hotel = requireHotel(hotelId);
  const nights = nightsOf(checkIn, checkOut);
  const unavailableNights = nights.filter(
    (night) => hotel.blockedDates.includes(night) || roomsBookedOn(hotel.id, night) >= hotel.rooms,
  );
  return {
    available: unavailableNights.length === 0,
    nights: nights.length,
    totalPrice: nights.length * hotel.pricePerNight,
    unavailableNights,
  };
}

export type SearchParams = {
  city: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  maxPrice?: number;
  amenities?: Amenity[];
};

export type SearchResult = HotelSummary & { nights: number; totalPrice: number };

/** Hotels in `city` that fit the party, the budget and the amenities, and are free for every night. */
export function searchHotels(params: SearchParams): SearchResult[] {
  const city = params.city.trim().toLowerCase();
  const wanted = params.amenities ?? [];
  const nights = nightsBetween(params.checkIn, params.checkOut);

  return HOTELS.filter((hotel) => hotel.city.toLowerCase() === city)
    .filter((hotel) => hotel.maxGuests >= params.guests)
    .filter((hotel) => params.maxPrice === undefined || hotel.pricePerNight <= params.maxPrice)
    .filter((hotel) => wanted.every((amenity) => hotel.amenities.includes(amenity)))
    .filter((hotel) => checkAvailability(hotel.id, params.checkIn, params.checkOut).available)
    .sort((a, b) => b.rating - a.rating || a.pricePerNight - b.pricePerNight)
    .map((hotel) => ({ ...toSummary(hotel), nights, totalPrice: nights * hotel.pricePerNight }));
}

export type CreateBookingInput = {
  hotelId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  guestName: string;
};

export function createBooking(input: CreateBookingInput): Booking {
  const hotel = requireHotel(input.hotelId);
  if (input.guests > hotel.maxGuests) {
    throw new CatalogError(`${hotel.name} sleeps at most ${hotel.maxGuests} guests per room`, 'TOO_MANY_GUESTS');
  }
  const availability = checkAvailability(hotel.id, input.checkIn, input.checkOut);
  if (!availability.available) {
    throw new CatalogError(
      `${hotel.name} is not available on ${availability.unavailableNights.join(', ')}`,
      'UNAVAILABLE',
    );
  }
  const booking: Booking = {
    id: `bk-${randomUUID().slice(0, 8)}`,
    hotelId: hotel.id,
    hotelName: hotel.name,
    city: hotel.city,
    guestName: input.guestName.trim(),
    guests: input.guests,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    nights: availability.nights,
    pricePerNight: hotel.pricePerNight,
    totalPrice: availability.totalPrice,
    createdAt: new Date().toISOString(),
  };
  bookings.set(booking.id, booking);
  return booking;
}

export function listBookings(): Booking[] {
  return [...bookings.values()];
}

/** Test helper. */
export function resetBookings(): void {
  bookings.clear();
}
