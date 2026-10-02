// Runs before every request. Only /<APP_SECRET> and /<APP_SECRET>/api/* are reachable;
// everything else (including /index.html) returns 404.
import { parseICS, CAL_TTL } from '../lib/ics.js';

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const text = (t, s = 200) => new Response(t, { status: s });

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  if (!env.APP_SECRET) return text('APP_SECRET not set', 500);
  if (!env.DB) return text('KV binding DB not set', 500);
  const base = '/' + env.APP_SECRET;
  if (url.pathname !== base && !url.pathname.startsWith(base + '/')) return text('Not found', 404);
  const rest = url.pathname.slice(base.length).replace(/\/+$/, '');

  if (rest === '') {
    const r = await env.ASSETS.fetch(new URL('/', url));
    return new Response(r.body, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }

  if (rest === '/api/state') {
    if (request.method === 'GET') {
      const v = await env.DB.get('state');
      return v ? new Response(v, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }) : new Response(null, { status: 204 });
    }
    if (request.method === 'PUT') {
      const body = await request.text();
      if (body.length > 4_000_000) return text('Too large', 413);
      try { JSON.parse(body); } catch { return text('Bad JSON', 400); }
      await env.DB.put('state', body);
      return json({ ok: true, at: new Date().toISOString() });
    }
  }

  if (rest === '/api/calendar' && request.method === 'GET') {
    if (url.searchParams.get('refresh') !== '1') {
      const cached = await env.DB.get('calcache');
      if (cached) { const c = JSON.parse(cached); if (Date.now() - c.at < CAL_TTL * 1000) return json(c); }
    }
    const sources = [['personal', env.ICS_PERSONAL], ['beise', env.ICS_BEISE], ['work', env.ICS_WORK]].filter(([, u]) => u);
    const results = await Promise.all(sources.map(async ([src, u]) => {
      try {
        const r = await fetch(u, { headers: { 'user-agent': 'chloe-ea/1' } });
        if (!r.ok) return { src, error: 'HTTP ' + r.status, events: [] };
        return { src, events: parseICS(await r.text(), src) };
      } catch (e) { return { src, error: String(e), events: [] }; }
    }));
    const out = { at: Date.now(), events: results.flatMap(r => r.events), errors: results.filter(r => r.error).map(({ src, error }) => ({ src, error })) };
    await env.DB.put('calcache', JSON.stringify(out), { expirationTtl: CAL_TTL * 6 });
    return json(out);
  }
  return text('Not found', 404);
}
