import { useState, useEffect, useCallback } from "react";
import { getDB, Trip, SyncAction } from "@/lib/db";
import { useAuth } from "@/context/AuthContext";
import { pushToServer } from "@/lib/api";
import { normalizePhone } from "@/lib/phone";
import { fetchSyncData } from "@/lib/api";
import { SYNC_COMPLETE_EVENT } from "@/hooks/useSync";

export function useTrips() {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTrips = useCallback(async () => {
    if (!user) return;
    const db = await getDB();
    if (!db) return;

    let localTrips: Trip[] = [];
    
    if (user.role === 'organizer') {
        localTrips = await db.getAllFromIndex('trips', 'by-user', user.username || user.id);
    } else {
        // Travelers: fetch trips where their phone is in travelerPhones (normalized comparison)
        const userPhone = normalizePhone(user.phoneNumber);
        if (!userPhone) {
          setTrips([]);
          setLoading(false);
          return;
        }

        const allTrips = await db.getAll('trips');
        localTrips = allTrips.filter(trip => {
          const phones = trip.travelerPhones || [];
          return phones.some(p => normalizePhone(p) === userPhone);
        });

        // If no local trips, try to pull from server (multi-device)
        if (localTrips.length === 0) {
          try {
            const data = await fetchSyncData("user", userPhone);
            if (data.trips.length > 0) {
              for (const t of data.trips) await db.put("trips", t);
              for (const td of data.travelDetails) await db.put("travelDetails", td);
              for (const p of data.places) await db.put("places", p);
              for (const h of data.hotels) await db.put("hotels", h);
              for (const i of data.idProofs) await db.put("idProofs", i);
              for (const e of data.expenses) await db.put("expenses", e);
              localTrips = data.trips;
            }
          } catch {
            // Offline or server error - keep empty
          }
        }
    }
    
    // Sort by newest
    localTrips.sort((a, b) => b.createdAt - a.createdAt);
    
    setTrips(localTrips);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  useEffect(() => {
    const onSync = () => loadTrips();
    window.addEventListener(SYNC_COMPLETE_EVENT, onSync);
    return () => window.removeEventListener(SYNC_COMPLETE_EVENT, onSync);
  }, [loadTrips]);

  const addTrip = async (trip: Omit<Trip, "id" | "createdAt" | "createdBy">) => {
    if (!user) return;
    const db = await getDB();
    if (!db) return;

    const newTrip: Trip = {
      ...trip,
      id: crypto.randomUUID(),
      createdBy: user.role === 'organizer' ? (user.username || user.id) : user.id,
      travelerPhones: [],
      createdAt: Date.now(),
    };

    // Save to local DB
    await db.put('trips', newTrip);
    setTrips(prev => [newTrip, ...prev]);

    // Queue sync action
    const action: SyncAction = {
      id: crypto.randomUUID(),
      type: 'CREATE',
      table: 'trips',
      payload: newTrip,
      timestamp: Date.now(),
    };
    await db.put('syncQueue', action);

    // Try syncing immediately
    try {
      await pushToServer([action]);
      await db.delete('syncQueue', action.id);
    } catch {
      // Offline, action stays in queue
    }
    
    return newTrip.id;
  };

  return { trips, loading, addTrip, refresh: loadTrips };
}
