export async function sendTelegramMessage(chatId: number | string, text: string, replyMarkup?: unknown) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup: replyMarkup }),
  });

  if (!res.ok) throw new Error(`Telegram sendMessage failed: ${res.status}`);
  return res.json();
}
