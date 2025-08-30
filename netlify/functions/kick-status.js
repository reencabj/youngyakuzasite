// netlify/functions/kick-status.js
let cachedToken = null;
let tokenExpiresAt = 0;

const clean = (s) => (s || "").trim();

async function getAppToken() {
  const clientId = clean(process.env.KICK_CLIENT_ID);
  const clientSecret = clean(process.env.KICK_CLIENT_SECRET);

  if (!clientId || !clientSecret) {
    const msg = { live: null, error: "missing_env_vars", hasClientId: !!clientId, hasClientSecret: !!clientSecret };
    throw Object.assign(new Error("Missing env vars"), { debugPayload: msg });
  }

  // cache simple en memoria
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) return cachedToken;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  let res, text;
  try {
    res = await fetch("https://id.kick.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
    });
    text = await res.text();
  } catch (e) {
    const err = { live: null, error: "oauth_fetch_failed", detail: String(e) };
    throw Object.assign(new Error("fetch to OAuth failed"), { debugPayload: err });
  }

  if (!res.ok) {
    let parsed; try { parsed = JSON.parse(text); } catch {}
    const err = { live: null, error: "oauth_error", status: res.status, body: parsed || text.slice(0, 300) };
    throw Object.assign(new Error("Kick OAuth failed"), { debugPayload: err });
  }

  let json;
  try { json = JSON.parse(text); } catch { throw new Error("Invalid JSON from OAuth"); }

  cachedToken = json.access_token;
  tokenExpiresAt = Date.now() + Math.max(0, (json.expires_in - 60)) * 1000; // margen 60s
  return cachedToken;
}

export async function handler(event) {
  const qs = event.queryStringParameters || {};
  const slug = clean((qs.slug || "").toLowerCase());
  const debug = qs.debug === "1";

  try {
    // DEBUG: chequea que la función vea las env vars (NO muestra secretos)
    if (debug) {
      const id = clean(process.env.KICK_CLIENT_ID);
      const sec = clean(process.env.KICK_CLIENT_SECRET);
      return {
        statusCode: 200,
        body: JSON.stringify({
          sees_env: !!id && !!sec,
          id_prefix: id ? id.slice(0, 6) : null,
          id_length: id ? id.length : 0,
          secret_length: sec ? sec.length : 0,
        }),
      };
    }

    if (!slug) {
      return { statusCode: 400, body: JSON.stringify({ error: "slug required" }) };
    }

    const token = await getAppToken();

    // Channels por slug — trae stream.is_live si está en vivo
    let r, bodyText;
    try {
      r = await fetch(`https://api.kick.com/public/v1/channels?slug=${encodeURIComponent(slug)}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      bodyText = await r.text();
    } catch (e) {
      return { statusCode: 200, body: JSON.stringify({ live: null, error: "channels_fetch_failed", detail: String(e) }) };
    }

    if (!r.ok) {
      let parsed; try { parsed = JSON.parse(bodyText); } catch {}
      return { statusCode: 200, body: JSON.stringify({ live: null, error: "kick_api_error", status: r.status, body: parsed || bodyText.slice(0, 300) }) };
    }

    let j; try { j = JSON.parse(bodyText); } catch { return { statusCode: 200, body: JSON.stringify({ live: null, error: "invalid_json" }) }; }
    const ch = j?.data?.[0] || null;
    const live = ch?.stream?.is_live === true;

    return { statusCode: 200, body: JSON.stringify({ live, slug: ch?.slug ?? slug }) };
  } catch (e) {
    // Cualquier excepción no prevista
    return { statusCode: 200, body: JSON.stringify(e?.debugPayload || { live: null, error: String(e?.message || e) }) };
  }
}
