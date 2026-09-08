import { NextRequest, NextResponse } from 'next/server';
import { invoiceMonthFor } from '@/lib/billing';
import { parseCaixaSms } from '@/lib/parser';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendTelegramMessage } from '@/lib/telegram';

export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin();
  let debugId: number | null = null;

  try {
    let body: any = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    const raw = String(body?.raw ?? body?.message ?? '');
    const secret = String(
      req.headers.get('x-ingest-secret') ?? body?.ingestSecret ?? body?.secret ?? '',
    );
    const authOk = Boolean(process.env.SMS_INGEST_SECRET) && secret === process.env.SMS_INGEST_SECRET;

    const { data: loggedId } = await supabase.rpc('cc_log_sms_ingest_debug', {
      p_auth_ok: authOk,
      p_raw_message: raw || null,
      p_error_message: null,
    });
    debugId = typeof loggedId === 'number' ? loggedId : Number(loggedId || 0) || null;

    const setDebugError = async (message: string) => {
      if (!debugId) return;
      await supabase.rpc('cc_update_sms_ingest_debug', {
        p_id: debugId,
        p_error_message: message,
      });
    };

    if (!authOk) {
      await setDebugError('unauthorized');
      return NextResponse.json({ ok: false, stage: 'auth', error: 'unauthorized' });
    }

    if (!raw) {
      await setDebugError('missing raw message');
      return NextResponse.json({ ok: false, stage: 'body', error: 'missing raw message' });
    }

    let parsed;
    try {
      parsed = parseCaixaSms(raw);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'SMS CAIXA não reconhecido';
      await setDebugError(message);
      return NextResponse.json({ ok: false, stage: 'parser', error: message });
    }

    const invoiceMonth = invoiceMonthFor(parsed.purchasedAt, 5);

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
        },
      );
    }

    return NextResponse.json({ ok: true, duplicate: Boolean(row.is_duplicate), purchaseId: row.purchase_id });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'internal error';
    if (debugId) {
      await supabase.rpc('cc_update_sms_ingest_debug', {
        p_id: debugId,
        p_error_message: message,
      });
    }
    return NextResponse.json({ ok: false, stage: 'server', error: message });
  }
}
