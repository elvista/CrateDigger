# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SpotDownload is a self-hosted web app that monitors Spotify playlists and automatically downloads new tracks. Python FastAPI backend + React/Vite frontend, SQLite database, real-time SSE updates.

## Development Commands

### Backend (run from `backend/`)
```bash
source venv/bin/activate
uvicorn main:app --reload                # Dev server on :8000
pytest tests/ -v                         # Run tests
pytest tests/test_file.py::test_name -v  # Single test
ruff check .                             # Lint
ruff format .                            # Format
alembic upgrade head                     # Apply migrations
alembic revision --autogenerate -m "msg" # Create migration
```

### Frontend (run from `frontend/`)
```bash
npm run dev          # Dev server on :5173 (proxies /api → :8000)
npm run test         # Watch mode tests (vitest)
npm run test:run     # Single test run
npm run lint         # ESLint check
npm run lint:fix     # ESLint auto-fix
npm run build        # Production build
```

### Pre-commit hooks
```bash
pre-commit run --all-files   # Runs ruff (backend) + eslint (frontend)
```

## Architecture

### Backend (FastAPI, async)
- **Entry point**: `backend/main.py` — app init, lifespan (DB init, APScheduler start), CORS, router registration
- **3-layer pattern**: `routers/` (HTTP handlers) → `services/` (business logic) → `models.py` + `database.py` (data)
- **Routers**: playlists, downloads, monitor, settings, auth, export_import — all under `/api` prefix
- **Key services**:
  - `spotify.py` — Spotify API via spotipy, playlist fetching, OAuth token management, archive playlist ops
  - `downloader.py` — yt-dlp search + download, ID3 tagging via mutagen
  - `monitor.py` — background playlist change detection (delegates to `sync_ops.py`)
  - `sync_ops.py` — shared track sync logic (diff stored vs. Spotify, mark new/removed)
- **Background jobs**: APScheduler runs `check_all()` every N minutes (configurable)
- **Concurrency**: Downloads use `asyncio.Semaphore(3)` for parallelism; Spotify calls offloaded via `asyncio.to_thread`
- **Config**: `config.py` uses pydantic-settings, loads from `.env`
- **Security**: `security.py` — optional Fernet encryption for stored Spotify tokens

### Frontend (React 18 + Vite + TailwindCSS)
- **Root**: `App.jsx` manages global state (playlists, downloads, settings)
- **API client**: `api/client.js` — centralized fetch wrapper for all endpoints
- **Real-time**: `hooks/useSSE.js` — SSE hook for download progress and monitor notifications
- **Components**: PlaylistInput, PlaylistMonitor, TrackList, TrackRow, DownloadProgress, SettingsModal, Layout, ErrorBoundary, Icons
- **Styling**: TailwindCSS with custom Spotify color palette (defined in `tailwind.config.js`)

### Communication
- REST API for CRUD operations
- SSE streams at `/api/downloads/progress` and `/api/monitor/notifications` for real-time updates
- Vite dev proxy forwards `/api` requests to backend

### Database (SQLite + SQLAlchemy + Alembic)
- Models: **Playlist** (has many Tracks), **Track**, **AppSetting** (key-value for config/tokens)
- Migrations in `backend/alembic/`
- Uses `selectinload()` for eager loading to avoid N+1 queries
- Progress/notification stores use bounded `collections.deque(maxlen=200)`

## Environment Variables

Required in `.env` (see `.env.example`):
- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI`

Optional:
- `DOWNLOAD_PATH` (default: `~/Music/SpotDownload`)
- `MONITOR_INTERVAL_MINUTES` (default: 30)
- `ENCRYPTION_KEY` (enables token encryption at rest)

## Code Style

- **Python**: ruff with line-length 100, target Python 3.11 (see `backend/ruff.toml`)
- **JavaScript**: ESLint with React/hooks plugins (see `frontend/eslint.config.js`)
- **CSS**: TailwindCSS utility classes, dark theme default
