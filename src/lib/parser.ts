export type ParsedCaixaSms = {
  merchantOriginal: string;
  amount: number;
  purchasedAt: string;
  network: string;
  last4: string;
};

export function parseCaixaSms(raw: string): ParsedCaixaSms {
  const re = /Compra aprovada em\s+(.+?),\s*R\$\s*([\d.]+,\d{2}),\s*(\d{2})\/(\d{2})\s+as\s+(\d{2}):(\d{2})\.\s*([A-Z]+)\s+final\s+(\d{4})/i;
  const m = raw.match(re);
  if (!m) throw new Error('SMS CAIXA não reconhecido');

  const [, merchantOriginal, amountBr, dd, mm, hh, min, network, last4] = m;
  const now = new Date();
  const currentYear = Number(new Intl.DateTimeFormat('en', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(now));
  const month = Number(mm);
  let year = currentYear;
  const currentMonth = Number(new Intl.DateTimeFormat('en', { timeZone: 'America/Sao_Paulo', month: 'numeric' }).format(now));
  if (currentMonth === 1 && month === 12) year--;
  if (currentMonth === 12 && month === 1) year++;

  const amount = Number(amountBr.replace(/\./g, '').replace(',', '.'));
  const purchasedAt = new Date(`${year}-${mm}-${dd}T${hh}:${min}:00-03:00`).toISOString();

  return { merchantOriginal: merchantOriginal.trim(), amount, purchasedAt, network: network.toUpperCase(), last4 };
}
