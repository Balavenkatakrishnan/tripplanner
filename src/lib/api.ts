import { SyncAction, Trip } from "./db";

// Use the local Next.js API Route for Google Sheets Integration
const API_URL = "/api/sync";

export interface TripsPullResponse {
  trips: Trip[];
  travelDetails: import("./db").TravelDetail[];
  places: import("./db").Place[];
  hotels: import("./db").Hotel[];
  idProofs: import("./db").IdProof[];
}

/** Fetch all trips and related data from server. Works for both organizer and traveler. */
export const fetchSyncData = async (role: "organizer" | "user", identifier: string): Promise<TripsPullResponse> => {
  try {
    const params = role === "organizer"
      ? `role=organizer&identifier=${encodeURIComponent(identifier)}`
      : `role=user&phone=${encodeURIComponent(identifier)}`;
    const res = await fetch(`/api/trips?${params}`, { method: "GET" });
    if (!res.ok) return { trips: [], travelDetails: [], places: [], hotels: [], idProofs: [] };
    const data = await res.json();
    return {
      trips: Array.isArray(data.trips) ? data.trips : [],
      travelDetails: Array.isArray(data.travelDetails) ? data.travelDetails : [],
      places: Array.isArray(data.places) ? data.places : [],
      hotels: Array.isArray(data.hotels) ? data.hotels : [],
      idProofs: Array.isArray(data.idProofs) ? data.idProofs : [],
    };
  } catch {
    return { trips: [], travelDetails: [], places: [], hotels: [], idProofs: [] };
  }
};

/** @deprecated Use fetchSyncData instead */
export const fetchTripsForTraveler = async (phone: string) => fetchSyncData("user", phone);

export const fetchFromServer = async (endpoint: string, params?: Record<string, string>) => {
  // If no real endpoint provided, mock success for development
  if (API_URL.includes("YOUR_SCRIPT_ID")) {
    console.warn("Mocking API fetch: No Google Apps Script URL provided.");
    return { data: [] }; 
  }

  const url = new URL(API_URL);
  url.searchParams.append("action", endpoint);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
  }

  try {
    const res = await fetch(url.toString(), { method: "GET" });
    if (!res.ok) throw new Error("API Fetch Failed");
    return res.json();
  } catch (error) {
    console.error("API GET error", error);
    throw error;
  }
};

export const pushToServer = async (actions: SyncAction[]) => {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json", 
      },
      body: JSON.stringify({ action: "sync", data: actions }),
    });

    if (!res.ok) throw new Error("API Push Failed");
    return res.json();
  } catch (error) {
    console.error("API POST error", error);
    throw error;
  }
};
