import { NextResponse } from 'next/server'

import { fetchCompanyTickerMap } from '@/lib/sec'

export async function GET() {
  try {
    const data = await fetchCompanyTickerMap()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}
