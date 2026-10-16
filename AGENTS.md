# Agent rules — Jeschurun jes-v2 rebuild

## Allowed

- Repo: `adas-jeschurun/jeschurun` only
- Cloudflare account: `a58137a2fbfd21aecffa8885f16bf12f` only
- Resource names: `jes-v2-*` only
- CF mutations: **only** via `scripts/cf.mjs` (runs `scripts/assert-isolation.mjs` first)

## Denylist (never touch)

### Friend remotes / repos

- `jeschurun-site`
- `jeschurun-admin`
- `jeschurun-content`

No push, no wrangler from their cwd, no write tokens into content.

### Friend Cloudflare Pages

- `jeschurun-site`
- `jeschurun-admin`

### Friend D1 UUIDs (sha256 of UUID string — never store plaintext UUIDs in public tree)

- `a4bc59c351229c79e6497ae414cf9eaae43bcc446a24f31f429bc9ad5d1e5681`
- `939a5773f75a7780de20edc15467ff90533588dd33db3f11b3b40f1d68dc765d`

### Other

- Friend Turnstile widgets / Access apps for friend hosts
- `jeschurun.org` DNS without explicit user domain OK
- Personal CF account `4e72bd5e…`

## Mandatory

1. Before every mutate: token must resolve to account `a58137a2fbfd21aecffa8885f16bf12f`.
2. Target name must match `^jes-v2-`.
3. Integration branch: `cursor/vite-react-site-90b1` (no merge to `main` without user OK).
4. Admin: `ADMIN_PREVIEW_TOKEN` fail-closed.
5. noindex on jes-v2 until domain cutover.
