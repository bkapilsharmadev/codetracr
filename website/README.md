# CodeTracr website

Static landing page for [codetracr.com](https://codetracr.com). Built with Astro + Tailwind, same visual language as the RankTrix marketing site.

## Local

```powershell
cd website
npm install
npm run dev
```

Open http://localhost:4321/

```powershell
npm run build
npm run preview
```

## Deploy to Cloudflare Pages

The domain `codetracr.com` is already on Cloudflare. Connect this repo as a Pages project and attach the domain.

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Select `bkapilsharmadev/codetracr`
3. Build settings:

| Field | Value |
| --- | --- |
| Root directory | `website` |
| Framework preset | Astro |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Environment variable | `NODE_VERSION` = `22` |

4. After the first deploy: **Custom domains** → add `codetracr.com` and `www.codetracr.com`

Cloudflare will rebuild on every push to the production branch.

### Manual deploy

From `website/` after `npm run build`:

```powershell
npx wrangler pages deploy dist --project-name=codetracr
```

## Email

`hello@codetracr.com` is linked on the page. Route it with Cloudflare Email Routing (Email → Email Routing → destination address).
