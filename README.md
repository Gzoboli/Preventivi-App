# Preventivi App

AI quoting tool for Italian electricians. See `SPEC.md` (product) and `CLAUDE.md` (rules and architecture).

## Local development

```bash
npm install
cp .env.example .env.local   # fill in Supabase URL + publishable key
npm run dev
```

`npm run build` typechecks and builds to `dist/`. Deployed on Vercel from `main` (`vercel.json` rewrites all routes to `index.html`).
