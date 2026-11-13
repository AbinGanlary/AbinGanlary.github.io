# Resume site (Google Sheets + Apps Script + GitHub Pages)

Edit your resume in a Google Sheet. The site updates on its own. Your GitHub repos are pulled in live.

```
Google Sheet ──(Apps Script web app, JSON)──► index.html on GitHub Pages ◄── GitHub API (public repos)
      ▲                                              │
      └────────── contact form (POST) ◄──────────────┘   → Messages tab + email to you
```

## Files
- `index.html`: the whole site (no build step). Set `CONFIG.API_URL` at the top of the script.
- `seed.json`: starting content. The site falls back to it when `API_URL` is empty or the Sheet is unreachable.
- `apps-script/Code.gs`: API, contact form, `setup()`, "Website" menu.
- `apps-script/Seed.gs`: the same content as `seed.json`, used once by `setup()` to fill the Sheet.

## 1. Create the Sheet (5 min)
1. Go to sheets.new and name the sheet "Website".
2. Open Extensions → Apps Script. Replace `Code.gs` with `apps-script/Code.gs`, then add a file named `Seed` and paste `apps-script/Seed.gs` into it.
3. Choose `setup` in the function dropdown, click ▶ Run and approve the permissions. This creates the tabs Profile, Highlights, Experience, Projects, Skills, Education, Certifications, Languages and Messages.
4. Optional: in **Profile**, set `_notify_email` to the address that should receive contact-form messages. Keys that start with `_` are never published.

## 2. Publish the API
1. In Apps Script, go to Deploy → New deployment → type **Web app**.
2. Set **Execute as:** Me and **Who has access:** Anyone.
3. Copy the URL that ends in `/exec` and paste it into `CONFIG.API_URL` in `index.html`.
4. When you change `Code.gs` later, go to Deploy → Manage deployments → ✏️ → Version: *New version*. This keeps the same URL.

## 3. Host free on GitHub Pages
1. Create a public repo named `AbinGanlary.github.io` and push `index.html` and `seed.json` (the `apps-script/` folder is optional).
2. The site goes live at `https://abinganlary.github.io` within a minute or two.
3. Optional: buy a domain and add it under the repo's Settings → Pages → Custom domain.

## Updating the script with clasp (optional)
The script is also linked to `apps-script/` through clasp (`.clasp.json`, which is git-ignored). After you change `Code.gs`, run these from `apps-script/`:
```
npx.cmd @google/clasp@2.4.2 push --force
npx.cmd @google/clasp@2.4.2 deploy -i AKfycbx9L7jm5WUn-k6TnTRqmbZhVkdgoSWoq2Rhksf4whYBWGVN9V_IiOkNCvrqOzz2-2Tt -d "describe the change"
```
Deploying with `-i` keeps the same `/exec` URL, so the site doesn't need changing.

## Editing day to day
- **Experience → bullets**: put one bullet per line inside the cell (Ctrl+Enter makes a new line).
- **show** column: set it to FALSE to hide a row without deleting it.
- **Projects**: GitHub repos appear automatically. Add a row with the `repo` name to override the title, blurb or tags, to set `featured` TRUE, or to set `hide` TRUE. A row with no matching repo shows up if it has a `title` and a `link`.
- Edits clear the cache straight away. If they don't, use the **Website → Refresh site now** menu.
- Contact messages land in the **Messages** tab and are also emailed to you.
- **Colors**: set `palette` in Profile to `indigo` (default), `forest`, `harbor`, `navy`, `copper` or `original`. These are Color Hunt palettes adjusted to pass WCAG AA contrast in light and dark mode. To compare them live, open the site with `?pick=1` at the end of the URL.
- **Save as PDF**: the page prints as a clean one-column resume. Or set `resume_pdf_url` in Profile to link a PDF stored in Drive.

## Alternative host: Hatchable
hatchable.com hosts AI-built apps for free, with Postgres, sign-in and custom domains. It's worth it if this grows into an app, for example with a blog, a private admin page or analytics. For a resume, Sheets + GitHub Pages has fewer moving parts.
