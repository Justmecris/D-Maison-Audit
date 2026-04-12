import { NextResponse } from 'next/server';
import { dbService } from '@/app/lib/db';

export async function OPTIONS() {
  return NextResponse.json({});
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const necklaces = await dbService.getPersonalizedNecklaces(status);
    return NextResponse.json(necklaces);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const necklace = {
      customer_name: body.customer_name,
      personalized_name: body.personalized_name,
      font_name: body.font_name,
      font_family: body.font_family,
      width_mm: body.width_mm,
      height_mm: body.height_mm,
      color: body.color,
      status: 'PENDING'
    };
    await dbService.addPersonalizedNecklace(necklace);
    return NextResponse.json({ message: 'Order submitted successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, status } = body;
    await dbService.updateNecklaceStatus(id, status);
    return NextResponse.json({ message: 'Status updated successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) throw new Error('ID is required');
    await dbService.deleteNecklace(parseInt(id));
    return NextResponse.json({ message: 'Order deleted successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
