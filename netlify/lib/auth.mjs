/* Who is calling, proved rather than claimed.
 *
 * A page can put any sm_id in a request body. The only thing it cannot
 * forge is a Supabase access token, so every function that acts on someone's
 * behalf resolves the caller here first. The technicians row is read with
 * the CALLER'S OWN token, so RLS is what limits it - no service_role key is
 * involved, and this cannot be turned into a way to read the roster.
 *
 * This is a shared module, not a function. It lives in netlify/lib/ rather
 * than netlify/functions/ because Netlify deploys EVERY file in the functions
 * directory as an endpoint - a leading underscore does not exempt it. Checked
 * on the deploy preview 2026-09-07: /.netlify/functions/_auth answered 502
 * "handler not found" rather than 404. The bundler follows relative imports
 * into sibling directories, so this is the tidy place.
 */
export const ENV = (k) => process.env[k] || "";

export function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function verifyTechnician(req, opts) {
  const need = (opts && opts.requireReview) === true;
  const url = ENV("SUPABASE_URL"), anon = ENV("SUPABASE_ANON_KEY");
  if (!url || !anon) return { ok: false, status: 500, error: "Auth is not configured (SUPABASE_URL / SUPABASE_ANON_KEY)." };

  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return { ok: false, status: 401, error: "Not signed in." };

  const u = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
  if (!u.ok) return { ok: false, status: 401, error: "Your session has expired. Sign in again." };
  const user = await u.json();

  const q = await fetch(
    `${url}/rest/v1/technicians?user_id=eq.${encodeURIComponent(user.id)}&select=sm_id,first_name,last_name,company,can_review,onboarded`,
    { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
  if (!q.ok) return { ok: false, status: 502, error: "Couldn't confirm your account." };
  const rows = await q.json();
  const t = Array.isArray(rows) ? rows[0] : null;
  if (!t) return { ok: false, status: 403, error: "This account isn't linked to a technician." };
  // The pages send an un-onboarded account back to login, but a function
  // cannot lean on a page: anyone holding a valid token can call it directly.
  // Until onboarding the account's email is the fabricated
  // <sm_id>@technicians.mix.local, which would otherwise become the reply-to
  // on a submission and bounce KYTC's answer into nothing.
  if (!t.onboarded)
    return { ok: false, status: 403, error: "Finish setting up your account (a real email and password) before submitting or approving." };
  if (need && !t.can_review)
    return { ok: false, status: 403, error: "Approving a design is a KYTC Central Office reviewer's action." };

  return { ok: true, sm_id: t.sm_id, name: `${t.first_name} ${t.last_name}`,
           company: t.company, can_review: !!t.can_review, email: user.email, user_id: user.id };
}
