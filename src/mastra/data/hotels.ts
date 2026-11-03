import type { Hotel } from './types';

/**
 * Mock inventory: 30 hotels across 4 cities. Prices are EUR per room per night.
 * `blockedDates` are nights that are sold out no matter what; `rooms` caps how many
 * bookings can share a night. Both are deliberately small so demos hit "unavailable" paths.
 */
export const HOTELS: readonly Hotel[] = [
  // Lisbon
  { id: 'lis-001', name: 'Alfama River House', city: 'Lisbon', neighborhood: 'Alfama', pricePerNight: 145, rating: 4.6, amenities: ['wifi', 'breakfast', 'view', 'bar'], maxGuests: 2, rooms: 3, blockedDates: ['2027-05-12'] },
  { id: 'lis-002', name: 'Bairro Alto Loft Hotel', city: 'Lisbon', neighborhood: 'Bairro Alto', pricePerNight: 110, rating: 4.2, amenities: ['wifi', 'kitchen', 'bar'], maxGuests: 3, rooms: 4, blockedDates: [] },
  { id: 'lis-003', name: 'Tejo Grand Palace', city: 'Lisbon', neighborhood: 'Baixa', pricePerNight: 320, rating: 4.8, amenities: ['wifi', 'breakfast', 'pool', 'spa', 'gym', 'restaurant', 'bar', 'parking'], maxGuests: 4, rooms: 5, blockedDates: [] },
  { id: 'lis-004', name: 'Belém Garden Inn', city: 'Lisbon', neighborhood: 'Belém', pricePerNight: 95, rating: 4.0, amenities: ['wifi', 'breakfast', 'parking', 'pet-friendly'], maxGuests: 2, rooms: 6, blockedDates: [] },
  { id: 'lis-005', name: 'Chiado Boutique Stay', city: 'Lisbon', neighborhood: 'Chiado', pricePerNight: 180, rating: 4.5, amenities: ['wifi', 'breakfast', 'gym', 'bar'], maxGuests: 2, rooms: 2, blockedDates: ['2027-05-10', '2027-05-11'] },
  { id: 'lis-006', name: 'Parque das Nações Suites', city: 'Lisbon', neighborhood: 'Parque das Nações', pricePerNight: 125, rating: 4.1, amenities: ['wifi', 'pool', 'gym', 'kitchen', 'parking'], maxGuests: 4, rooms: 8, blockedDates: [] },
  { id: 'lis-007', name: 'Mouraria Budget Rooms', city: 'Lisbon', neighborhood: 'Mouraria', pricePerNight: 62, rating: 3.6, amenities: ['wifi'], maxGuests: 2, rooms: 10, blockedDates: [] },
  { id: 'lis-008', name: 'Cascais Seaside Resort', city: 'Lisbon', neighborhood: 'Cascais', pricePerNight: 240, rating: 4.7, amenities: ['wifi', 'breakfast', 'pool', 'spa', 'view', 'restaurant', 'parking', 'airport-shuttle'], maxGuests: 3, rooms: 4, blockedDates: [] },

  // Barcelona
  { id: 'bcn-001', name: 'Gràcia Courtyard Hotel', city: 'Barcelona', neighborhood: 'Gràcia', pricePerNight: 130, rating: 4.4, amenities: ['wifi', 'breakfast', 'bar'], maxGuests: 2, rooms: 4, blockedDates: [] },
  { id: 'bcn-002', name: 'Barceloneta Beach Club', city: 'Barcelona', neighborhood: 'Barceloneta', pricePerNight: 210, rating: 4.5, amenities: ['wifi', 'pool', 'view', 'bar', 'restaurant', 'gym'], maxGuests: 2, rooms: 3, blockedDates: ['2027-07-15'] },
  { id: 'bcn-003', name: 'Eixample Design Rooms', city: 'Barcelona', neighborhood: 'Eixample', pricePerNight: 160, rating: 4.3, amenities: ['wifi', 'breakfast', 'gym'], maxGuests: 2, rooms: 5, blockedDates: [] },
  { id: 'bcn-004', name: 'Gothic Quarter Hostal Sol', city: 'Barcelona', neighborhood: 'Barri Gòtic', pricePerNight: 70, rating: 3.8, amenities: ['wifi'], maxGuests: 2, rooms: 8, blockedDates: [] },
  { id: 'bcn-005', name: 'Montjuïc Hilltop Spa', city: 'Barcelona', neighborhood: 'Sants-Montjuïc', pricePerNight: 290, rating: 4.8, amenities: ['wifi', 'breakfast', 'pool', 'spa', 'view', 'restaurant', 'parking'], maxGuests: 3, rooms: 3, blockedDates: [] },
  { id: 'bcn-006', name: 'Poblenou Apart-Hotel', city: 'Barcelona', neighborhood: 'Poblenou', pricePerNight: 115, rating: 4.1, amenities: ['wifi', 'kitchen', 'parking', 'pet-friendly'], maxGuests: 4, rooms: 6, blockedDates: [] },
  { id: 'bcn-007', name: 'Sagrada Família View Inn', city: 'Barcelona', neighborhood: 'Eixample', pricePerNight: 175, rating: 4.4, amenities: ['wifi', 'breakfast', 'view', 'bar'], maxGuests: 2, rooms: 2, blockedDates: [] },

  // Prague
  { id: 'prg-001', name: 'Old Town Clock Hotel', city: 'Prague', neighborhood: 'Staré Město', pricePerNight: 120, rating: 4.5, amenities: ['wifi', 'breakfast', 'bar'], maxGuests: 2, rooms: 4, blockedDates: ['2027-06-02'] },
  { id: 'prg-002', name: 'Vltava Riverside Suites', city: 'Prague', neighborhood: 'Malá Strana', pricePerNight: 165, rating: 4.6, amenities: ['wifi', 'breakfast', 'view', 'spa', 'restaurant'], maxGuests: 3, rooms: 3, blockedDates: [] },
  { id: 'prg-003', name: 'Žižkov Backpacker Lodge', city: 'Prague', neighborhood: 'Žižkov', pricePerNight: 45, rating: 3.5, amenities: ['wifi', 'kitchen', 'bar'], maxGuests: 2, rooms: 12, blockedDates: [] },
  { id: 'prg-004', name: 'Vinohrady Garden Residence', city: 'Prague', neighborhood: 'Vinohrady', pricePerNight: 98, rating: 4.2, amenities: ['wifi', 'breakfast', 'parking', 'pet-friendly'], maxGuests: 3, rooms: 5, blockedDates: [] },
  { id: 'prg-005', name: 'Castle Hill Grand', city: 'Prague', neighborhood: 'Hradčany', pricePerNight: 260, rating: 4.8, amenities: ['wifi', 'breakfast', 'spa', 'gym', 'view', 'restaurant', 'bar', 'parking'], maxGuests: 4, rooms: 4, blockedDates: [] },
  { id: 'prg-006', name: 'Karlín Loft Hotel', city: 'Prague', neighborhood: 'Karlín', pricePerNight: 105, rating: 4.3, amenities: ['wifi', 'gym', 'kitchen', 'bar'], maxGuests: 2, rooms: 6, blockedDates: [] },
  { id: 'prg-007', name: 'Holešovice Art Stay', city: 'Prague', neighborhood: 'Holešovice', pricePerNight: 88, rating: 4.0, amenities: ['wifi', 'breakfast', 'pet-friendly'], maxGuests: 2, rooms: 4, blockedDates: [] },
  { id: 'prg-008', name: 'Airport Transit Hotel Prague', city: 'Prague', neighborhood: 'Ruzyně', pricePerNight: 75, rating: 3.7, amenities: ['wifi', 'airport-shuttle', 'parking', 'restaurant'], maxGuests: 2, rooms: 10, blockedDates: [] },

  // Amsterdam
  { id: 'ams-001', name: 'Jordaan Canal House', city: 'Amsterdam', neighborhood: 'Jordaan', pricePerNight: 190, rating: 4.6, amenities: ['wifi', 'breakfast', 'view', 'bar'], maxGuests: 2, rooms: 3, blockedDates: [] },
  { id: 'ams-002', name: 'De Pijp Budget Hotel', city: 'Amsterdam', neighborhood: 'De Pijp', pricePerNight: 85, rating: 3.9, amenities: ['wifi', 'breakfast'], maxGuests: 2, rooms: 8, blockedDates: [] },
  { id: 'ams-003', name: 'Museumplein Grand Hotel', city: 'Amsterdam', neighborhood: 'Oud-Zuid', pricePerNight: 310, rating: 4.9, amenities: ['wifi', 'breakfast', 'spa', 'gym', 'pool', 'restaurant', 'bar', 'parking'], maxGuests: 3, rooms: 4, blockedDates: ['2027-07-02'] },
  { id: 'ams-004', name: 'Noord Waterfront Lofts', city: 'Amsterdam', neighborhood: 'Noord', pricePerNight: 140, rating: 4.3, amenities: ['wifi', 'kitchen', 'view', 'parking', 'pet-friendly'], maxGuests: 4, rooms: 5, blockedDates: [] },
  { id: 'ams-005', name: 'Oost Family Suites', city: 'Amsterdam', neighborhood: 'Oost', pricePerNight: 150, rating: 4.2, amenities: ['wifi', 'breakfast', 'kitchen', 'parking', 'gym'], maxGuests: 5, rooms: 6, blockedDates: [] },
  { id: 'ams-006', name: 'Schiphol Runway Inn', city: 'Amsterdam', neighborhood: 'Schiphol', pricePerNight: 99, rating: 3.8, amenities: ['wifi', 'airport-shuttle', 'parking', 'restaurant'], maxGuests: 2, rooms: 12, blockedDates: [] },
  { id: 'ams-007', name: 'Red Light Heritage Rooms', city: 'Amsterdam', neighborhood: 'De Wallen', pricePerNight: 120, rating: 4.0, amenities: ['wifi', 'bar'], maxGuests: 2, rooms: 4, blockedDates: [] },
];
