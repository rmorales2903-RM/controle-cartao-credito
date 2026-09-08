# Controle Cartão de Crédito

Serviço Next.js para receber SMS da CAIXA, registrar compras no Supabase e confirmar nome, parcelas e categoria pelo Telegram.

## Variáveis na Vercel

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `SMS_INGEST_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

## Endpoints

- `GET /api/health`
- `POST /api/sms/caixa`
- `POST /api/telegram/webhook`
