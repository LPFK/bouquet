# Bouquet 2.5D

Real-time procedural bouquet rendered in the browser with Three.js: parallax camera,
depth of field, sway, bloom and film grain. No external assets.

```bash
npm install
npm run dev
```

Click to grow a new bouquet; use the bar at the bottom for single flowers and themes.
Try `?seed=42`, `?theme=automne`, `?solo=rose`, `?debug`, `?quality=low`, `?still`.

The heart/lock button at the right of the bar opens a password-protected page. Its letter is
stored encrypted (`src/secret/letter.enc.json`); the plain text is not part of the repository.
To change the letter, edit the local `A_Letter_to_Bibi.txt` and run
`node scripts/encrypt-letter.mjs` (it asks for the password; nothing stores it).

## Deploy

The site is published on GitHub Pages by `.github/workflows/deploy.yml` at every push to
`main`. One-time setup in the GitHub repository: Settings > Pages > Build and deployment >
Source: **GitHub Actions**. The workflow sets `SITE_URL` so share previews (`og:image`)
use absolute URLs.

See `NOTES.md` for architecture, conventions and roadmap.

---

Note: `NOTES.md` is written as a Claude Code project file. To use it with Claude Code,
rename it back to `CLAUDE.md` (and add `CLAUDE.md` to `.gitignore` if it should stay local).
