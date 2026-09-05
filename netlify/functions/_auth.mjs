/* Who is calling, proved rather than claimed.
 *
 * A page can put any sm_id in a request body. The only thing it cannot
 * forge is a Supabase access token, so every function that acts on someone's
 * behalf resolves the caller here first. The technicians row is read with
 * the CALLER'S OWN token, so RLS is what limits it - no service_role key is
 * involved, and this cannot be turned into a way to read the roster.
 *
 * Files starting with "_" are not deployed as functions; this is a shared
 * module the others import.
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
    `${url}/rest/v1/technicians?user_id=eq.${encodeURIComponent(user.id)}&select=sm_id,first_name,last_name,company,can_review`,
    { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
  if (!q.ok) return { ok: false, status: 502, error: "Couldn't confirm your account." };
  const rows = await q.json();
  const t = Array.isArray(rows) ? rows[0] : null;
  if (!t) return { ok: false, status: 403, error: "This account isn't linked to a technician." };
  if (need && !t.can_review)
    return { ok: false, status: 403, error: "Approving a design is a KYTC Central Office reviewer's action." };

  return { ok: true, sm_id: t.sm_id, name: `${t.first_name} ${t.last_name}`,
           company: t.company, can_review: !!t.can_review, email: user.email, user_id: user.id };
}
