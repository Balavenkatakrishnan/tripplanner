import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { SyncAction } from '@/lib/db';

// Required Environment Variables:
// GOOGLE_CLIENT_EMAIL
// GOOGLE_PRIVATE_KEY
// GOOGLE_SHEET_ID
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

export async function POST(req: Request) {
  try {
    const { action, data } = await req.json();

    if (action !== 'sync' || !Array.isArray(data)) {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }

    const { GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID } = process.env;

    // Local dev mock fallback if env vars missing
    if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_SHEET_ID) {
      console.warn('⚠️ Missing Google Credentials in .env, skipping real Google Sheets API sync.');
      return NextResponse.json({ success: true, message: 'Mocked Sync (Missing Env Vars)' });
    }

    // Format the private key to handle line breaks properly from string
    const privateKey = GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');

    // Authenticate
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: GOOGLE_CLIENT_EMAIL,
        private_key: privateKey,
      },
      scopes: SCOPES,
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const syncActions = data as SyncAction[];

    // Extract 'users' actions to put them in the Users sheet
    const userActions = syncActions.filter(a => a.table === 'Users' as any);
    if (userActions.length > 0) {
      const usersToAppend = userActions.map(a => [a.payload.role, a.payload.identifier, '']);
       await sheets.spreadsheets.values.append({
        spreadsheetId: GOOGLE_SHEET_ID,
        range: 'Users!A:C',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: usersToAppend },
      });
    }

    // Process regular logs to Sheet1
    const logActions = syncActions.filter(a => a.table !== 'Users' as any);
    const rowsToAppend = logActions.map(action => [
      new Date(action.timestamp).toISOString(),
      action.type,
      action.table,
      JSON.stringify(action.payload)
    ]);

    if (rowsToAppend.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: GOOGLE_SHEET_ID,
        range: 'Sheet1!A:D', // Default sheet created by Google is named 'Sheet1'
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: rowsToAppend,
        },
      });
    }

    return NextResponse.json({ success: true, syncedUsers: userActions.length, syncedLogs: rowsToAppend.length });

  } catch (error: any) {
    console.error('Google Sheets API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
