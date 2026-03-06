"use client";

import { useCallback, useEffect, useRef, useState, createContext, useContext } from "react";
import { getDB } from "@/lib/db";
import { useAuth } from "@/context/AuthContext";
import { pushToServer, fetchSyncData } from "@/lib/api";
import { normalizePhone } from "@/lib/phone";

export const SYNC_COMPLETE_EVENT = "trip-planner-sync-complete";

/**
 * Push pending sync queue to server, then pull latest data and merge into IndexedDB.
 * Dispatches SYNC_COMPLETE_EVENT when done so useTrips/useTripDetails can refresh.
 */
export async function runSync(user: { role: string | null; username?: string; phoneNumber?: string; id?: string }): Promise<void> {
  if (!user || !user.role) return;
  const db = await getDB();
  if (!db) return;

  // 1. Push pending queue first
  const pending = await db.getAll("syncQueue");
  if (pending.length > 0) {
    try {
      await pushToServer(pending);
      for (const a of pending) await db.delete("syncQueue", a.id);
    } catch {
      // Offline - queue stays, we'll still try to pull
    }
  }

  // 2. Pull from server
  const role = user.role === "organizer" ? "organizer" : "user";
  const identifier = role === "organizer" ? (user.username || user.id || "") : normalizePhone(user.phoneNumber || "");
  if (!identifier || (role === "user" && identifier.length < 10)) return;

  try {
    const data = await fetchSyncData(role, identifier);
    if (data.trips.length === 0) return;

    const serverTripIds = new Set(data.trips.map((t) => t.id));

    // 3. Get our current local trip IDs (to detect deletions)
    const allLocalTrips = await db.getAll("trips");
    const ourLocalTripIds = new Set(
      allLocalTrips.filter((t) =>
        role === "organizer"
          ? t.createdBy === identifier
          : (t.travelerPhones || []).some((p) => normalizePhone(p) === identifier)
      ).map((t) => t.id)
    );

    // 4. Delete local trips that no longer exist on server
    const toRemove = [...ourLocalTripIds].filter((id) => !serverTripIds.has(id));
    for (const tripId of toRemove) {
      const tds = await db.getAllFromIndex("travelDetails", "by-trip", tripId);
      const pls = await db.getAllFromIndex("places", "by-trip", tripId);
      const hts = await db.getAllFromIndex("hotels", "by-trip", tripId);
      const ids = await db.getAllFromIndex("idProofs", "by-trip", tripId);
      for (const td of tds) await db.delete("travelDetails", td.id);
      for (const p of pls) await db.delete("places", p.id);
      for (const h of hts) await db.delete("hotels", h.id);
      for (const i of ids) await db.delete("idProofs", i.id);
      await db.delete("trips", tripId);
    }

    // 5. Put server data
    for (const t of data.trips) await db.put("trips", t);
    for (const td of data.travelDetails) await db.put("travelDetails", td);
    for (const p of data.places) await db.put("places", p);
    for (const h of data.hotels) await db.put("hotels", h);
    for (const i of data.idProofs) await db.put("idProofs", i);

    // 6. Notify listeners to refresh
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(SYNC_COMPLETE_EVENT));
    }
  } catch {
    // Network error - skip merge
  }
}

const SyncContext = createContext<{ sync: () => Promise<void>; isSyncing: boolean } | null>(null);

export function useSyncContext() {
  return useContext(SyncContext);
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const syncRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const sync = useCallback(async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
      await runSync(user);
    } finally {
      setIsSyncing(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    // Initial sync
    sync();

    // Sync when tab becomes visible
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Sync every 30 seconds
    syncRef.current = setInterval(sync, 30_000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (syncRef.current) clearInterval(syncRef.current);
    };
  }, [user, sync]);

  return (
    <SyncContext.Provider value={{ sync, isSyncing }}>
      {children}
    </SyncContext.Provider>
  );
}
