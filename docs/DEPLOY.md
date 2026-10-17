# Deploying EPD to GitHub Pages (politsei.eu)

EPD is a static site. `.github/workflows/deploy.yml` builds it on every push to `main` (or when
run by hand) and publishes `dist/` through GitHub Pages. The custom domain **politsei.eu** serves
the game from the domain root. The workflow reads the site's base path from `actions/configure-pages`,
so the same build works at `https://qupkene.github.io/Estonian-Police-Dispatch/` before the domain
is ready and at `https://politsei.eu/` afterwards.

| | |
| --- | --- |
| Repository | `Qupkene/Estonian-Police-Dispatch` (from `git remote -v`) |
| Owner's Pages host | `qupkene.github.io` (GitHub user names are case-insensitive; the host is lowercase) |
| Live site | https://politsei.eu |
| Workflows | `ci.yml` (typecheck, tests, build, e2e) and `deploy.yml` (Pages) |

> EPD is an unofficial fan game and is not affiliated with the Estonian Police and Border Guard
> Board (PPA). The official police site is politsei.ee. Because politsei.eu is one letter away from
> it, keep the disclaimer visible and keep the domain safe from takeover (steps 2 and 7).

Do the steps in this order. Only a repository admin can change the settings.

## 1. Turn on GitHub Pages with GitHub Actions

1. Open the repository on GitHub, then **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**. Do not choose "Deploy from
   a branch".
3. Start a deployment: push to `main`, or open **Actions → Deploy to GitHub Pages → Run workflow**.
4. The first run creates the `github-pages` environment. If the deploy job fails with *"Branch …
   is not allowed to deploy to github-pages due to environment protection rules"*, open
   **Settings → Environments → github-pages → Deployment branches and tags** and allow `main`.

Until the custom domain is set, the game is playable at `https://qupkene.github.io/Estonian-Police-Dispatch/`.
After you add the custom domain in step 3, re-run the deploy workflow once (Actions → Deploy to GitHub
Pages → Run workflow) so the build switches to the domain root.

To try the game from this pull request before merging, allow its branch under **Settings →
Environments → github-pages → Deployment branches and tags**, then run the workflow on that branch.

## 2. Verify politsei.eu on the GitHub account (prevents takeover)

Verifying the domain means no other GitHub account can attach `politsei.eu` (or its subdomains)
to their own Pages site, for example while your DNS points at GitHub but the repository setting
is empty.

1. Click your avatar, then **Settings → Pages** (account settings, not repository settings). If
   the repository is moved to an organization, use **Organization settings → Pages** instead.
2. Click **Add a domain**, enter `politsei.eu` and continue.
3. GitHub shows a TXT record, roughly:
   - name: `_github-pages-challenge-qupkene.politsei.eu` (at most registrars you type only
     `_github-pages-challenge-qupkene`)
   - value: a random code
4. Add that TXT record at the registrar (step 3). Wait a few minutes, then click **Verify**.
5. Keep the TXT record for good. GitHub checks it again from time to time.

## 3. DNS records at the .eu registrar

In the DNS panel of the registrar (or the DNS host) for `politsei.eu`, create these records.
Delete anything that conflicts first: the registrar's parking or "website builder" A records,
URL forwarding, ALIAS/ANAME records on the apex, and any old `www` record.

| Type | Name / host | Value |
| --- | --- | --- |
| A | `@` (apex, `politsei.eu`) | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |
| CNAME | `www` | `qupkene.github.io.` |
| TXT | `_github-pages-challenge-qupkene` | the code from step 2 |

Notes:

- The `www` CNAME points to `<owner>.github.io` **without** the repository name. The owner is
  `qupkene`. If the repository is ever moved to an organization, change it to `<org>.github.io`.
- Some panels add the domain automatically. If yours does, type `qupkene.github.io` without the
  trailing dot.
- Do **not** create a wildcard record (`*.politsei.eu`). It lets anyone claim a subdomain on
  GitHub Pages.
- If the zone has **CAA** records, one of them must allow Let's Encrypt: `0 issue "letsencrypt.org"`.
  If there are no CAA records at all, you need not add any.
- DNSSEC is fine, as long as the registrar signs the zone correctly.

## 4. Set the custom domain on the repository

1. **Settings → Pages → Custom domain**: enter `politsei.eu` (the apex, not `www`) and click **Save**.
2. GitHub runs a DNS check. It may say the DNS check is in progress or failed until the records
   from step 3 have spread. That can take from a few minutes to 24 hours, and occasionally up to 48.
3. With the apex as the custom domain and the `www` CNAME in place, GitHub redirects
   `www.politsei.eu` to `politsei.eu` automatically.

About `public/CNAME`: the file contains `politsei.eu` and Vite copies it into `dist/`. When Pages
publishes from **GitHub Actions**, GitHub ignores that file. The setting in **Settings → Pages**
is what counts, and it persists across deployments. The file stays in the repository as
documentation and for hosts that read it.

## 5. Turn on HTTPS

Once DNS resolves to GitHub, GitHub requests a Let's Encrypt certificate for `politsei.eu` and
`www.politsei.eu`. This usually takes minutes, sometimes up to an hour after the DNS check passes.

1. Reload **Settings → Pages**. When the **Enforce HTTPS** checkbox becomes clickable, tick it.
2. If it stays greyed out with *"Unavailable for your site because your domain is not properly
   configured to support HTTPS"* for more than 24 hours, check the records again, then remove the
   custom domain, save, add it again and save. That triggers a new certificate request.

The service worker (offline mode) and PWA install need HTTPS, so do not skip this step.

## 6. Check that it works

```bash
dig politsei.eu A +short          # the four 185.199.10x.153 addresses
dig politsei.eu AAAA +short       # the four 2606:50c0:800x::153 addresses
dig www.politsei.eu +short        # qupkene.github.io. followed by GitHub's addresses
dig TXT _github-pages-challenge-qupkene.politsei.eu +short
curl -sI https://politsei.eu | head -n 5        # HTTP/2 200, server: GitHub.com
curl -sIL http://www.politsei.eu | grep -i '^location'   # redirects end at https://politsei.eu/
```

Then open https://politsei.eu, check that the menu loads, that `/legacy/politseimang-2025.html`
opens, and that **Settings → Pages** says *"Your site is live at https://politsei.eu"*.

## 7. Keep the .eu domain

- **Eligibility.** A `.eu` domain may only be held by: a citizen of an EU or EEA country (Iceland,
  Liechtenstein, Norway), wherever they live; a person resident in the EU/EEA; or a company or
  organisation established in the EU/EEA. EURid, the registry, can suspend and later revoke a
  domain whose holder no longer qualifies, so keep the registrant details accurate. An Estonian
  citizen or resident qualifies.
- **Renewal.** Turn on auto-renew and keep the registrar's contact e-mail working. An expired
  domain that looks this much like politsei.ee could be picked up and used to impersonate the
  police.
- **If you stop hosting.** Remove the custom domain in Settings → Pages *and* delete the DNS
  records together. DNS pointing at GitHub with no site behind it is what makes takeover possible
  (the domain verification from step 2 also guards against it).

## Hosting somewhere else

The `base` in `vite.config.ts` comes from the `BASE_PATH` environment variable and defaults to `/`.

- **github.io project page without a custom domain:** build with
  `BASE_PATH=/Estonian-Police-Dispatch/`, by changing the `env` of the Build step in
  `deploy.yml`. Note that once a custom domain is set, the github.io address just redirects to it.
- **Any other static host** (Netlify, Cloudflare Pages, nginx, …): run `npm ci && npm run build`
  and publish `dist/`. Set `BASE_PATH` if the site lives under a sub-path, for example
  `BASE_PATH=/epd/ npm run build`.
  - The game switches screens in-app and has no URL routes, so no rewrite rules are needed.
    Serve `404.html` for missing files if the host supports it. Its "home" link points to `/`
    (and to `/<repo>/` on github.io); adjust it for other sub-path hosts.
  - Serve over HTTPS (or `localhost`), otherwise the service worker is not registered.
  - Caching: `assets/*` file names are content-hashed and can be cached for a year (`immutable`).
    Serve `index.html`, `sw.js` and `manifest.webmanifest` with a short cache or `no-cache`.
  - MIME type for `.webmanifest`: `application/manifest+json`.

## Service worker and updates

`public/sw.js` keeps the game playable offline. Pages load network-first, so players get a new
deployment on their next online visit. Hashed `assets/*` and the map `glyphs/*` are served from
the cache. Up to about 400 CARTO map tiles are cached as players browse.

- Bump `VERSION` at the top of `public/sw.js` when a release changes `public/glyphs/`, other
  non-hashed files or the caching logic. Old caches are deleted when the new worker activates.
- To reset a browser: DevTools → Application → Service workers → **Unregister**, then
  Storage → **Clear site data**.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| *"Get Pages site failed"* / *"Not Found"* in **Configure GitHub Pages** | Pages is not enabled or the source is not **GitHub Actions**. See step 1. |
| Deploy job: *"… not allowed to deploy to github-pages due to environment protection rules"* | Allow `main` in Settings → Environments → github-pages. |
| politsei.eu shows GitHub's *"There isn't a GitHub Pages site here"* | The custom domain is not set on the repository (step 4), or DNS still points elsewhere. |
| The registrar's parking page still shows | Old A records or URL forwarding are left over at the registrar, or DNS has not spread yet. `dig politsei.eu A +short` must show only the four GitHub addresses. |
| Settings → Pages: *"DNS check unsuccessful"* / *InvalidDNSError* | Check the records against step 3, remove extra A/AAAA records, wait, then click **Check again**. |
| *"The custom domain politsei.eu is already taken"* | Another repository uses it. Remove it there. Verifying the domain (step 2) stops other accounts from using it. |
| **Enforce HTTPS** is greyed out | The certificate is not issued yet. Wait; check CAA records; remove and re-add the custom domain (step 5). |
| Blank page; `assets/*.js` returns 404 | Built with the wrong `BASE_PATH`. For politsei.eu it must be `/` (see `deploy.yml`). |
| Old version shows after a deploy | GitHub Pages caches HTML for up to 10 minutes, and the service worker updates on the next visit. Reload once more, or clear site data. |
| `npm ci` fails in the workflow | `package-lock.json` is out of sync with `package.json`. Run `npm install` locally and commit the lock file. |
| The e2e job is red but the run is green | Expected for now: the e2e job has `continue-on-error: true`. Download the `playwright-report` artifact from the run to see why it failed. |
