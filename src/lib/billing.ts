export function invoiceMonthFor(purchasedAt: string, closingDay = 5) {
  const d = new Date(purchasedAt);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const year = Number(parts.find(p => p.type === 'year')?.value);
  const month = Number(parts.find(p => p.type === 'month')?.value);
  const day = Number(parts.find(p => p.type === 'day')?.value);

  let y = year;
  let m = month;
  if (day >= closingDay) {
    m += 1;
    if (m === 13) { m = 1; y += 1; }
  }
  return `${y}-${String(m).padStart(2, '0')}-01`;
}
