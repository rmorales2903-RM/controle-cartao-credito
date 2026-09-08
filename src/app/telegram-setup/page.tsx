'use client';

import { FormEvent, useState } from 'react';

export default function TelegramSetupPage() {
  const [secret, setSecret] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult('');
    try {
      const res = await fetch('/api/telegram/setup', {
        method: 'POST',
        headers: { 'x-setup-secret': secret },
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setResult(`Webhook configurado com sucesso: ${data.webhookUrl}`);
      } else {
        setResult(`Erro: ${data.error || data.telegram?.description || 'falha ao configurar webhook'}`);
      }
    } catch {
      setResult('Erro ao chamar o servidor.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: '60px auto', padding: 24, fontFamily: 'Arial, sans-serif' }}>
      <h1>Configurar Telegram</h1>
      <p>Use o valor de <strong>SMS_INGEST_SECRET</strong> já cadastrado na Vercel. O token do BotFather não precisa ser digitado aqui.</p>
      <form onSubmit={submit}>
        <label htmlFor="secret">SMS_INGEST_SECRET</label>
        <input
          id="secret"
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          style={{ display: 'block', width: '100%', padding: 12, marginTop: 8, marginBottom: 16 }}
          required
        />
        <button type="submit" disabled={loading} style={{ padding: '12px 18px', cursor: 'pointer' }}>
          {loading ? 'Configurando...' : 'Configurar webhook'}
        </button>
      </form>
      {result && <p style={{ marginTop: 20 }}>{result}</p>}
    </main>
  );
}
