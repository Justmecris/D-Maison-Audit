import { NextResponse } from 'next/server';
import { dbService } from '@/app/lib/db';

export async function GET(req: Request) {
  try {
    // Basic protection (e.g., from Vercel Cron or GitHub Action)
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await dbService.purgeMonthlyData();
    return NextResponse.json({ success: true, message: `Monthly cleanup completed for ${result.month}`, archived: result.archived });
  } catch (error: any) {
    console.error('Monthly cleanup failed:', error);
    return NextResponse.json({ error: error.message || 'Cleanup failed' }, { status: 500 });
  }
}
