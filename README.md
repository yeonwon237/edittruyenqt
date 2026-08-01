# edittruyenqt

A web app for editing/translating Chinese web-novel QT-convert text into fluent Vietnamese. Frontend is React + Vite, backend is Supabase (auth + Postgres).

## Setup

1. Clone the repository.
2. Install dependencies: `npm install`.
3. Create `.env.local` in the project root:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

Get these from your Supabase project's Dashboard → Project Settings → API.

4. Run the schema in `supabase/schema.sql` once, in your Supabase project's SQL Editor, to create the tables/policies the app expects.

## Run Locally

```bash
npm run dev
```

Open the local URL printed by Vite.

## Deploy

Deployed on Vercel, auto-deploying from the `main` branch. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under Vercel → Project Settings → Environment Variables.
