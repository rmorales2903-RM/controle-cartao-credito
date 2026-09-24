const TELEGRAM_SAFE_TEXT_LIMIT = 3800;

function splitTelegramText(text: string, maxLength = TELEGRAM_SAFE_TEXT_LIMIT) {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    let cut = remaining.lastIndexOf('\n\n', maxLength);
    if (cut < Math.floor(maxLength * 0.5)) cut = remaining.lastIndexOf('\n', maxLength);
    if (cut < Math.floor(maxLength * 0.5)) cut = remaining.lastIndexOf(' ', maxLength);
    if (cut <= 0) cut = maxLength;

    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

export async function sendTelegramMessage(chatId: number | string, text: string, replyMarkup?: unknown) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');

  const chunks = splitTelegramText(text);
  let lastResult: unknown = null;

  for (let index = 0; index < chunks.length; index += 1) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunks[index],
        reply_markup: index === chunks.length - 1 ? replyMarkup : undefined,
      }),
    });

    const responseText = await res.text();

    if (!res.ok) {
      throw new Error(`Telegram sendMessage failed: ${res.status} ${responseText.slice(0, 500)}`);
    }

    try {
      lastResult = JSON.parse(responseText);
    } catch {
      lastResult = responseText;
    }
  }

  return lastResult;
}
