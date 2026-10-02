# Chloe's EA — Cloudflare Pages

```
public/index.html            the app
public/manifest.webmanifest  home-screen app settings
public/sw.js                 offline cache
public/icons/                app icon + iPhone 17 Pro Max splash
functions/_middleware.js     locks everything behind /<APP_SECRET>/, serves the API
lib/ics.js                   Google iCal parser
```

Must be Git-connected (or `wrangler pages deploy`). Drag-and-drop uploads don't run Functions.
Settings: Framework None, no build command, output directory `public`. KV binding `DB`.
Secrets: `APP_SECRET`, `ICS_PERSONAL`, `ICS_BEISE`, `ICS_WORK`. Retry deployment after changing any of them.

App URL: `https://<project>.pages.dev/<APP_SECRET>/` (a missing trailing slash is added automatically).

## Put it on the iPhone
Open the URL in Safari → Share → Add to Home Screen. If it was added before this update, delete the old
home-screen icon and add it again, so iOS picks up the new icon and opens it full screen.

## Change the icon
Replace the files in `public/icons/` (same names), and bump `VERSION` in `public/sw.js` so phones fetch them.
