# Deployment Guide

This repo can be deployed with a fully free hobby setup, with one important caveat:

- `frontend` on Vercel Hobby
- `api` on Render free web service
- Postgres + Storage on Supabase Free
- Redis on Upstash Free
- `worker` cannot run as a truly always-on free Render worker, because Render's free tier is for web/static services and free web services sleep on idle

## Recommended free setup

Use this if your goal is to demo the project without paying:

1. Deploy `api` to Render as a Docker web service.
2. Deploy `frontend` to Vercel with `frontend` as the root directory.
3. Keep Supabase and Upstash on their free plans.
4. Run the C++ worker locally when you want jobs to actually complete.

This gives you a free hosted UI and API, and the queue starts processing whenever your local worker is running.

## API on Render

Create a new Web Service on Render and point it at the `api` folder.

- Runtime: Docker
- Dockerfile path: `api/Dockerfile`
- Auto deploy: on

Set these environment variables in Render:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_BUCKET`
- `MAX_UPLOAD_BYTES`
- `DATABASE_URL`
- `REDIS_URL`

After deploy, verify:

- `https://your-api.onrender.com/health`

## Frontend on Vercel

Create a new Vercel project with:

- Root Directory: `frontend`
- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`

Set this environment variable in Vercel:

- `VITE_API_BASE_URL=https://your-api.onrender.com`

The included `frontend/vercel.json` rewrites all routes to `index.html` so React Router works on refresh.

## Worker reality check

Your current worker is a long-running process that polls Redis forever. That architecture does not map cleanly to a completely free always-on deployment:

- Render free web services spin down after 15 minutes without inbound traffic
- Render free docs do not list background workers as a free instance type

So you have two practical options:

1. Free demo mode: host frontend + API, run worker locally
2. Full cloud mode: pay for a real always-on worker service

## If you want truly free cloud-only

That would require changing the architecture so jobs are processed on demand instead of by a permanent worker loop. The cleanest path would be rewriting the worker logic into the API or a serverless function flow.
