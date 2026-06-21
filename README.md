kshitij_shares — Static Markdown Book

What this is

How to run (recommended)
1. Open a terminal in this folder.
2. Run a local static server, for example:

```bash
python3 -m http.server 8000
```

3. Open http://localhost:8000 in your browser.

Notes
- Add more chapters by creating `chapters/chapter-N.md` and updating `script.js` `chapters` array.
- For better performance and pre-rendering, you can use a static site generator (e.g., Eleventy, Hugo) to convert MD to HTML.

Files
- `index.html`: main UI
- `style.css`: styles
- `script.js`: client-side loader
- `chapters/`: markdown files (chapter-1.md ... chapter-5.md)

Want me to:
- Add an automated build script to scan `chapters/` and auto-generate the `chapters` array?
- Or convert this to an Eleventy/Hugo project that pre-renders pages?

Cloudflare Pages deployment
--------------------------
This project can be deployed to Cloudflare Pages from GitHub using the included GitHub Actions workflow.

Steps to deploy:
1. Create a GitHub repository and push this project to `main`.
2. In your Cloudflare dashboard, create a Pages project (you can name it anything) or note an existing Pages project name.
3. Create a Cloudflare API Token with permissions for Pages (Pages:Edit) and Accounts:Read. Record the token and your Account ID.
4. In your GitHub repository, go to Settings → Secrets and variables → Actions → New repository secret and add:
	- `CLOUDFLARE_API_TOKEN` = your API token
	- `CLOUDFLARE_ACCOUNT_ID` = your Cloudflare account ID
5. Edit `.github/workflows/cloudflare-pages.yml` and replace the `projectName` value with the Pages project name created in step 2.
6. Push to `main`. The action `Deploy to Cloudflare Pages` will run and publish the site.

Notes:
- This workflow assumes the static site is served from the repository root (no build step). If you add a build step, update the `directory` and add a build job prior to deployment.
- Alternatively you can connect the GitHub repo directly in the Cloudflare Pages UI and skip the Actions workflow — the UI guides you through linking and configuring the build settings.