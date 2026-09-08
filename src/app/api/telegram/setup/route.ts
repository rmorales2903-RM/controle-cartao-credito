import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const expected = process.env.SMS_INGEST_SECRET;
  const provided = req.headers.get('x-setup-secret');

  if (!expected || !provided || provided !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const baseUrl = 'https://controle-cartao-credito-2903.vercel.app';

  if (!token || !webhookSecret) {
    return NextResponse.json(
      { ok: false, error: 'missing Telegram environment variables' },
      { status: 500 }
    );
  }

  const webhookUrl = `${baseUrl}/api/telegram/webhook`;
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: webhookSecret,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false,
    }),
    cache: 'no-store',
  });

  const data = await response.json();
  return NextResponse.json({ ok: response.ok && Boolean(data?.ok), webhookUrl, telegram: data }, { status: response.ok ? 200 : 502 });
}
