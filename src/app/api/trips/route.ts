import { NextResponse } from "next/server";
import { google } from "googleapis";
import { Trip, TravelDetail, Place, Hotel, IdProof } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

type TableName = "trips" | "travelDetails" | "places" | "hotels" | "idProofs";

const EMPTY = { trips: [], travelDetails: [], places: [], hotels: [], idProofs: [] };

/**
 * GET /api/trips
 * - role=user&phone=1234567890 → traveler's trips
 * - role=organizer&identifier=admin@bvk.com → organizer's trips
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const role = searchParams.get("role");
    const phone = normalizePhone(searchParams.get("phone") || "");
    const identifier = searchParams.get("identifier") || "";

    const { GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID } = process.env;
    if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_SHEET_ID) {
      return NextResponse.json(EMPTY);
    }

    // Validate: need either traveler (phone) or organizer (identifier)
    const isTraveler = role === "user" && phone.length >= 10;
    const isOrganizer = role === "organizer" && identifier.length > 0;
    if (!isTraveler && !isOrganizer) {
      return NextResponse.json(EMPTY);
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: GOOGLE_CLIENT_EMAIL,
        private_key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      },
      scopes: SCOPES,
    });
    const sheets = google.sheets({ version: "v4", auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: "Sheet1!A:D",
    });
    const rows = response.data.values || [];

    const tripMap = new Map<string, Trip>();
    const travelDetailsMap = new Map<string, TravelDetail>();
    const placesMap = new Map<string, Place>();
    const hotelsMap = new Map<string, Hotel>();
    const idProofsMap = new Map<string, IdProof>();

    const tables: TableName[] = ["trips", "travelDetails", "places", "hotels", "idProofs"];
    const mapByTable = {
      trips: tripMap,
      travelDetails: travelDetailsMap,
      places: placesMap,
      hotels: hotelsMap,
      idProofs: idProofsMap,
    } as const;

    for (const row of rows) {
      if (row.length < 4) continue;
      const [, type, table, payloadStr] = row;
      if (!tables.includes(table as TableName)) continue;
      try {
        const payload = JSON.parse(payloadStr as string);
        const map = mapByTable[table as TableName];
        const id = payload.id;
        if (type === "CREATE" || type === "UPDATE") {
          map.set(id, payload);
        } else if (type === "DELETE" && id) {
          map.delete(id);
        }
      } catch {
        // skip invalid rows
      }
    }

    const trips = Array.from(tripMap.values()).filter((t) => {
      if (isTraveler) {
        const phones = (t.travelerPhones || []).map((p) => normalizePhone(p));
        return phones.includes(phone);
      }
      return t.createdBy === identifier;
    });

    trips.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const tripIds = new Set(trips.map((t) => t.id));

    const travelDetails = Array.from(travelDetailsMap.values()).filter((td) => tripIds.has(td.tripId));
    const places = Array.from(placesMap.values()).filter((p) => tripIds.has(p.tripId));
    const hotels = Array.from(hotelsMap.values()).filter((h) => tripIds.has(h.tripId));
    const idProofs = Array.from(idProofsMap.values()).filter((i) => tripIds.has(i.tripId));

    return NextResponse.json({
      trips,
      travelDetails,
      places,
      hotels,
      idProofs,
    });
  } catch (error) {
    console.error("Trips API error", error);
    return NextResponse.json({ trips: [], travelDetails: [], places: [], hotels: [], idProofs: [] });
  }
}
