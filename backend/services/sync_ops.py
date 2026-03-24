"""Shared sync operations for playlist refresh/change detection."""

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from models import Playlist, Track


def dedupe_spotify_tracks(tracks: list[dict]) -> list[dict]:
    """Spotify may return the same track id twice in one playlist; DB enforces one row per id."""
    seen: set[str] = set()
    out: list[dict] = []
    for t in tracks:
        tid = t["id"]
        if tid in seen:
            continue
        seen.add(tid)
        out.append(t)
    return out


def refresh_playlist_tracks(playlist: Playlist, spotify_data: dict, db: Session) -> dict:
    """
    Compare Spotify data against stored tracks.
    Adds new tracks, removes deleted ones, returns change summary.
    """
    tracks = dedupe_spotify_tracks(spotify_data["tracks"])
    existing_ids = {t.spotify_id for t in playlist.tracks}
    new_track_ids = {t["id"] for t in tracks}

    added = [t for t in tracks if t["id"] not in existing_ids]
    removed_ids = existing_ids - new_track_ids

    # Update playlist metadata
    playlist.name = spotify_data["name"]
    playlist.description = spotify_data.get("description", "")
    playlist.owner = spotify_data["owner"]
    playlist.image_url = spotify_data.get("image_url", "")
    playlist.track_count = len(tracks)
    playlist.last_checked = datetime.now(UTC)

    # Mark all existing tracks as not new
    for track in playlist.tracks:
        track.is_new = False

    # Remove tracks no longer in playlist
    for track in list(playlist.tracks):
        if track.spotify_id in removed_ids:
            db.delete(track)

    # Add new tracks
    for t in added:
        track = Track(
            playlist_id=playlist.id,
            spotify_id=t["id"],
            name=t["name"],
            artist=t["artist"],
            album=t["album"],
            genre=t.get("genre", ""),
            duration_ms=t["duration_ms"],
            image_url=t.get("image_url", ""),
            spotify_url=t.get("spotify_url", ""),
            is_new=True,
        )
        db.add(track)

    db.commit()

    return {
        "playlist_id": playlist.id,
        "playlist_name": playlist.name,
        "added": len(added),
        "removed": len(removed_ids),
        "total": len(tracks),
    }
