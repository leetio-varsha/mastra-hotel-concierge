import { beforeEach, describe, expect, it } from 'vitest';
import { resetBookings } from '../data/catalog';
import { checkAvailabilityTool, conciergeTools, createBookingTool, getHotelDetailsTool, searchHotelsTool } from './hotel-tools';

const ctx = {};

describe('search_hotels', () => {
  it('returns matching hotels with stay totals', async () => {
    const out = await searchHotelsTool.execute!(
      { city: 'Prague', checkIn: '2027-06-10', checkOut: '2027-06-12', guests: 2, maxPrice: 100, amenities: ['breakfast'] },
      ctx,
    );
    expect(out).toMatchObject({ results: [{ id: 'prg-004', totalPrice: 196 }, { id: 'prg-007', totalPrice: 176 }] });
  });

  it('turns bad dates into an error payload instead of throwing', async () => {
    const out = await searchHotelsTool.execute!({ city: 'Prague', checkIn: '2027-06-12', checkOut: '2027-06-10', guests: 2 }, ctx);
    expect(out).toMatchObject({ results: [], code: 'INVALID_DATES' });
  });
});

describe('get_hotel_details', () => {
  it('returns the public hotel record', async () => {
    const out = await getHotelDetailsTool.execute!({ hotelId: 'ams-003' }, ctx);
    expect(out).toMatchObject({ hotel: { id: 'ams-003', name: 'Museumplein Grand Hotel', pricePerNight: 310 } });
    expect(out).not.toHaveProperty('hotel.rooms');
  });

  it('reports unknown ids', async () => {
    expect(await getHotelDetailsTool.execute!({ hotelId: 'xyz' }, ctx)).toMatchObject({ code: 'HOTEL_NOT_FOUND' });
  });
});

describe('check_availability', () => {
  it('flags blocked nights', async () => {
    const out = await checkAvailabilityTool.execute!({ hotelId: 'ams-003', checkIn: '2027-07-01', checkOut: '2027-07-03' }, ctx);
    expect(out).toEqual({ available: false, nights: 2, totalPrice: 620, unavailableNights: ['2027-07-02'] });
  });
});

describe('create_booking', () => {
  beforeEach(resetBookings);

  it('books and then refuses the same room once full', async () => {
    const stay = { hotelId: 'lis-005', checkIn: '2027-09-01', checkOut: '2027-09-02', guests: 2 };
    const first = await createBookingTool.execute!({ ...stay, guestName: 'Ada' }, ctx);
    expect(first).toMatchObject({ booking: { hotelName: 'Chiado Boutique Stay', totalPrice: 180 } });
    await createBookingTool.execute!({ ...stay, guestName: 'Grace' }, ctx);
    const third = await createBookingTool.execute!({ ...stay, guestName: 'Linus' }, ctx);
    expect(third).toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('is not part of the concierge tool set', () => {
    expect(Object.values(conciergeTools).map((t) => t.id)).not.toContain('create_booking');
    expect(Object.keys(conciergeTools)).toEqual(['search_hotels', 'get_hotel_details', 'check_availability']);
  });
});
