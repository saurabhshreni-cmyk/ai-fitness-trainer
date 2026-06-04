# AI Fitness Trainer

![AI Fitness Trainer HUD](https://img.shields.io/badge/Live%20Demo-Vercel-00ffc8?style=for-the-badge&logo=vercel)
![Backend](https://img.shields.io/badge/Backend%20API-Render-46E3B7?style=for-the-badge&logo=render)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)
![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=for-the-badge&logo=python)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)

Real-time AI-powered workout tracker that runs **entirely in your browser**. Detects your body pose via webcam, counts reps with a bulletproof state machine, scores your form, and gives live coaching cues — no app install required.

---

## Feature Highlights

| | |
|---|---|
| 🤖 **MediaPipe Pose** | 33-landmark 3D skeleton detection at 30 FPS |
| 🏋️ **9 Exercises** | Bicep Curl, Squat, Push-up, Shoulder Press, Lateral Raise, Lunge, Front Raise, Deadlift, Tricep Extension |
| 📊 **Kinematics Engine** | EMA smoothing · angular velocity · ROM tracking · tempo · fatigue index · symmetry score |
| 💯 **Form Score** | 0–100 per rep based on ROM, tempo, symmetry, and posture |
| 🔊 **Voice Coaching** | Spoken rep counts ("One, Two...") + cues ("Great form!", "Watch your form") |
| 🎨 **Cyberpunk HUD** | Neon skeleton overlay · color-coded joints · motion trail · real-time stats panel |
| 📈 **Analytics** | History page with Recharts: reps over time, form score trend, exercise distribution, personal records |
| 💾 **Triple-save** | localStorage → backend API → auto-download JSON fallback |
| 🔄 **3-layer CDN** | MediaPipe loads from jsdelivr → unpkg fallback |
| 📷 **Camera failsafe** | 1280×720 → 640×480 → minimal → manual counting mode |
| 🛡️ **Error Boundaries** | App-level · Pose-level · Chart-level — no single crash takes down the app |
| 📱 **PWA** | Installable, service worker, offline-capable shell |

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 18 + Vite | UI framework |
| Routing | React Router v6 | History / Settings pages |
| Pose Estimation | MediaPipe Pose | 33-landmark skeleton at 30 FPS |
| Visualization | Canvas API + Recharts | HUD overlay + analytics charts |
| State | React hooks + useRef | Zero-lag rep counting |
| Backend | FastAPI + SQLAlchemy | REST API + SQLite persistence |
| Rate Limiting | slowapi | 100 req/min per IP |
| Deployment (FE) | Vercel | Global CDN + COOP/COEP headers |
| Deployment (BE) | Render | Free-tier Python web service |

---

## Try It Live

> **Frontend:** Deploy via `vercel --prod` inside `frontend-react/`
>
> **Backend:** Follow the Render manual steps below
>
> ⚠️ Render free tier spins down after 15 min of inactivity — first request after sleep takes ~30 s. The app works fully offline without the backend (localStorage-first).

---

## Run Locally

### Frontend (React + Vite)

```bash
# 1. Enter frontend directory
cd frontend-react

# 2. Install dependencies
npm install

# 3. Copy and edit env (optional — backend is not required)
cp .env.example .env
# Set VITE_BACKEND_URL=http://localhost:8000 if running backend

# 4. Start dev server
npm run dev

# 5. Open http://localhost:5173
```

### Backend (FastAPI)

```bash
# 1. (Recommended) Create a virtual environment
python -m venv .venv && source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Copy env file
cp .env.example .env

# 4. Start server (auto-creates SQLite DB on first run)
uvicorn backend:app --reload --host 0.0.0.0 --port 8000

# 5. API docs available at http://localhost:8000/docs
```

### Full Stack (both running)

```bash
# Terminal 1 — Backend
uvicorn backend:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend-react && npm run dev
```

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | API info |
| `/ping` | GET | Liveness check |
| `/health` | GET | Status + DB check + uptime |
| `/analyze` | POST | Real-time pose angle + rep counting |
| `/reset` | POST | Reset in-memory rep counter |
| `/sessions` | POST | Save a completed workout session |
| `/sessions` | GET | List sessions (paginated, filterable) |
| `/sessions/{id}` | GET | Full session with rep log |
| `/sessions/{id}` | DELETE | Delete single session |
| `/sessions` | DELETE | Delete all (requires `X-Confirm-Delete: true`) |
| `/analytics/summary` | GET | Totals, streaks, personal records |
| `/analytics/trends` | GET | Daily reps + form score for charting |
| `/export/csv?session_id=N` | GET | Download session as CSV |
| `/export/json?session_id=N` | GET | Download session as JSON |
| `/export/all` | GET | Download ZIP of all sessions |

---

## Deploy to Vercel (Frontend)

```bash
cd frontend-react
npm install -g vercel   # if not installed
vercel --prod
```

The included `vercel.json` configures:
- SPA rewrites (`/` for all routes)
- `Cross-Origin-Opener-Policy: same-origin` (required for MediaPipe WASM)
- `Cross-Origin-Embedder-Policy: require-corp` (required for MediaPipe WASM)

---

## Deploy to Render (Backend) — Manual Steps

```
STEP 1:  Go to https://render.com → Sign up free with GitHub
STEP 2:  Click "New +" → "Web Service"
STEP 3:  Connect your GitHub account (if not already connected)
STEP 4:  Search for "ai-fitness-trainer" → click Connect
STEP 5:  Fill in settings:
           Name:          ai-fitness-trainer-backend
           Region:        Singapore (closest to India)
           Branch:        main
           Runtime:       Python 3
           Build Command: pip install -r requirements.txt
           Start Command: uvicorn backend:app --host 0.0.0.0 --port $PORT
           Instance Type: Free
STEP 6:  Under "Environment Variables" add:
           FRONTEND_URL = [your Vercel URL from above]
           DEBUG        = false
STEP 7:  Click "Create Web Service"
STEP 8:  Wait ~3 minutes for first deploy
STEP 9:  Copy the .onrender.com URL
STEP 10: Go to Vercel → your project → Settings → Environment Variables → add:
           VITE_BACKEND_URL = [your .onrender.com URL]
STEP 11: Go to Vercel → Deployments → Redeploy latest
```

### Verify deployment

```bash
python verify_deployment.py \
  --frontend https://your-app.vercel.app \
  --backend  https://your-api.onrender.com
```

---

## Known Limitations

- **Render free tier** spins down after 15 min of inactivity; first request after sleep takes ~30 s
- **SQLite on Render** is ephemeral — workout data resets on redeploy (localStorage always persists in browser)
- **MediaPipe runs on CPU** in the browser — mobile devices with slow CPUs may lag at 30 FPS
- **Bilateral symmetry** requires both sides of the body to be visible simultaneously
- **VBT (velocity-based training) 1RM estimate** uses a fixed 50 kg working load as baseline

---

## Roadmap

- [ ] Multi-user accounts with JWT auth
- [ ] GPU-accelerated pose via WebGL backend
- [ ] Real-time rep video recording + playback
- [ ] Coach mode: second device views athlete's form remotely
- [ ] Custom exercise builder (define your own angle thresholds)
- [ ] PostgreSQL support for persistent Render deployments
- [ ] Mobile app (React Native + MediaPipe)

---

## Contributing

1. Fork the repo
2. Create a feature branch off `main`: `git checkout -b feat/my-feature`
3. Commit changes: `git commit -m "feat: add my feature"`
4. Push: `git push origin feat/my-feature`
5. Open a Pull Request targeting `main`

> Active development branch: **`fitness-trainer-full-build-HtXd3`**

Please run `npm run lint` and `npm run build` (zero errors) before submitting.

---

## License

MIT — see [LICENSE](LICENSE) for details.
