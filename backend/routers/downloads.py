import asyncio
import json
import os
from collections import deque

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse

from database import get_db, SessionLocal
from models import Track, AppSetting
from config import DEFAULT_DOWNLOAD_PATH
from services.downloader import DownloaderService

router = APIRouter(tags=["downloads"])

downloader = DownloaderService()

# Bounded progress store (max 200 entries)
MAX_PROGRESS_ENTRIES = 200
download_progress: dict[str, dict] = {}
_progress_order: deque[str] = deque(maxlen=MAX_PROGRESS_ENTRIES)

# Max concurrent downloads
CONCURRENT_DOWNLOADS = 3


class DownloadRequest(BaseModel):
    track_ids: list[int] = []
    playlist_id: int | None = None


def _resolve_download_path() -> str:
    """Resolve download path from DB once per batch."""
    db = SessionLocal()
    try:
        row = db.query(AppSetting).filter(AppSetting.key == "download_path").first()
        path = row.value if row else DEFAULT_DOWNLOAD_PATH
    finally:
        db.close()
    os.makedirs(path, exist_ok=True)
    return path


@router.post("/downloads")
async def start_download(body: DownloadRequest, db: Session = Depends(get_db)):
    if body.playlist_id:
        tracks = db.query(Track).filter(Track.playlist_id == body.playlist_id).all()
    elif body.track_ids:
        tracks = db.query(Track).filter(Track.id.in_(body.track_ids)).all()
    else:
        raise HTTPException(status_code=400, detail="Provide track_ids or playlist_id")

    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks found")

    # Extract plain data before request ends (don't pass ORM objects to background)
    track_data = [
        {
            "id": t.id,
            "spotify_url": t.spotify_url,
            "name": t.name,
            "artist": t.artist,
        }
        for t in tracks
    ]
    track_ids = [t.id for t in tracks]

    # Resolve download path once for the entire batch
    download_path = _resolve_download_path()

    # Launch download in background with its own DB session
    asyncio.create_task(
        _run_downloads(track_data, track_ids, download_path)
    )

    return {"detail": f"Started downloading {len(tracks)} tracks", "count": len(tracks)}


async def _download_one(
    t: dict, download_path: str, sem: asyncio.Semaphore
):
    """Download a single track with semaphore-limited concurrency."""
    track_id = str(t["id"])
    download_progress[track_id] = {
        "id": t["id"],
        "name": t["name"],
        "artist": t["artist"],
        "status": "downloading",
        "progress": 0,
    }
    _progress_order.append(track_id)

    async with sem:
        try:
            success = await downloader.download_track(
                name=t["name"],
                artist=t["artist"],
                download_path=download_path,
                spotify_url=t["spotify_url"],
            )
            download_progress[track_id]["status"] = "completed" if success else "failed"
            download_progress[track_id]["progress"] = 100 if success else 0
            return t["id"] if success else None
        except Exception as e:
            download_progress[track_id]["status"] = "failed"
            download_progress[track_id]["error"] = str(e)
            return None


async def _run_downloads(
    track_data: list[dict], track_ids: list[int], download_path: str
):
    """Run concurrent downloads with own DB session."""
    sem = asyncio.Semaphore(CONCURRENT_DOWNLOADS)

    # Run all downloads concurrently
    results = await asyncio.gather(
        *[_download_one(t, download_path, sem) for t in track_data]
    )

    # Update DB with successful downloads using a fresh session
    successful_ids = [r for r in results if r is not None]
    if successful_ids:
        db = SessionLocal()
        try:
            db.query(Track).filter(Track.id.in_(successful_ids)).update(
                {Track.is_downloaded: True}, synchronize_session="fetch"
            )
            db.commit()
        finally:
            db.close()

    # Evict old entries if over limit
    while len(download_progress) > MAX_PROGRESS_ENTRIES:
        oldest = _progress_order.popleft() if _progress_order else None
        if oldest and oldest in download_progress:
            del download_progress[oldest]


@router.get("/downloads/progress")
async def download_progress_stream():
    async def event_generator():
        while True:
            if download_progress:
                yield {
                    "event": "progress",
                    "data": json.dumps(list(download_progress.values())),
                }
            await asyncio.sleep(1)

    return EventSourceResponse(event_generator())


@router.delete("/downloads/progress")
def clear_progress():
    download_progress.clear()
    _progress_order.clear()
    return {"detail": "Progress cleared"}
