import { useState, useEffect, useCallback } from "react";
import { getDB, Trip, TravelDetail, Place, Hotel, IdProof, Expense, SyncAction } from "@/lib/db";
import { pushToServer } from "@/lib/api";
import { normalizePhone } from "@/lib/phone";
import { SYNC_COMPLETE_EVENT } from "@/hooks/useSync";

export function useTripDetails(tripId: string) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [travels, setTravels] = useState<TravelDetail[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [idProofs, setIdProofs] = useState<IdProof[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!tripId) return;
    const db = await getDB();
    if (!db) return;

    const t = await db.get('trips', tripId);
    if (t) setTrip(t);

    const tvs = await db.getAllFromIndex('travelDetails', 'by-trip', tripId);
    const pls = await db.getAllFromIndex('places', 'by-trip', tripId);
    const hts = await db.getAllFromIndex('hotels', 'by-trip', tripId);
    const ids = await db.getAllFromIndex('idProofs', 'by-trip', tripId);
    const exps = await db.getAllFromIndex('expenses', 'by-trip', tripId);

    setTravels(tvs.sort((a,b) => a.departureTime.localeCompare(b.departureTime)));
    setPlaces(pls.sort((a,b) => a.date.localeCompare(b.date)));
    setHotels(hts.sort((a,b) => a.date.localeCompare(b.date)));
    setIdProofs(ids);
    setExpenses(exps.sort((a, b) => b.createdAt - a.createdAt));

    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const onSync = () => loadData();
    window.addEventListener(SYNC_COMPLETE_EVENT, onSync);
    return () => window.removeEventListener(SYNC_COMPLETE_EVENT, onSync);
  }, [loadData]);

  const queueAction = async (type: 'CREATE' | 'UPDATE' | 'DELETE', table: any, payload: any) => {
    const db = await getDB();
    if (!db) return;
    const action: SyncAction = {
      id: crypto.randomUUID(),
      type, table, payload, timestamp: Date.now()
    };
    await db.put('syncQueue', action);
    try {
      await pushToServer([action]);
      await db.delete('syncQueue', action.id);
    } catch {}
  };

  const addTravel = async (data: Omit<TravelDetail, "id" | "tripId">) => {
    const db = await getDB();
    if (!db) return;
    const newItem: TravelDetail = { ...data, id: crypto.randomUUID(), tripId };
    await db.put('travelDetails', newItem);
    setTravels(prev => [...prev, newItem].sort((a,b) => a.departureTime.localeCompare(b.departureTime)));
    await queueAction('CREATE', 'travelDetails', newItem);
  };

  const addPlace = async (data: Omit<Place, "id" | "tripId">) => {
    const db = await getDB();
    if (!db) return;
    const newItem: Place = { ...data, id: crypto.randomUUID(), tripId };
    await db.put('places', newItem);
    setPlaces(prev => [...prev, newItem].sort((a,b) => a.date.localeCompare(b.date)));
    await queueAction('CREATE', 'places', newItem);
  };

  const addHotel = async (data: Omit<Hotel, "id" | "tripId">) => {
    const db = await getDB();
    if (!db) return;
    const newItem: Hotel = { ...data, id: crypto.randomUUID(), tripId };
    await db.put('hotels', newItem);
    setHotels(prev => [...prev, newItem].sort((a,b) => a.date.localeCompare(b.date)));
    await queueAction('CREATE', 'hotels', newItem);
  };

  const updateTravel = async (data: TravelDetail) => {
    const db = await getDB();
    if (!db) return;
    await db.put('travelDetails', data);
    setTravels(prev => prev.map(t => t.id === data.id ? data : t).sort((a,b) => a.departureTime.localeCompare(b.departureTime)));
    await queueAction('UPDATE', 'travelDetails', data);
  };

  const updatePlace = async (data: Place) => {
    const db = await getDB();
    if (!db) return;
    await db.put('places', data);
    setPlaces(prev => prev.map(p => p.id === data.id ? data : p).sort((a,b) => a.date.localeCompare(b.date)));
    await queueAction('UPDATE', 'places', data);
  };

  const updateHotel = async (data: Hotel) => {
    const db = await getDB();
    if (!db) return;
    await db.put('hotels', data);
    setHotels(prev => prev.map(h => h.id === data.id ? data : h).sort((a,b) => a.date.localeCompare(b.date)));
    await queueAction('UPDATE', 'hotels', data);
  };

  const addIdProof = async (data: Omit<IdProof, "id" | "tripId">) => {
    const db = await getDB();
    if (!db) return;
    const newItem: IdProof = { ...data, id: crypto.randomUUID(), tripId };
    await db.put('idProofs', newItem);
    setIdProofs(prev => [...prev, newItem]);
    await queueAction('CREATE', 'idProofs', newItem);
  };

  const addExpense = async (data: Omit<Expense, "id" | "tripId" | "createdAt">) => {
    const db = await getDB();
    if (!db) return;
    const newItem: Expense = { ...data, id: crypto.randomUUID(), tripId, createdAt: Date.now() };
    await db.put('expenses', newItem);
    setExpenses(prev => [newItem, ...prev]);
    await queueAction('CREATE', 'expenses', newItem);
  };

  const removeTraveler = async (phone: string) => {
    const db = await getDB();
    if (!db || !trip) return;
    const toRemove = normalizePhone(phone);
    const updatedPhones = (trip.travelerPhones || []).filter((p) => normalizePhone(p) !== toRemove);
    const names = { ...(trip.travelerNames || {}) };
    delete names[phone];
    delete names[toRemove];
    const updatedTrip = { ...trip, travelerPhones: updatedPhones, travelerNames: Object.keys(names).length ? names : undefined };
    await db.put('trips', updatedTrip);
    setTrip(updatedTrip);
    await queueAction('UPDATE', 'trips', updatedTrip);
  };

  const deleteTrip = async () => {
    const db = await getDB();
    if (!db) return;
    const [travelsList, placesList, hotelsList, idsList, expensesList] = await Promise.all([
      db.getAllFromIndex('travelDetails', 'by-trip', tripId),
      db.getAllFromIndex('places', 'by-trip', tripId),
      db.getAllFromIndex('hotels', 'by-trip', tripId),
      db.getAllFromIndex('idProofs', 'by-trip', tripId),
      db.getAllFromIndex('expenses', 'by-trip', tripId),
    ]);
    for (const row of travelsList) await db.delete('travelDetails', row.id);
    for (const row of placesList) await db.delete('places', row.id);
    for (const row of hotelsList) await db.delete('hotels', row.id);
    for (const row of idsList) await db.delete('idProofs', row.id);
    for (const row of expensesList) await db.delete('expenses', row.id);
    await db.delete('trips', tripId);
    await queueAction('DELETE', 'trips', { id: tripId });
    for (const row of travelsList) await queueAction('DELETE', 'travelDetails', { id: row.id });
    for (const row of placesList) await queueAction('DELETE', 'places', { id: row.id });
    for (const row of hotelsList) await queueAction('DELETE', 'hotels', { id: row.id });
    for (const row of idsList) await queueAction('DELETE', 'idProofs', { id: row.id });
    for (const row of expensesList) await queueAction('DELETE', 'expenses', { id: row.id });
    setTrip(null);
    setTravels([]);
    setPlaces([]);
    setHotels([]);
    setIdProofs([]);
    setExpenses([]);
  };

  return { trip, travels, places, hotels, idProofs, expenses, loading, addTravel, addPlace, addHotel, updateTravel, updatePlace, updateHotel, removeTraveler, addIdProof, addExpense, deleteTrip, refresh: loadData };
}
