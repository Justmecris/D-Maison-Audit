import { NextResponse } from 'next/server';
import { dbService } from '@/app/lib/db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;

    const audits = await dbService.getPaymentAudits(startDate, endDate);
    return NextResponse.json({ success: true, data: audits });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Fetch failed' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    if (!payload.items || !Array.isArray(payload.items)) {
      return NextResponse.json({ error: 'Missing items array' }, { status: 400 });
    }

    await dbService.addPaymentAudits(payload.items);

    // Unified Processing: Auto-populate J&T records
    for (const item of payload.items) {
      if (item.order_no) {
        await dbService.upsertInvoice({
          invoice_number: item.order_no,
          customer_name: item.customer_name || 'Unknown',
          status: 'PENDING'
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Audit save failed' }, { status: 500 });
  }
}
