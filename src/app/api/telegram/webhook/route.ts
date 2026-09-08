import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendTelegramMessage } from '@/lib/telegram';

const installmentKeyboard = {
  inline_keyboard: [
    [1, 2, 3, 4, 5, 6].map((n) => ({
      text: n === 1 ? 'À vista' : `${n}x`,
      callback_data: `installments:${n}`,
    })),
    [{ text: '➕ Mais', callback_data: 'installments_more' }],
  ],
};

const categoryKeyboard = {
  inline_keyboard: [
    [
      { text: '⛽ Posto', callback_data: 'category:posto' },
      { text: '👕 Roupa', callback_data: 'category:roupa' },
    ],
    [
      { text: '💊 Farmácia', callback_data: 'category:farmacia' },
      { text: '🍴 Alimentação', callback_data: 'category:alimentacao' },
    ],
    [
      { text: '🛒 Mercado', callback_data: 'category:mercado' },
      { text: '➕ Outra', callback_data: 'category_more' },
    ],
  ],
};

const profileKeyboard = {
  inline_keyboard: [[
    { text: 'Rodrigo', callback_data: 'link_profile:Rodrigo' },
    { text: 'Mylena', callback_data: 'link_profile:Mylena' },
  ]],
};

async function setState(chatId: number, action: string, purchaseId?: string | null) {
  const { error } = await supabaseAdmin().rpc('cc_set_telegram_state', {
    p_chat_id: chatId,
    p_action: action,
    p_purchase_id: purchaseId ?? null,
  });
  if (error) throw error;
}

async function takeState(chatId: number) {
  const { data, error } = await supabaseAdmin().rpc('cc_take_telegram_state', {
    p_chat_id: chatId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

async function answerCallback(callbackQueryId?: string) {
  if (!callbackQueryId) return;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });
}

async function linkProfile(chatId: number, profileName: string) {
  const { data, error } = await supabaseAdmin().rpc('cc_link_telegram_profile', {
    p_chat_id: chatId,
    p_profile_name: profileName,
  });
  if (error) throw error;
  const profile = Array.isArray(data) ? data[0] : data;
  if (!profile) throw new Error('Perfil não encontrado');
  return profile;
}

export async function POST(req: NextRequest) {
  try {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
    const received = req.headers.get('x-telegram-bot-api-secret-token');
    if (!expected || received !== expected) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const update = await req.json();
    const message = update?.message;
    const callback = update?.callback_query;
    const chatId = Number(message?.chat?.id ?? callback?.message?.chat?.id);
    if (!Number.isFinite(chatId)) return NextResponse.json({ ok: true });

    if (message?.text === '/start' || String(message?.text || '').startsWith('/start ')) {
      await setState(chatId, 'pending_start', null);
      await sendTelegramMessage(chatId, 'Quem está usando este Telegram?', profileKeyboard);
      return NextResponse.json({ ok: true });
    }

    if (callback?.data) {
      await answerCallback(callback.id);
      const data = String(callback.data);
      const [action, value] = data.split(':');

      if (action === 'link_profile' && value) {
        const profile = await linkProfile(chatId, value);
        await takeState(chatId);
        await sendTelegramMessage(chatId, `✅ Telegram vinculado ao perfil ${profile.name}.`);
        return NextResponse.json({ ok: true });
      }

      if (action === 'merchant_ok' || action === 'merchant_edit') {
        const purchaseId = value;
        if (action === 'merchant_edit') {
          await setState(chatId, 'merchant_edit', purchaseId);
          await sendTelegramMessage(chatId, 'Digite o nome correto do estabelecimento:');
        } else {
          const { error } = await supabaseAdmin().rpc('cc_confirm_merchant', {
            p_purchase_id: purchaseId,
            p_display_name: null,
          });
          if (error) throw error;
          await setState(chatId, `installments:${purchaseId}`, purchaseId);
          await sendTelegramMessage(chatId, 'Como foi a compra?', installmentKeyboard);
        }
        return NextResponse.json({ ok: true });
      }

      if (action === 'installments' && value) {
        const state = await takeState(chatId);
        const purchaseId = state?.purchase_id;
        if (!purchaseId) throw new Error('Compra não encontrada no estado do Telegram');
        const count = Number(value);
        const { error } = await supabaseAdmin().rpc('cc_set_installments', {
          p_purchase_id: purchaseId,
          p_count: count,
        });
        if (error) throw error;
        await setState(chatId, `category:${purchaseId}`, purchaseId);
        await sendTelegramMessage(chatId, 'Escolha a categoria:', categoryKeyboard);
        return NextResponse.json({ ok: true });
      }

      if (action === 'installments_more') {
        const state = await takeState(chatId);
        await setState(chatId, 'installments_more', state?.purchase_id ?? null);
        await sendTelegramMessage(chatId, 'Digite a quantidade de parcelas (2 a 48):');
        return NextResponse.json({ ok: true });
      }

      if (action === 'category' && value) {
        const state = await takeState(chatId);
        const purchaseId = state?.purchase_id;
        if (!purchaseId) throw new Error('Compra não encontrada no estado do Telegram');
        const { error } = await supabaseAdmin().rpc('cc_set_category', {
          p_purchase_id: purchaseId,
          p_category: value,
        });
        if (error) throw error;
        await sendTelegramMessage(chatId, '✅ Compra confirmada.');
        return NextResponse.json({ ok: true });
      }

      if (action === 'category_more') {
        const state = await takeState(chatId);
        await setState(chatId, 'category_more', state?.purchase_id ?? null);
        await sendTelegramMessage(chatId, 'Digite a categoria:');
        return NextResponse.json({ ok: true });
      }
    }

    if (message?.text) {
      const state = await takeState(chatId);
      if (!state) return NextResponse.json({ ok: true });
      const purchaseId = state.purchase_id;

      if (state.action === 'merchant_edit' && purchaseId) {
        const { error } = await supabaseAdmin().rpc('cc_confirm_merchant', {
          p_purchase_id: purchaseId,
          p_display_name: String(message.text).trim(),
        });
        if (error) throw error;
        await setState(chatId, `installments:${purchaseId}`, purchaseId);
        await sendTelegramMessage(chatId, 'Como foi a compra?', installmentKeyboard);
      } else if (state.action === 'installments_more' && purchaseId) {
        const count = Number(String(message.text).trim());
        if (!Number.isInteger(count) || count < 2 || count > 48) {
          await setState(chatId, 'installments_more', purchaseId);
          await sendTelegramMessage(chatId, 'Informe um número inteiro entre 2 e 48.');
        } else {
          const { error } = await supabaseAdmin().rpc('cc_set_installments', {
            p_purchase_id: purchaseId,
            p_count: count,
          });
          if (error) throw error;
          await setState(chatId, `category:${purchaseId}`, purchaseId);
          await sendTelegramMessage(chatId, 'Escolha a categoria:', categoryKeyboard);
        }
      } else if (state.action === 'category_more' && purchaseId) {
        const { error } = await supabaseAdmin().rpc('cc_set_category', {
          p_purchase_id: purchaseId,
          p_category: String(message.text).trim().toLowerCase(),
        });
        if (error) throw error;
        await sendTelegramMessage(chatId, '✅ Compra confirmada.');
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'internal error' },
      { status: 500 },
    );
  }
}
