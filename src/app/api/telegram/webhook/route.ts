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

const adminMenuKeyboard = {
  inline_keyboard: [
    [
      { text: '💳 Gastos Rodrigo', callback_data: 'menu:expenses_me' },
      { text: '💳 Gastos Mylena', callback_data: 'menu:expenses_mylena' },
    ],
    [{ text: '📊 Gasto Geral', callback_data: 'menu:general' }],
    [{ text: '📅 Próximas Faturas', callback_data: 'menu:upcoming' }],
    [
      { text: '🧾 Compras', callback_data: 'menu:purchases' },
      { text: '⚠️ Pendências', callback_data: 'menu:pending' },
    ],
  ],
};

const memberMenuKeyboard = {
  inline_keyboard: [
    [{ text: '💳 Meus Gastos', callback_data: 'menu:expenses_me' }],
    [{ text: '📅 Minhas Próximas Parcelas', callback_data: 'menu:upcoming' }],
    [
      { text: '🧾 Minhas Compras', callback_data: 'menu:purchases' },
      { text: '⚠️ Minhas Pendências', callback_data: 'menu:pending' },
    ],
  ],
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

async function getReport(chatId: number, view: string) {
  const { data, error } = await supabaseAdmin().rpc('cc_bot_report', {
    p_chat_id: chatId,
    p_view: view,
  });
  if (error) throw error;
  return data as any;
}

function brl(value: unknown) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const monthMap: Record<string, string> = {
  january: 'Janeiro', february: 'Fevereiro', march: 'Março', april: 'Abril',
  may: 'Maio', june: 'Junho', july: 'Julho', august: 'Agosto',
  september: 'Setembro', october: 'Outubro', november: 'Novembro', december: 'Dezembro',
};

function monthName(value: unknown) {
  const text = String(value || '').trim();
  return monthMap[text.toLowerCase()] || (text ? text.charAt(0).toUpperCase() + text.slice(1) : '');
}

function installmentLabel(item: any) {
  const count = Number(item?.installment_count || 1);
  const number = Number(item?.installment_number || 1);
  return count <= 1 ? 'à vista' : `parcela ${number}/${count}`;
}

function purchaseLabel(item: any) {
  const merchant = item?.merchant || 'Compra';
  const description = String(item?.description || '').trim();
  return description ? `${merchant} — ${description}` : merchant;
}

function appendInvoiceItems(lines: string[], items: any[]) {
  if (!Array.isArray(items) || !items.length) return;
  for (const item of items.slice(0, 12)) {
    lines.push(`• ${purchaseLabel(item)} — ${brl(item.amount)} — ${installmentLabel(item)}`);
  }
}

function formatReport(report: any) {
  if (!report) return 'Sem dados.';

  if (report.report_type === 'invoice_summary') {
    const currentName = monthName(report.current_month_name);
    const nextName = monthName(report.next_month_name);
    const lines: string[] = [`💳 ${report.title || 'Resumo'}`, ''];

    if (report.current_status === 'closed') {
      lines.push(`🔒 Fatura de ${currentName} — fechada`);
      lines.push(report.current_has_data ? brl(report.current_total) : 'Fatura fechada — valor não cadastrado');
    } else {
      lines.push(`🟢 Fatura de ${currentName} — em aberto`);
      lines.push(brl(report.current_total));
    }

    lines.push('');
    lines.push(`🟢 Compras para ${nextName} — em aberto`);
    lines.push(brl(report.next_total));
    appendInvoiceItems(lines, report.next_items);
    lines.push('');
    lines.push(`Fechamento: dia ${report.closing_day || 5}`);
    return lines.join('\n');
  }

  if (report.report_type === 'upcoming_invoices') {
    const currentName = monthName(report.current_month_name);
    const lines: string[] = ['💳 Resumo das Faturas', ''];

    if (report.current_status === 'closed') {
      lines.push(`🔒 Fatura de ${currentName} — fechada`);
      lines.push(Number(report.current_count || 0) > 0 ? brl(report.current_total) : 'Fatura fechada — valor não cadastrado');
    } else {
      lines.push(`🟢 Fatura de ${currentName} — em aberto`);
      lines.push(brl(report.current_total));
    }

    if (Array.isArray(report.months) && report.months.length) {
      const [first, ...rest] = report.months;
      lines.push('');
      lines.push(`🟢 Compras para ${monthName(first.month_name)} — em aberto`);
      lines.push(brl(first.total));
      appendInvoiceItems(lines, first.items);

      if (rest.length) {
        lines.push('');
        lines.push('📅 Próximos meses');
        for (const item of rest) {
          lines.push('');
          lines.push(`${monthName(item.month_name)} — ${brl(item.total)}`);
          appendInvoiceItems(lines, item.items);
        }
      }
    } else {
      lines.push('');
      lines.push('Nenhuma compra futura registrada.');
    }

    lines.push('');
    lines.push(`Fechamento: dia ${report.closing_day || 5}`);
    return lines.join('\n');
  }

  const lines: string[] = [String(report.title || 'Relatório')];
  if (report.total !== undefined) lines.push(`Total: ${brl(report.total)}`);
  if (report.count !== undefined) lines.push(`Quantidade: ${report.count}`);

  if (Array.isArray(report.items) && report.items.length) {
    lines.push('');
    for (const item of report.items.slice(0, 10)) {
      const extra: string[] = [];
      if (item.installments) extra.push(item.installments === 1 ? 'à vista' : `${item.installments}x`);
      if (item.invoice_month) extra.push(`fatura ${item.invoice_month}`);
      const suffix = extra.length ? ` (${extra.join(' · ')})` : '';
      lines.push(`• ${item.date || ''} ${purchaseLabel(item)} — ${brl(item.amount)}${suffix}`.trim());
    }
  }

  if (Array.isArray(report.months) && report.months.length) {
    lines.push('');
    for (const item of report.months) lines.push(`• ${item.month}: ${brl(item.total)}`);
  }

  if ((!report.items || report.items.length === 0) && (!report.months || report.months.length === 0) && report.total === undefined && report.count === undefined) {
    lines.push('Nenhum registro encontrado.');
  }

  return lines.join('\n');
}

async function showMenu(chatId: number) {
  const profile = await getReport(chatId, 'menu');
  const isAdmin = profile?.role === 'admin';
  const text = `Olá, ${profile?.name || ''}. Escolha uma opção:`;
  await sendTelegramMessage(chatId, text, isAdmin ? adminMenuKeyboard : memberMenuKeyboard);
}

async function askPurchaseDescription(chatId: number, purchaseId: string) {
  await setState(chatId, 'purchase_description', purchaseId);
  await sendTelegramMessage(chatId, 'O que foi comprado?\nEx.: Torneira cozinha');
}

export async function POST(req: NextRequest) {
  try {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
    const received = req.headers.get('x-telegram-bot-api-secret-token');
    if (!expected || received !== expected) return NextResponse.json({ ok: false }, { status: 401 });

    const update = await req.json();
    const message = update?.message;
    const callback = update?.callback_query;
    const chatId = Number(message?.chat?.id ?? callback?.message?.chat?.id);
    if (!Number.isFinite(chatId)) return NextResponse.json({ ok: true });

    const text = String(message?.text || '');
    if (text === '/start' || text.startsWith('/start ')) {
      try { await showMenu(chatId); }
      catch {
        await setState(chatId, 'pending_start', null);
        await sendTelegramMessage(chatId, 'Quem está usando este Telegram?', profileKeyboard);
      }
      return NextResponse.json({ ok: true });
    }

    if (text === '/menu' || text.toLowerCase() === 'menu') {
      await showMenu(chatId);
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
        await showMenu(chatId);
        return NextResponse.json({ ok: true });
      }

      if (action === 'menu' && value) {
        const report = await getReport(chatId, value);
        await sendTelegramMessage(chatId, formatReport(report), { inline_keyboard: [[{ text: '⬅️ Menu', callback_data: 'menu_back:menu' }]] });
        return NextResponse.json({ ok: true });
      }

      if (action === 'menu_back') {
        await showMenu(chatId);
        return NextResponse.json({ ok: true });
      }

      if (action === 'merchant_ok' || action === 'merchant_edit') {
        const purchaseId = value;
        if (action === 'merchant_edit') {
          await setState(chatId, 'merchant_edit', purchaseId);
          await sendTelegramMessage(chatId, 'Digite o nome correto do estabelecimento:');
        } else {
          const { error } = await supabaseAdmin().rpc('cc_confirm_merchant', { p_purchase_id: purchaseId, p_display_name: null });
          if (error) throw error;
          await askPurchaseDescription(chatId, purchaseId);
        }
        return NextResponse.json({ ok: true });
      }

      if (action === 'installments' && value) {
        const state = await takeState(chatId);
        const purchaseId = state?.purchase_id;
        if (!purchaseId) throw new Error('Compra não encontrada no estado do Telegram');
        const count = Number(value);
        const { error } = await supabaseAdmin().rpc('cc_set_installments', { p_purchase_id: purchaseId, p_count: count });
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
        const { error } = await supabaseAdmin().rpc('cc_set_category', { p_purchase_id: purchaseId, p_category: value });
        if (error) throw error;
        await sendTelegramMessage(chatId, '✅ Compra confirmada.');
        await showMenu(chatId);
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
        await askPurchaseDescription(chatId, purchaseId);
      } else if (state.action === 'purchase_description' && purchaseId) {
        const description = String(message.text).trim();
        if (!description) {
          await setState(chatId, 'purchase_description', purchaseId);
          await sendTelegramMessage(chatId, 'Informe o que foi comprado. Ex.: Torneira cozinha');
        } else {
          const { error } = await supabaseAdmin().rpc('cc_set_purchase_description', {
            p_purchase_id: purchaseId,
            p_description: description,
          });
          if (error) throw error;
          await setState(chatId, `installments:${purchaseId}`, purchaseId);
          await sendTelegramMessage(chatId, 'Como foi a compra?', installmentKeyboard);
        }
      } else if (state.action === 'installments_more' && purchaseId) {
        const count = Number(String(message.text).trim());
        if (!Number.isInteger(count) || count < 2 || count > 48) {
          await setState(chatId, 'installments_more', purchaseId);
          await sendTelegramMessage(chatId, 'Informe um número inteiro entre 2 e 48.');
        } else {
          const { error } = await supabaseAdmin().rpc('cc_set_installments', { p_purchase_id: purchaseId, p_count: count });
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
        await showMenu(chatId);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'internal error' }, { status: 500 });
  }
}
