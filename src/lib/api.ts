import { SyncAction } from "./db";

// Use the local Next.js API Route for Google Sheets Integration
const API_URL = "/api/sync";

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
