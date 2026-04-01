import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function buildGeoApiUrl(request: NextRequest): string {
  const nom = request.nextUrl.searchParams.get('nom') || '';
  const fields = request.nextUrl.searchParams.get('fields') || 'nom,codesPostaux,codeDepartement';
  const boost = request.nextUrl.searchParams.get('boost') || 'population';
  const limit = request.nextUrl.searchParams.get('limit') || '10';

  const params = new URLSearchParams({
    nom,
    fields,
    boost,
    limit,
  });

  return `https://geo.api.gouv.fr/communes?${params.toString()}`;
}

export async function GET(request: NextRequest) {
  try {
    const nom = request.nextUrl.searchParams.get('nom');

    if (!nom || nom.trim().length < 2) {
      return NextResponse.json([]);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const upstreamUrl = buildGeoApiUrl(request);
      const response = await fetch(upstreamUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok) {
        return NextResponse.json([]);
      }

      const data = await response.json();
      return NextResponse.json(Array.isArray(data) ? data : []);
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    console.error('Erreur proxy geo api communes:', error);
    return NextResponse.json([]);
  }
}
