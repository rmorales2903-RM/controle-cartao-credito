import { NextRequest, NextResponse } from 'next/server';
import { invoiceMonthFor } from '@/lib/billing';
import { parseCaixaSms } from '@/lib/parser';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendTelegramMessage } from '@/lib/telegram';

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-ingest-secret');
    if (!process.env.SMS_INGEST_SECRET || secret !== process.env.SMS_INGEST_SECRET) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const raw = String(body?.raw ?? body?.message ?? '');
    if (!raw) return NextResponse.json({ ok: false, error: 'missing raw message' }, { status: 400 });

    const parsed = parseCaixaSms(raw);
    const invoiceMonth = invoiceMonthFor(parsed.purchasedAt, 5);
    const supabase = supabaseAdmin();

    const { data, error } = await supabase.rpc('cc_ingest_purchase', {
      p_last4: parsed.last4,
      p_raw_message: raw,
      p_merchant_original: parsed.merchantOriginal,
      p_amount: parsed.amount,
      p_purchased_at: parsed.purchasedAt,
      p_invoice_month: invoiceMonth,
    });
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('No ingest response');

    if (!row.is_duplicate && row.telegram_chat_id) {
      const suggested = row.merchant_display || parsed.merchantOriginal;
      await sendTelegramMessage(
        row.telegram_chat_id,
        `Compra de R$ ${parsed.amount.toFixed(2).replace('.', ',')}\nNome recebido: ${parsed.merchantOriginal}\n\nQual nome deve aparecer no relatório?`,
        {
          inline_keyboard: [[
            { text: `✅ ${suggested}`, callback_data: `merchant_ok:${row.purchase_id}` },
            { text: '✏️ Corrigir nome', callback_data: `merchant_edit:${row.purchase_id}` },
          ]],
        }
      );
    }

    return NextResponse.json({ ok: true, duplicate: Boolean(row.is_duplicate), purchaseId: row.purchase_id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'internal error' }, { status: 500 });
  }
}
