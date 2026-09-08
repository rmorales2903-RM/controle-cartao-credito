import { NextResponse } from 'next/server';

export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'https://controle-cartao-credito-2903.vercel.app';

  if (!token) {
    return NextResponse.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN missing' }, { status: 500 });
  }

  if (!secret) {
    return NextResponse.json({ ok: false, error: 'TELEGRAM_WEBHOOK_SECRET missing' }, { status: 500 });
  }

  const webhookUrl = `${baseUrl}/api/telegram/webhook`;

  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false,
    }),
    cache: 'no-store',
  });

  const data = await response.json();

  return NextResponse.json({
    ok: response.ok && data?.ok === true,
    webhookUrl,
    telegram: data,
  }, { status: response.ok ? 200 : 502 });
}
