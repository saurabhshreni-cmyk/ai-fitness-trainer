# AI Fitness Trainer: 3D Biomechanics & Kinematics Engine 🧠🏋️

[Insert glowing HUD GIF / Screenshots here]

A real-time fitness intelligence system that performs local 3D pose analysis, rep counting, and form coaching directly in the browser for lower latency and smoother feedback.

## 🧩 Technical Problem
Traditional webcam workout apps often struggle with:
- Noisy pose landmarks and jitter between frames
- Inconsistent rep detection from raw joint-angle changes
- Delayed coaching when real-time analysis depends on backend round trips

This project tackles those issues with local 3D pose estimation logic, smoothed joint-angle math, and per-frame kinematics tracking to provide stable and actionable feedback.

## 🚀 Key Features
- **Kinematics Engine**: 3D joint-angle analysis, EMA smoothing, angular velocity, tempo tracking, and fatigue-aware rep insights.
- **Cyberpunk HUD**: Live canvas overlay with dynamic skeleton coloring and glowing trajectory trails for immediate visual feedback.
- **Dynamic Auto-calibration**: First-rep calibration to adapt ROM thresholds to each user’s movement mechanics.

## 🛠 Tech Stack
- **Frontend**: React + Vite
- **Pose Estimation**: MediaPipe Pose
- **Visualization**: Recharts + Canvas HUD
- **Core Analytics**: Local biomechanics and rep-state engine in JavaScript

## 📊 Data Science Potential
The app logs structured time-series workout data and supports CSV export (`timestamp`, `smoothedAngle`, `velocity`, `stage`), enabling:
- Post-session biomechanics analytics
- Comparative movement profiling over time
- Future ML training workflows for advanced form scoring and coaching models

## ⚙️ Frontend-First Local Setup

### Prerequisites
- Node.js 18+

### Run the frontend
```bash
cd frontend-react
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Optional backend (non-real-time operations)
Backend services are optional for non-real-time workflows such as persistence, workout summaries, or historical stats:
```bash
uvicorn backend:app --reload --host 0.0.0.0 --port 8000
```
