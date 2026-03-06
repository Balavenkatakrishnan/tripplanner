import { useState, useEffect, useCallback } from "react";
import { getDB, Trip, TravelDetail, Place, Hotel, IdProof, SyncAction } from "@/lib/db";
import { pushToServer } from "@/lib/api";
import { SYNC_COMPLETE_EVENT } from "@/hooks/useSync";

export function useTripDetails(tripId: string) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [travels, setTravels] = useState<TravelDetail[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [idProofs, setIdProofs] = useState<IdProof[]>([]);
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

    setTravels(tvs.sort((a,b) => a.departureTime.localeCompare(b.departureTime)));
    setPlaces(pls.sort((a,b) => a.date.localeCompare(b.date)));
    setHotels(hts.sort((a,b) => a.date.localeCompare(b.date)));
    setIdProofs(ids);

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

  const addIdProof = async (data: Omit<IdProof, "id" | "tripId">) => {
    const db = await getDB();
    if (!db) return;
    const newItem: IdProof = { ...data, id: crypto.randomUUID(), tripId };
    await db.put('idProofs', newItem);
    setIdProofs(prev => [...prev, newItem]);
    await queueAction('CREATE', 'idProofs', newItem);
  };

  return { trip, travels, places, hotels, idProofs, loading, addTravel, addPlace, addHotel, addIdProof, refresh: loadData };
}
