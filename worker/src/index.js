// Mawaqit push server (Cloudflare Worker + Durable Object).
// Stores each phone's push subscription with its location and settings,
// computes prayer times every minute and sends Web Push notifications.
import { DurableObject } from "cloudflare:workers";

const SUB_PREFIX = "sub:";
const MAX_SUBS = 2000;
const PUSH_HOSTS = [/(^|\.)push\.apple\.com$/, /(^|\.)googleapis\.com$/, /(^|\.)mozilla\.com$/, /(^|\.)mozaws\.net$/, /(^|\.)notify\.windows\.com$/];

/* ---------------- HTTP entry ---------------- */
export default {
  async fetch(req, env) {
    const cors = corsHeaders(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return new Response("Mawaqit push server: OK", { headers: cors });
    // Any failure still answers with CORS headers, so the app can show the real reason.
    try {
      const hub = env.HUB.get(env.HUB.idFromName("main"));
      const res = await hub.fetch(req);
      const h = new Headers(res.headers);
      for (const [k, v] of Object.entries(cors)) h.set(k, v);
      return new Response(res.body, { status: res.status, headers: h });
    } catch (e) {
      return new Response(JSON.stringify({ error: "worker", message: String(e && e.message || e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }
  },
  async scheduled(event, env, ctx) {
    const hub = env.HUB.get(env.HUB.idFromName("main"));
    ctx.waitUntil(hub.fetch("https://hub/api/tick", { method: "POST", headers: { "x-cron": "1" } }));
  },
};

function corsHeaders(req, env) {
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : (allowed[0] || "*"),
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

/* ---------------- Durable Object ---------------- */
export class Hub extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.env = env; this.jwt = {}; this.signKey = null; }

  async fetch(req) {
    const path = new URL(req.url).pathname;
    try {
      if (path === "/api/key") return json({ publicKey: (await this.vapid()).publicKey });
      // Fallback opened in Safari when the home-screen app cannot reach the server itself.
      if (path === "/api/link") return this.link(new URL(req.url).searchParams.get("d") || "");
      if (path === "/api/testlink") {
        const q = new URL(req.url).searchParams;
        let endpoint = ""; try { endpoint = new TextDecoder().decode(unb64u(q.get("e") || "")); } catch {}
        const r = await this.test(endpoint, Number(q.get("delay")) || 0);
        const msg = r.ok ? (r.scheduled ? "سيصلك إشعار الأذان خلال دقيقة أو دقيقتين ✓<br><small>أغلق التطبيق وقفل الهاتف لتراه كما سيظهر.</small>" : "أُرسل إشعار الأذان ✓")
          : "تعذّر إرسال التجربة<br><small>فعّل الإشعارات من التطبيق أولاً.</small>";
        return page(msg, r.ok ? 200 : 400);
      }
      if (req.method !== "POST") return json({ error: "method" }, 405);
      if (path === "/api/tick") {
        if (req.headers.get("x-cron") !== "1") return json({ error: "forbidden" }, 403);
        return json(await this.tick(Date.now()));
      }
      const body = await req.json().catch(() => ({}));
      if (path === "/api/subscribe") return this.subscribe(body);
      if (path === "/api/unsubscribe") {
        if (!body.endpoint) return json({ error: "endpoint" }, 400);
        await this.ctx.storage.delete(SUB_PREFIX + await idOf(body.endpoint));
        return json({ ok: true });
      }
      if (path === "/api/test") {
        const r = await this.test(body.endpoint, Number(body.delay) || 0);
        return json(r, r.ok ? 200 : (r.error === "not_found" ? 404 : 502));
      }
      return json({ error: "not_found" }, 404);
    } catch (e) {
      return json({ error: "server", message: String(e && e.message || e) }, 500);
    }
  }

  async subscribe(body) {
    const sub = body.subscription, prefs = cleanPrefs(body.prefs);
    if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return json({ error: "subscription" }, 400);
    let u;
    try { u = new URL(sub.endpoint); } catch { return json({ error: "endpoint" }, 400); }
    // Only real browser push services are accepted (local test server allowed in dev mode).
    const devOk = this.env.DEV === "1" && /^(localhost|127\.0\.0\.1)$/.test(u.hostname);
    if (!devOk && (u.protocol !== "https:" || !PUSH_HOSTS.some(r => r.test(u.hostname)))) return json({ error: "push_service" }, 400);
    if (!prefs) return json({ error: "prefs" }, 400);
    const key = SUB_PREFIX + await idOf(sub.endpoint);
    const old = await this.ctx.storage.get(key);
    if (!old) {
      const n = (await this.ctx.storage.list({ prefix: SUB_PREFIX, limit: MAX_SUBS + 1 })).size;
      if (n >= MAX_SUBS) return json({ error: "full" }, 503);
    }
    await this.ctx.storage.put(key, {
      sub: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
      prefs, sent: old ? old.sent : null, fails: 0, created: old ? old.created : Date.now(), updated: Date.now(),
    });
    return json({ ok: true });
  }

  async link(d) {
    let body = null;
    try { body = JSON.parse(new TextDecoder().decode(unb64u(d))); } catch {}
    let ok = false, sent = false;
    if (body) {
      const res = await this.subscribe(body);
      ok = res.status === 200;
      if (ok) {
        const rec = await this.ctx.storage.get(SUB_PREFIX + await idOf(body.subscription.endpoint));
        const st = rec && await this.send(rec, { title: "تم تفعيل الإشعارات", body: "ستصلك تنبيهات الصلاة هنا بإذن الله · " + (rec.prefs.name || ""), tag: "test" }).catch(() => 0);
        sent = st >= 200 && st < 300;
      }
    }
    const msg = ok ? (sent ? "تم تفعيل الإشعارات ✓<br><small>وصلك إشعار تجريبي. يمكنك الرجوع إلى التطبيق.</small>" : "تم حفظ الاشتراك ✓<br><small>ارجع إلى التطبيق.</small>")
      : "تعذّر التفعيل<br><small>ارجع إلى التطبيق وحاول مرة أخرى.</small>";
    return page(msg, ok ? 200 : 400);
  }

  /* A notification that looks exactly like a real prayer alert, now or after a delay (sent by the cron). */
  async test(endpoint, delay) {
    if (!endpoint) return { ok: false, error: "not_found" };
    const key = SUB_PREFIX + await idOf(endpoint), rec = await this.ctx.storage.get(key);
    if (!rec) return { ok: false, error: "not_found" };
    if (delay > 0) {
      rec.test = { at: Date.now() + Math.min(delay, 600) * 1000 };
      await this.ctx.storage.put(key, rec);
      return { ok: true, scheduled: true };
    }
    const status = await this.send(rec, liveMessage(rec.prefs, Date.now())).catch(() => 0);
    return { ok: status >= 200 && status < 300, status };
  }

  async tick(now) {
    const list = await this.ctx.storage.list({ prefix: SUB_PREFIX });
    let sent = 0, removed = 0;
    const jobs = [];
    for (const [key, rec] of list) {
      if (rec.test && rec.test.at <= now) {
        delete rec.test;
        jobs.push(this.send(rec, liveMessage(rec.prefs, now)).catch(() => 0).then(() => this.ctx.storage.put(key, rec)));
        continue;
      }
      let r;
      try { r = dueEvents(rec.prefs, now); } catch { continue; }
      const done = rec.sent && rec.sent.day === r.day ? rec.sent.tags : [];
      const todo = r.due.filter(e => !done.includes(e.tag));
      if (!todo.length) continue;
      jobs.push((async () => {
        let gone = false, ok = false;
        // Several due at once (e.g. after a pause): send only the latest, mark all as handled.
        const e = todo[todo.length - 1];
        const status = await this.send(rec, { title: e.title, body: e.body, tag: e.tag }).catch(() => 0);
        if (status === 404 || status === 410) gone = true;
        else if (status >= 200 && status < 300) ok = true;
        if (gone) { await this.ctx.storage.delete(key); removed++; return; }
        rec.sent = { day: r.day, tags: done.concat(todo.map(x => x.tag)) };
        rec.fails = ok ? 0 : (rec.fails || 0) + 1;
        if (rec.fails > 60) { await this.ctx.storage.delete(key); removed++; return; }
        await this.ctx.storage.put(key, rec);
        if (ok) sent++;
      })());
    }
    await Promise.all(jobs);
    return { subs: list.size, sent, removed };
  }

  /* ---- VAPID ---- */
  async vapid() {
    let v = await this.ctx.storage.get("vapid");
    if (!v) {
      const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
      v = { publicKey: b64u(await crypto.subtle.exportKey("raw", kp.publicKey)), privateJwk: await crypto.subtle.exportKey("jwk", kp.privateKey) };
      await this.ctx.storage.put("vapid", v);
    }
    if (!this.signKey) this.signKey = await crypto.subtle.importKey("jwk", v.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    return v;
  }
  async auth(endpoint) {
    const aud = new URL(endpoint).origin, now = Math.floor(Date.now() / 1000), c = this.jwt[aud];
    if (c && c.exp - now > 3600) return c.h;
    const v = await this.vapid(), exp = now + 12 * 3600;
    const part = o => b64u(te(JSON.stringify(o)));
    const unsigned = part({ typ: "JWT", alg: "ES256" }) + "." + part({ aud, exp, sub: this.env.SUBJECT || "https://example.com" });
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, this.signKey, te(unsigned));
    const h = `vapid t=${unsigned}.${b64u(sig)}, k=${v.publicKey}`;
    this.jwt[aud] = { h, exp };
    return h;
  }
  async send(rec, msg) {
    const body = await encryptPayload(rec.sub, JSON.stringify(msg));
    const res = await fetch(rec.sub.endpoint, {
      method: "POST",
      headers: {
        "TTL": "900", "Urgency": "high",
        "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream",
        "Authorization": await this.auth(rec.sub.endpoint),
      },
      body,
    });
    return res.status;
  }
}

/* ---------------- Web Push encryption (RFC 8291, aes128gcm) ---------------- */
export async function encryptPayload(sub, text) {
  const uaPub = unb64u(sub.keys.p256dh), authSecret = unb64u(sub.keys.auth);
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, concat(te("WebPush: info\0"), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(te(text), new Uint8Array([2]))));
  const header = new Uint8Array(86);
  header.set(salt, 0); new DataView(header.buffer).setUint32(16, 4096); header[20] = 65; header.set(asPub, 21);
  return concat(header, ct);
}
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, len * 8));
}
const te = s => new TextEncoder().encode(s);
function concat(...a) { const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of a) { out.set(x, o); o += x.length; } return out; }
export function b64u(buf) { const u = new Uint8Array(buf); let s = ""; for (const c of u) s += String.fromCharCode(c); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
export function unb64u(s) { s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
async function idOf(endpoint) { const h = new Uint8Array(await crypto.subtle.digest("SHA-256", te(endpoint))); return [...h.slice(0, 16)].map(x => x.toString(16).padStart(2, "0")).join(""); }

/* ---------------- Settings sent by the app ---------------- */
const FIVE = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
const PN = { fajr: "الفجر", dhuhr: "الظهر", asr: "العصر", maghrib: "المغرب", isha: "العشاء" };
const num = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
export function cleanPrefs(p) {
  if (!p || typeof p !== "object") return null;
  const lat = Number(p.lat), lng = Number(p.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 66 || Math.abs(lng) > 180) return null;
  const tz = String(p.tz || "UTC").slice(0, 64);
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); } catch { return null; }
  const m = p.method || {}, adj = {}, madj = {}, per = {};
  for (const k of ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]) {
    adj[k] = num(p.adj && p.adj[k], -60, 60, 0);
    madj[k] = num(m.adj && m.adj[k], -30, 30, 0);
  }
  for (const k of FIVE) per[k] = !!(p.per && p.per[k]);
  return {
    lat, lng, tz, name: String(p.name || "").slice(0, 60),
    method: { fajr: num(m.fajr, 5, 25, 18), isha: num(m.isha, 0, 25, 17), ishaMin: num(m.ishaMin, 0, 180, 0), adj: madj },
    asr: Number(p.asr) === 2 ? 2 : 1, adj, tzFix: num(p.tzFix, -2, 2, 0), per,
    before: [0, 5, 10, 15, 20, 30].includes(Number(p.before)) ? Number(p.before) : 0,
    athkar: !!p.athkar, friday: !!p.friday,
  };
}

/* ---------------- Prayer times (same algorithm as the app) ---------------- */
const R = Math.PI / 180;
const dsin = d => Math.sin(d * R), dcos = d => Math.cos(d * R), dtan = d => Math.tan(d * R);
const dasin = x => Math.asin(x) / R, dacos = x => Math.acos(x) / R, datan2 = (y, x) => Math.atan2(y, x) / R, dacot = x => Math.atan(1 / x) / R;
const fix = (a, b) => { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; };
function julian(y, m, d) { if (m <= 2) { y -= 1; m += 12; } const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4); return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5; }
function sunPos(jd) {
  const D = jd - 2451545, g = fix(357.529 + 0.98560028 * D, 360), q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * dsin(g) + 0.020 * dsin(2 * g), 360), e = 23.439 - 0.00000036 * D, RA = datan2(dcos(e) * dsin(L), dcos(L)) / 15;
  return { decl: dasin(dsin(e) * dsin(L)), eqt: q / 15 - fix(RA, 24) };
}
const MA_GMT_FROM = Date.UTC(2026, 8, 20, 2, 0);
const MA_TZ = ["Africa/Casablanca", "Africa/El_Aaiun"];
const fmtCache = {};
function partsIn(tz, date) {
  const f = fmtCache[tz] || (fmtCache[tz] = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }));
  const o = {}; for (const p of f.formatToParts(date)) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, H: (+o.hour) % 24, M: +o.minute, s: +o.second };
}
function offsetAt(tz, ms, tzFix) {
  let base;
  if (MA_TZ.includes(tz) && ms >= MA_GMT_FROM) base = 0;
  else { const s = Math.floor(ms / 1000) * 1000, p = partsIn(tz, new Date(s)); base = Math.round((Date.UTC(p.y, p.m - 1, p.d, p.H, p.M, p.s) - s) / 60000) / 60; }
  return base + (tzFix || 0);
}
export function localNow(tz, tzFix, ms) {
  const x = new Date(ms + offsetAt(tz, ms, tzFix) * 3600000);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate(), H: x.getUTCHours(), M: x.getUTCMinutes(), s: x.getUTCSeconds() };
}
export function computeDay(y, m, d, P) {
  const M = P.method, lat = P.lat, lng = P.lng, tz = offsetAt(P.tz, Date.UTC(y, m - 1, d, 12), P.tzFix);
  const jd0 = julian(y, m, d) - lng / (15 * 24);
  const midDay = t => fix(12 - sunPos(jd0 + t).eqt, 24);
  const angleTime = (a, t, ccw) => {
    const decl = sunPos(jd0 + t).decl, noon = midDay(t);
    const c = (-dsin(a) - dsin(decl) * dsin(lat)) / (dcos(decl) * dcos(lat)); if (c > 1 || c < -1) return NaN;
    const T = dacos(c) / 15; return noon + (ccw ? -T : T);
  };
  const asrTime = (f, t) => { const decl = sunPos(jd0 + t).decl; return angleTime(-dacot(f + dtan(Math.abs(lat - decl))), t, false); };
  const init = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, isha: 18 }; let t = Object.assign({}, init);
  for (let i = 0; i < 2; i++) {
    const p = {}; for (const k in t) p[k] = (isNaN(t[k]) ? init[k] : t[k]) / 24;
    t = { fajr: angleTime(M.fajr, p.fajr, true), sunrise: angleTime(0.833, p.sunrise, true), dhuhr: midDay(p.dhuhr),
      asr: asrTime(P.asr, p.asr), sunset: angleTime(0.833, p.sunset, false), isha: M.ishaMin ? NaN : angleTime(M.isha, p.isha, false) };
  }
  for (const k in t) t[k] += tz - lng / 15;
  if (M.ishaMin) t.isha = t.sunset + M.ishaMin / 60;
  const night = fix(t.sunrise - t.sunset, 24);
  if (!isNaN(night)) {
    const fp = M.fajr / 60 * night; if (isNaN(t.fajr) || fix(t.sunrise - t.fajr, 24) > fp) t.fajr = t.sunrise - fp;
    if (!M.ishaMin) { const ip = M.isha / 60 * night; if (isNaN(t.isha) || fix(t.isha - t.sunset, 24) > ip) t.isha = t.sunset + ip; }
  }
  t.maghrib = t.sunset;
  const ma = M.adj || {};
  for (const k of ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]) { t[k] += ((ma[k] || 0) + (+P.adj[k] || 0)) / 60; t[k] = Math.round(t[k] * 60) / 60; }
  return t;
}
function hm(h) { h = fix(h + 0.5 / 60, 24); const H = Math.floor(h), Mi = Math.floor((h - H) * 60); return String(H).padStart(2, "0") + ":" + String(Mi).padStart(2, "0"); }
const mins = n => n + (n <= 10 ? " دقائق" : " دقيقة");

/* Test message: the next prayer, worded exactly like the real alert. */
function liveMessage(P, nowMs) {
  try {
    const p = localNow(P.tz, P.tzFix, nowMs), nowH = p.H + p.M / 60, T = computeDay(p.y, p.m, p.d, P);
    const k = FIVE.find(x => T[x] > nowH) || "fajr";
    return { title: "حان وقت صلاة " + PN[k], body: (P.name ? P.name + " · " : "") + "تجربة الإشعار", tag: "live-test" };
  } catch { return { title: "حان وقت الصلاة", body: "تجربة الإشعار", tag: "live-test" }; }
}
function page(msg, status) {
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>مواقيت</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0B1422;color:#E6EDF7;font:600 24px/1.6 system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box}small{font-size:16px;font-weight:400;color:#8C9AB0}</style></head>
<body><div>${msg}</div></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/* Which notifications are due now for one phone. A 5-minute window absorbs a late cron run. */
export function dueEvents(P, nowMs) {
  const p = localNow(P.tz, P.tzFix, nowMs), nowH = p.H + p.M / 60 + p.s / 3600;
  const T = computeDay(p.y, p.m, p.d, P), dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  const where = P.name ? P.name + " · " : "";
  const ev = [];
  for (const k of FIVE) {
    if (!P.per[k] || isNaN(T[k])) continue;
    const jum = k === "dhuhr" && dow === 5;
    ev.push({ at: T[k], tag: k, title: jum ? "حان وقت صلاة الجمعة" : "حان وقت صلاة " + PN[k], body: where + hm(T[k]) });
    if (P.before > 0) ev.push({ at: T[k] - P.before / 60, tag: k + "-b", title: (jum ? "الجمعة" : PN[k]) + " بعد " + mins(P.before), body: "الأذان على الساعة " + hm(T[k]) });
  }
  if (P.athkar) {
    ev.push({ at: T.fajr + 20 / 60, tag: "am", title: "أذكار الصباح", body: "وقتها حتى الشروق " + hm(T.sunrise) });
    ev.push({ at: T.asr + 20 / 60, tag: "pm", title: "أذكار المساء", body: "وقتها حتى المغرب " + hm(T.maghrib) });
  }
  if (P.friday && dow === 5) {
    ev.push({ at: 9, tag: "kahf", title: "يوم الجمعة", body: "اقرأ سورة الكهف وأكثِر من الصلاة على النبي ﷺ" });
    ev.push({ at: T.dhuhr - 0.75, tag: "jumua", title: "صلاة الجمعة بعد 45 دقيقة", body: "الاغتسال والتبكير إلى المسجد · الأذان " + hm(T.dhuhr) });
  }
  return { day: `${p.y}-${p.m}-${p.d}`, due: ev.filter(e => nowH >= e.at && nowH < e.at + 5 / 60).sort((a, b) => a.at - b.at) };
}
