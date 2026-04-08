import { NextResponse } from 'next/server';
import { fetchFromSheets } from '@/app/lib/google-sheets';
import { dbService } from '@/app/lib/db';

let lastSyncTime = 0;
const SYNC_COOLDOWN = 1000 * 60 * 5; // 5 minutes

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const forceSync = searchParams.get('sync') === 'true';
  const currentTime = Date.now();

  const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;
  const RANGE = process.env.GOOGLE_SHEETS_RANGE || 'Sheet1!A:C';

  if (SPREADSHEET_ID && (forceSync || (currentTime - lastSyncTime > SYNC_COOLDOWN))) {
    try {
      console.log(`[API] Triggering Google Sheets sync. Force: ${forceSync}`);
      const sheetData = await fetchFromSheets(SPREADSHEET_ID, RANGE);
      
      // Perform bulk upsert instead of individual calls for efficiency
      if (sheetData.length > 0) {
        const invoicesToUpsert = sheetData.map(item => ({
          invoice_number: item.invoiceNumber,
          customer_name: item.customerName
        }));
        await dbService.bulkUpsertInvoices(invoicesToUpsert);
      }
      
      lastSyncTime = currentTime;
    } catch (error) {
      console.error('Google Sheets background sync failed:', error);
    }
  }

  try {
    const allInvoices = await dbService.getAllInvoices();
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
      console.log(`[API] Processing bulk sync of ${payload.items.length} items. Staff: ${payload.staffName}, Date: ${payload.selectedDate}`);
      const { staffName, selectedDate } = payload;

      try {
        const validItems = payload.items.filter((item: any) => item.invoiceNumber);
        
        // Prepare bulk upsert for invoices
        const invoicesToUpsert = validItems.map((item: any) => ({
          invoice_number: item.invoiceNumber,
          customer_name: item.customerName || 'Unknown',
          status: item.status
        }));

        await dbService.bulkUpsertInvoices(invoicesToUpsert);

        // Prepare bulk insert for verification logs
        if (staffName && selectedDate) {
          const logsToInsert = validItems
            .filter((item: any) => item.status === 'VERIFIED')
            .map((item: any) => ({
              staff_name: staffName,
              date_processed: selectedDate,
              invoice_number: item.invoiceNumber
            }));

          if (logsToInsert.length > 0) {
            await dbService.bulkAddVerificationLogs(logsToInsert);
          }
        }

        const allInvoices = await dbService.getAllInvoices();
        const finalCount = allInvoices.length;
        console.log(`[API] Bulk sync complete. Total records in DB: ${finalCount}`);
        return NextResponse.json({ success: true, count: payload.items.length, total: finalCount });
      } catch (dbError: any) {
        console.error('[API BULK SYNC DB ERROR]', dbError);
        return NextResponse.json({ error: `Database error during bulk sync: ${dbError.message}` }, { status: 500 });
      }
    }

    // Normal single-item update
    const { invoiceNumber, customerName, status, scanTime, staffName, selectedDate } = payload;
    if (!invoiceNumber || !status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (status === 'VERIFIED') {
      await dbService.updateScanStatus(invoiceNumber, status, scanTime || new Date().toLocaleTimeString());

      // Add staff log if staffName and selectedDate are provided
      if (staffName && selectedDate) {
        await dbService.addVerificationLog({
          staff_name: staffName,
          date_processed: selectedDate,
          invoice_number: invoiceNumber
        });
      }
    } else {
      await dbService.upsertInvoice({
        invoice_number: invoiceNumber,
        customer_name: customerName,
        status: status
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Update failed' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const role = req.headers.get('x-user-role');
    if (role !== 'CEO') {
      return NextResponse.json({ error: 'Unauthorized: Only CEO can delete records' }, { status: 403 });
    }

    const { invoiceNumber } = await req.json();
    if (!invoiceNumber) {
      return NextResponse.json({ error: 'Invoice number required' }, { status: 400 });
    }
    await dbService.deleteInvoice(invoiceNumber);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Delete failed' }, { status: 500 });
  }
}
