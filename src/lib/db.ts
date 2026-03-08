import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface Trip {
  id: string; // uuid
  name: string;
  startDate: string;
  endDate: string;
  createdBy: string;
  travelerPhones: string[]; // array of phone numbers allowed to view
  travelerNames?: Record<string, string>; // phone -> display name
  createdAt: number;
}

export interface TravelDetail {
  id: string;
  tripId: string;
  date: string;
  dateTo?: string;
  mode: 'bike' | 'car' | 'train' | 'plane';
  departureTime: string; // ISO datetime or HH:mm
  arrivalTime: string;
  origin: string;
  destination: string;
  bookingNeeded?: boolean;
  isBooked?: boolean;
}

export interface Place {
  id: string;
  tripId: string;
  date: string;
  dateTo?: string;
  name: string;
  location?: string;
  notes?: string;
  visitTime?: string; // HH:mm or ISO
  bookingNeeded?: boolean;
  isBooked?: boolean;
}

export interface Hotel {
  id: string;
  tripId: string;
  date: string;
  dateTo?: string;
  name: string;
  address?: string;
  checkInTime?: string;
  checkOutTime?: string;
  bookingNeeded?: boolean;
  isBooked?: boolean;
}

export interface Expense {
  id: string;
  tripId: string;
  addedBy: string;
  description: string;
  amount: number;
  currency: string;
  splitType: 'equal' | 'custom';
  splits: { identifier: string; amount: number }[];
  date?: string; // date of expense (YYYY-MM-DD)
  createdAt: number;
}

export interface IdProof {
  id: string;
  tripId: string;
  name: string;
  link: string; // Google Drive link or other URL
}

export interface SyncAction {
  id: string;
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  table: 'trips' | 'travelDetails' | 'places' | 'hotels' | 'idProofs' | 'expenses';
  payload: any;
  timestamp: number;
}

interface TripPlannerDB extends DBSchema {
  trips: { key: string; value: Trip; indexes: { 'by-user': string } };
  travelDetails: { key: string; value: TravelDetail; indexes: { 'by-trip': string } };
  places: { key: string; value: Place; indexes: { 'by-trip': string } };
  hotels: { key: string; value: Hotel; indexes: { 'by-trip': string } };
  idProofs: { key: string; value: IdProof; indexes: { 'by-trip': string } };
  expenses: { key: string; value: Expense; indexes: { 'by-trip': string } };
  syncQueue: { key: string; value: SyncAction };
}

let dbPromise: Promise<IDBPDatabase<TripPlannerDB>> | null = null;

export const getDB = () => {
  if (typeof window === 'undefined') return null; // SSR safety
  
  if (!dbPromise) {
    dbPromise = openDB<TripPlannerDB>('trip-planner-db', 2, {
      upgrade(db, oldVersion, newVersion) {
        if (!db.objectStoreNames.contains('trips')) {
          const tripStore = db.createObjectStore('trips', { keyPath: 'id' });
          tripStore.createIndex('by-user', 'createdBy');
        }
        if (!db.objectStoreNames.contains('travelDetails')) {
          const travelStore = db.createObjectStore('travelDetails', { keyPath: 'id' });
          travelStore.createIndex('by-trip', 'tripId');
        }
        if (!db.objectStoreNames.contains('places')) {
          const placesStore = db.createObjectStore('places', { keyPath: 'id' });
          placesStore.createIndex('by-trip', 'tripId');
        }
        if (!db.objectStoreNames.contains('hotels')) {
          const hotelsStore = db.createObjectStore('hotels', { keyPath: 'id' });
          hotelsStore.createIndex('by-trip', 'tripId');
        }
        if (!db.objectStoreNames.contains('idProofs')) {
          const proofsStore = db.createObjectStore('idProofs', { keyPath: 'id' });
          proofsStore.createIndex('by-trip', 'tripId');
        }
        if (oldVersion < 2 && !db.objectStoreNames.contains('expenses')) {
          const expensesStore = db.createObjectStore('expenses', { keyPath: 'id' });
          expensesStore.createIndex('by-trip', 'tripId');
        }
        if (!db.objectStoreNames.contains('syncQueue')) {
          db.createObjectStore('syncQueue', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
};
