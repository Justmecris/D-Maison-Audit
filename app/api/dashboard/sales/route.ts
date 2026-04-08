import { NextResponse } from 'next/server';
import { dbService } from '@/app/lib/db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month'); // YYYY-MM

    const audits = await dbService.getPaymentAudits();
    
    // Aggregate data by date
    const dailyStats: Record<string, { total: number; count: number }> = {};
    let monthlyTotal = 0;
    let monthlyCount = 0;

    audits.forEach(audit => {
      const date = audit.audit_date;
      if (month && !date.startsWith(month)) return;

      if (!dailyStats[date]) {
        dailyStats[date] = { total: 0, count: 0 };
      }
      dailyStats[date].total += audit.paid_amount;
      dailyStats[date].count += 1;

      monthlyTotal += audit.paid_amount;
      monthlyCount += 1;
    });

    return NextResponse.json({
      success: true,
      data: {
        monthlyTotal,
        monthlyCount,
        dailyStats: Object.entries(dailyStats).map(([date, stats]) => ({
          date,
          ...stats
        })).sort((a, b) => a.date.localeCompare(b.date))
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Fetch failed' }, { status: 500 });
  }
}
