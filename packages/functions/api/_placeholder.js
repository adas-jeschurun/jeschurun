/**
 * Placeholder Pages Function module.
 * Real API routes land in later phases; sync-functions copies this tree
 * into apps/site/functions and apps/admin/functions.
 */
export async function onRequest() {
  return new Response(JSON.stringify({ ok: true, stub: true }), {
    headers: { "content-type": "application/json" },
  });
}
