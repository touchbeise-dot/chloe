# Chloe's EA — Cloudflare Pages

```
public/index.html          the app
functions/_middleware.js   locks everything behind /<APP_SECRET>, serves the API
lib/ics.js                 Google iCal parser
```

Must be Git-connected (or `wrangler pages deploy`). Drag-and-drop uploads don't run Functions.

1. Push this folder to a new private GitHub repo.
2. Workers & Pages → Create → Pages → Connect to Git → pick the repo.
   Framework preset: None. Build command: empty. Output directory: `public`.
3. Storage & Databases → KV → Create namespace (e.g. `chloe-ea`).
4. Pages project → Settings → Bindings → Add → KV namespace. Variable name `DB`, pick the namespace.
5. Settings → Variables and Secrets → add, type Secret, Production:
   `APP_SECRET`, `ICS_PERSONAL`, `ICS_BEISE`, `ICS_WORK`
6. Deployments → latest → ⋯ → Retry deployment. Bindings and secrets only apply to new deployments.
7. Open `https://<project>.pages.dev/<APP_SECRET>`. Everything else returns 404.

Update the app later: edit `public/index.html`, commit, push. Data in KV is untouched.
