import { useState, useEffect, useCallback } from "react";
import { getDB, Trip, SyncAction } from "@/lib/db";
import { useAuth } from "@/context/AuthContext";
import { pushToServer } from "@/lib/api";

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
        // Normal Travelers: Only fetch trips where their exact phone number is in the travelerPhones array
        const allTrips = await db.getAll('trips');
        localTrips = allTrips.filter(trip => trip.travelerPhones && trip.travelerPhones.includes(user.phoneNumber as string));
    }
    
    // Sort by newest
    localTrips.sort((a, b) => b.createdAt - a.createdAt);
    
    setTrips(localTrips);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadTrips();
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
