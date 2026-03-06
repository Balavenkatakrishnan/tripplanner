import { NextResponse } from 'next/server';
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

export async function POST(req: Request) {
  try {
    const { role, identifier, password } = await req.json();
    const { GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID } = process.env;

    if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_SHEET_ID) {
      console.warn('⚠️ Missing Google Credentials. Using static fallback for dev.');
      if (role === 'organizer' && identifier === 'admin@bvk.com' && password === '123') {
        return NextResponse.json({ success: true, user: { role: 'organizer', username: identifier } });
      } else if (role === 'user') {
        return NextResponse.json({ success: true, user: { role: 'user', phoneNumber: identifier } });
      }
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: GOOGLE_CLIENT_EMAIL,
        private_key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: SCOPES,
    });
    const sheets = google.sheets({ version: 'v4', auth });
    
    // Ensure Users sheet exists
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: GOOGLE_SHEET_ID });
    const usersSheet = spreadsheet.data.sheets?.find(s => s.properties?.title === 'Users');

    if (!usersSheet) {
      // Create 'Users' sheet and add default admin
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: GOOGLE_SHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: 'Users' } } }]
        }
      });
      await sheets.spreadsheets.values.append({
        spreadsheetId: GOOGLE_SHEET_ID,
        range: 'Users!A:C',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [
            ['Role', 'Identifier', 'Password'],
            ['organizer', 'admin@bvk.com', '123']
          ],
        },
      });
    }

    // Fetch all users to authenticate
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: 'Users!A:C',
    });
    
    const rows = response.data.values || [];

    if (role === 'organizer') {
      const admin = rows.find(r => r[0] === 'organizer' && r[1] === identifier && r[2] === password);
      if (admin) {
        return NextResponse.json({ success: true, user: { role: 'organizer', username: identifier } });
      }
      return NextResponse.json({ error: 'Invalid Organizer Credentials' }, { status: 401 });
    } 
    
    if (role === 'user') {
      // Check if user is in the sheet
      const userRow = rows.find(r => r[0] === 'user' && r[1] === identifier);
      if (userRow) {
        return NextResponse.json({ success: true, user: { role: 'user', phoneNumber: identifier } });
      }
      return NextResponse.json({ error: 'Phone number not authorized. An organizer must invite you first.' }, { status: 401 });
    }

    return NextResponse.json({ error: 'Invalid Role' }, { status: 400 });

  } catch (error: any) {
    console.error('Auth check error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
