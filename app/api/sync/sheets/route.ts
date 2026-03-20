import { NextResponse } from 'next/server';
import { fetchFromSheets } from '@/app/lib/google-sheets';
import { dbService } from '@/app/lib/db';

export async function GET() {
  const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;
  const RANGE = process.env.GOOGLE_SHEETS_RANGE || 'Sheet1!A:C';

  if (SPREADSHEET_ID) {
    try {
      const sheetData = await fetchFromSheets(SPREADSHEET_ID, RANGE);
      sheetData.forEach((item) => {
        dbService.upsertInvoice({
          invoice_number: item.invoiceNumber,
          customer_name: item.customerName,
          status: 'PENDING',
        });
      });
    } catch (error) {
      console.error('Google Sheets background sync failed:', error);
    }
  }

  try {
    const allInvoices = dbService.getAllInvoices();
    return NextResponse.json({ 
      success: true, 
      data: allInvoices
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Database fetch failed' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    console.log('[API] Received POST payload:', JSON.stringify(payload).substring(0, 200));
    
    // Check if it's a bulk sync
    if (payload.items && Array.isArray(payload.items)) {
      console.log(`[API] Processing bulk sync of ${payload.items.length} items`);
      payload.items.forEach((item: any) => {
        dbService.upsertInvoice({
          invoice_number: item.invoiceNumber,
          customer_name: item.customerName,
          status: item.status || 'PENDING'
        });
      });
      const finalCount = dbService.getAllInvoices().length;
      console.log(`[API] Bulk sync complete. Total records in DB: ${finalCount}`);
      return NextResponse.json({ success: true, count: payload.items.length, total: finalCount });
    }

    // Normal single-item update
    const { invoiceNumber, customerName, status, scanTime } = payload;
    if (!invoiceNumber || !status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (status === 'VERIFIED') {
      dbService.updateScanStatus(invoiceNumber, status, scanTime || new Date().toLocaleTimeString());
    } else {
      dbService.upsertInvoice({
        invoice_number: invoiceNumber,
        customer_name: customerName,
        status: status || 'PENDING'
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Update failed' }, { status: 500 });
  }
}
