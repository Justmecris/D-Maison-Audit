import { NextResponse } from 'next/server';
import { dbService } from '@/app/lib/db';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const necklaces = await dbService.getPersonalizedNecklaces(status);
    return NextResponse.json(necklaces, { headers: corsHeaders() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders() });
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
    return NextResponse.json({ message: 'Order submitted successfully' }, { headers: corsHeaders() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders() });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, status } = body;
    await dbService.updateNecklaceStatus(id, status);
    return NextResponse.json({ message: 'Status updated successfully' }, { headers: corsHeaders() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders() });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) throw new Error('ID is required');
    await dbService.deleteNecklace(parseInt(id));
    return NextResponse.json({ message: 'Order deleted successfully' }, { headers: corsHeaders() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders() });
  }
}
