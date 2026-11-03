import { beforeEach, describe, expect, it } from 'vitest';
import {
  CatalogError,
  checkAvailability,
  createBooking,
  getHotel,
  listBookings,
  nightsBetween,
  nightsOf,
  resetBookings,
  searchHotels,
} from './catalog';
import { HOTELS } from './hotels';
import { hotelSchema } from './types';

describe('dataset', () => {
  it('has 30 hotels across 4 cities with unique ids and valid shapes', () => {
    expect(HOTELS).toHaveLength(30);
    expect(new Set(HOTELS.map((h) => h.id)).size).toBe(30);
    expect(new Set(HOTELS.map((h) => h.city))).toEqual(new Set(['Lisbon', 'Barcelona', 'Prague', 'Amsterdam']));
    for (const hotel of HOTELS) expect(() => hotelSchema.parse(hotel)).not.toThrow();
  });
});

describe('dates', () => {
  it('counts nights and lists them', () => {
    expect(nightsBetween('2027-05-10', '2027-05-12')).toBe(2);
    expect(nightsOf('2027-05-10', '2027-05-12')).toEqual(['2027-05-10', '2027-05-11']);
  });

  it('rejects zero-length or reversed stays and garbage dates', () => {
    expect(() => nightsBetween('2027-05-10', '2027-05-10')).toThrow(CatalogError);
    expect(() => nightsBetween('2027-05-12', '2027-05-10')).toThrow(/at least one day/);
    expect(() => nightsBetween('next friday', '2027-05-10')).toThrow(/ISO/);
  });
});

describe('searchHotels', () => {
  beforeEach(resetBookings);

  it('is case-insensitive on city and sorts by rating then price', () => {
    const results = searchHotels({ city: 'lisbon', checkIn: '2027-09-01', checkOut: '2027-09-03', guests: 2 });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.city === 'Lisbon')).toBe(true);
    for (let i = 1; i < results.length; i += 1) {
      const prev = results[i - 1]!;
      const curr = results[i]!;
      expect(prev.rating >= curr.rating).toBe(true);
    }
  });

  it('applies guests, price and amenity filters together', () => {
    const results = searchHotels({
      city: 'Prague',
      checkIn: '2027-06-10',
      checkOut: '2027-06-12',
      guests: 3,
      maxPrice: 120,
      amenities: ['breakfast', 'parking'],
    });
    expect(results.map((r) => r.id)).toEqual(['prg-004']);
    expect(results[0]!.totalPrice).toBe(2 * 98);
    expect(results[0]!.nights).toBe(2);
  });

  it('hides hotels with a blocked night inside the stay', () => {
    const ids = searchHotels({ city: 'Lisbon', checkIn: '2027-05-10', checkOut: '2027-05-12', guests: 2 }).map((r) => r.id);
    expect(ids).not.toContain('lis-005'); // blocked 05-10 and 05-11
    expect(ids).toContain('lis-001'); // blocked only on 05-12, which is the checkout day
  });

  it('returns an empty list for unknown cities instead of guessing', () => {
    expect(searchHotels({ city: 'Tokyo', checkIn: '2027-05-10', checkOut: '2027-05-12', guests: 1 })).toEqual([]);
  });

  it('does not leak inventory internals', () => {
    const [first] = searchHotels({ city: 'Amsterdam', checkIn: '2027-08-01', checkOut: '2027-08-02', guests: 1 });
    expect(first).not.toHaveProperty('rooms');
    expect(first).not.toHaveProperty('blockedDates');
  });
});

describe('availability and bookings', () => {
  beforeEach(resetBookings);

  it('reports blocked nights', () => {
    const result = checkAvailability('ams-003', '2027-07-01', '2027-07-03');
    expect(result).toEqual({ available: false, nights: 2, totalPrice: 620, unavailableNights: ['2027-07-02'] });
  });

  it('creates a booking with the right totals', () => {
    const booking = createBooking({ hotelId: 'prg-001', checkIn: '2027-06-10', checkOut: '2027-06-13', guests: 2, guestName: ' Ada Lovelace ' });
    expect(booking).toMatchObject({ hotelId: 'prg-001', hotelName: 'Old Town Clock Hotel', nights: 3, pricePerNight: 120, totalPrice: 360, guestName: 'Ada Lovelace' });
    expect(booking.id).toMatch(/^bk-[0-9a-f]{8}$/);
    expect(listBookings()).toHaveLength(1);
  });

  it('sells out a night once every room is booked', () => {
    const hotel = getHotel('lis-005')!; // 2 rooms
    const stay = { hotelId: hotel.id, checkIn: '2027-09-01', checkOut: '2027-09-02', guests: 2 };
    createBooking({ ...stay, guestName: 'A' });
    createBooking({ ...stay, guestName: 'B' });
    expect(checkAvailability(hotel.id, '2027-09-01', '2027-09-02').available).toBe(false);
    expect(() => createBooking({ ...stay, guestName: 'C' })).toThrow(/not available/);
    // The neighbouring night is untouched.
    expect(checkAvailability(hotel.id, '2027-09-02', '2027-09-03').available).toBe(true);
  });

  it('refuses unknown hotels and oversized parties', () => {
    expect(() => createBooking({ hotelId: 'nope', checkIn: '2027-09-01', checkOut: '2027-09-02', guests: 1, guestName: 'X' })).toThrow(/No hotel/);
    expect(() => createBooking({ hotelId: 'lis-001', checkIn: '2027-09-01', checkOut: '2027-09-02', guests: 5, guestName: 'X' })).toThrow(/at most 2 guests/);
  });
});
