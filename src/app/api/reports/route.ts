import { NextRequest, NextResponse } from 'next/server';
import { generateReportData } from '@/lib/services/analytics-service';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const reportKey = searchParams.get('reportKey') || 'inward_register';
    const companyId = searchParams.get('companyId')
      ? Number(searchParams.get('companyId'))
      : undefined;
    const machineId = searchParams.get('machineId')
      ? Number(searchParams.get('machineId'))
      : undefined;
    const diameterId = searchParams.get('diameterId')
      ? Number(searchParams.get('diameterId'))
      : undefined;
    const fromDate = searchParams.get('fromDate') || undefined;
    const toDate = searchParams.get('toDate') || undefined;
    const batchSearch = searchParams.get('batchSearch') || undefined;
    const includeDemo = searchParams.get('includeDemo') !== 'false';

    const rows = await generateReportData({
      reportKey,
      companyId,
      machineId,
      diameterId,
      fromDate,
      toDate,
      batchSearch,
      includeDemo,
    });

    return NextResponse.json({ ok: true, reportKey, rows });
  } catch (err: any) {
    console.error('GET /api/reports error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || 'Report generation failed' },
      { status: 500 }
    );
  }
}

