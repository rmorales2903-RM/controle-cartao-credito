import { NextResponse } from 'next/server';

async function telegramCall(token: string, method: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  const data = await response.json();
  return { response, data };
}

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

  const webhook = await telegramCall(token, 'setWebhook', {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false,
  });

  const commands = await telegramCall(token, 'setMyCommands', {
    commands: [
      { command: 'menu', description: 'Abrir menu' },
      { command: 'start', description: 'Iniciar ou vincular perfil' },
    ],
  });

  const menuButton = await telegramCall(token, 'setChatMenuButton', {
    menu_button: { type: 'commands' },
  });

  const ok =
    webhook.response.ok && webhook.data?.ok === true &&
    commands.response.ok && commands.data?.ok === true &&
    menuButton.response.ok && menuButton.data?.ok === true;

  return NextResponse.json({
    ok,
    webhookUrl,
    telegram: {
      webhook: webhook.data,
      commands: commands.data,
      menuButton: menuButton.data,
    },
  }, { status: ok ? 200 : 502 });
}
