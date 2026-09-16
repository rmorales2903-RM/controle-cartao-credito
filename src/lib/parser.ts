export type ParsedCaixaSms = {
  merchantOriginal: string;
  amount: number;
  purchasedAt: string;
  network: string;
  last4: string;
  installmentCount: number | null;
};

export function parseCaixaSms(raw: string): ParsedCaixaSms {
  // Aceita os formatos reais observados da CAIXA, incluindo:
  // ... SUPER MUFFATO, R$ 157,14, 07/09 as 10:01. ELO final 4349
  // ... LITE *Vivo Anual R$ 360,00 em 12 vezes, 15/09 as 20:38, ELO final 4581
  // ... MP*ALIEXPRESS, R$ 41,68, 10/09 as 06:10. ELO VIRTUAL final 5804
  const re = /Compra aprovada em\s+(.+?)\s*,?\s*R\$\s*([\d.]+,\d{2})(?:\s+em\s+(\d+)\s+vez(?:es)?)?\s*,\s*(\d{2})\/(\d{2})\s+as\s+(\d{2}):(\d{2})\s*[.,]\s*([A-Z]+)(?:\s+VIRTUAL)?\s+final\s+(\d{4})/i;
  const m = raw.match(re);
  if (!m) throw new Error('SMS CAIXA não reconhecido');

  const [, merchantOriginal, amountBr, installmentRaw, dd, mm, hh, min, network, last4] = m;
  const now = new Date();
  const currentYear = Number(new Intl.DateTimeFormat('en', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(now));
  const month = Number(mm);
  let year = currentYear;
  const currentMonth = Number(new Intl.DateTimeFormat('en', { timeZone: 'America/Sao_Paulo', month: 'numeric' }).format(now));
  if (currentMonth === 1 && month === 12) year--;
  if (currentMonth === 12 && month === 1) year++;

  const amount = Number(amountBr.replace(/\./g, '').replace(',', '.'));
  const purchasedAt = new Date(`${year}-${mm}-${dd}T${hh}:${min}:00-03:00`).toISOString();
  const installmentCount = installmentRaw ? Number(installmentRaw) : null;

  return {
    merchantOriginal: merchantOriginal.trim(),
    amount,
    purchasedAt,
    network: network.toUpperCase(),
    last4,
    installmentCount,
  };
}
