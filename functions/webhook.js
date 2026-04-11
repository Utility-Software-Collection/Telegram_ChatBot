// functions/webhook.js
import { DB } from './_shared/db.js';
import { processUpdate } from './_shared/bot.js';

/**
 * FIX: CF Pages Functions expose waitUntil on the *context* object, not on env.
 * Signature: onRequestPost(context) where context = { request, env, waitUntil, ... }
 */
export async function onRequestPost(context) {
  const { request, env, waitUntil } = context;

  try {
    if (!env.KV) {
      console.error('KV namespace not bound');
      return new Response(
        'KV 命名空间未绑定，请在 Pages 设置中添加 KV 绑定（变量名 KV）',
        { status: 500 },
      );
    }

    const db = new DB(env.KV);
    await db.ensureDefaultAdmin();

    // Verify webhook secret
    const secret         = await db.getSetting('WEBHOOK_SECRET');
    const receivedSecret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');

    if (secret && receivedSecret !== secret) {
      console.error('Webhook secret mismatch');
      return new Response('Unauthorized', { status: 401 });
    }

    let update;
    try {
      update = await request.json();
    } catch (e) {
      console.error('Invalid JSON:', e);
      return new Response('Bad Request: invalid JSON', { status: 400 });
    }

    const envCtx = { _db: db, KV: env.KV };

    // FIX: use context.waitUntil (not env.waitUntil — that doesn't exist)
    const promise = processUpdate(update, envCtx).catch(err => {
      console.error('processUpdate error:', err);
    });

    waitUntil(promise);

    return new Response('OK');
  } catch (error) {
    console.error('Webhook handler error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
