import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Layout from './components/Layout';
import PlaylistInput from './components/PlaylistInput';
import TrackList from './components/TrackList';
import PlaylistMonitor from './components/PlaylistMonitor';
import DownloadProgress from './components/DownloadProgress';
import SettingsModal from './components/SettingsModal';
import { CloseIcon, MusicIcon } from './components/Icons';
import { api } from './api/client';
import { useSSE } from './hooks/useSSE';

export default function App() {
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);
  const [downloads, setDownloads] = useState([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Ref to track selected playlist ID for use in effects without stale closure
  const selectedPlaylistIdRef = useRef(null);
  selectedPlaylistIdRef.current = selectedPlaylist?.id ?? null;

  // SSE for download progress
  const { data: progressData } = useSSE('/api/downloads/progress', isDownloading);

  const fetchPlaylist = useCallback(async (id) => {
    try {
      const data = await api.getPlaylist(id);
      setSelectedPlaylist(data);
      setPlaylists(prev => prev.map(p => p.id === id ? data : p));
    } catch {
      // ignore
    }
  }, []);

  const loadPlaylists = useCallback(async () => {
    try {
      const data = await api.getPlaylists();
      setPlaylists(data);
    } catch {
      // API might not be running yet
    }
  }, []);

  useEffect(() => {
    if (progressData) {
      setDownloads(progressData);
      const allDone = progressData.every(d => d.status === 'completed' || d.status === 'failed');
      if (allDone && progressData.length > 0) {
        setIsDownloading(false);
        const currentId = selectedPlaylistIdRef.current;
        if (currentId) fetchPlaylist(currentId);
      }
    }
  }, [progressData, fetchPlaylist]);

  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

  const handleAddPlaylist = useCallback(async (url) => {
    setLoading(true);
    setError(null);
    try {
      const playlist = await api.addPlaylist(url);
      setPlaylists(prev => [playlist, ...prev]);
      setSelectedPlaylist(playlist);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    const id = selectedPlaylistIdRef.current;
    if (!id) return;
    setRefreshing(true);
    try {
      const updated = await api.refreshPlaylist(id);
      setSelectedPlaylist(updated);
      setPlaylists(prev => prev.map(p => p.id === updated.id ? updated : p));
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleDownload = useCallback(async (trackIds) => {
    try {
      await api.downloadTracks(trackIds);
      setIsDownloading(true);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const handleDownloadAll = useCallback(async () => {
    const id = selectedPlaylistIdRef.current;
    if (!id) return;
    try {
      await api.downloadPlaylist(id);
      setIsDownloading(true);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const handleDownloadNew = useCallback(async () => {
    if (!selectedPlaylist) return;
    const newTrackIds = selectedPlaylist.tracks
      .filter(t => t.is_new)
      .map(t => t.id);
    if (newTrackIds.length > 0) {
      try {
        await api.downloadTracks(newTrackIds);
        setIsDownloading(true);
      } catch (err) {
        setError(err.message);
      }
    }
  }, [selectedPlaylist]);

  const handleCheckAll = useCallback(async () => {
    setChecking(true);
    try {
      await api.checkAll();
      await loadPlaylists();
      const currentId = selectedPlaylistIdRef.current;
      if (currentId) await fetchPlaylist(currentId);
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  }, [loadPlaylists, fetchPlaylist]);

  const handleSelectPlaylist = useCallback((playlist) => {
    setSelectedPlaylist(playlist);
  }, []);

  const handleClearProgress = useCallback(async () => {
    try {
      await api.clearProgress();
      setDownloads([]);
      setIsDownloading(false);
    } catch {
      // ignore
    }
  }, []);

  const handleOpenSettings = useCallback(() => setSettingsOpen(true), []);
  const handleCloseSettings = useCallback(() => setSettingsOpen(false), []);
  const handleClearError = useCallback(() => setError(null), []);

  // Memoized download status map
  const downloadStatus = useMemo(() => {
    const status = {};
    downloads.forEach(d => { status[d.id] = d; });
    return status;
  }, [downloads]);

  return (
    <Layout onOpenSettings={handleOpenSettings}>
      <SettingsModal isOpen={settingsOpen} onClose={handleCloseSettings} />

      <PlaylistInput onSubmit={handleAddPlaylist} loading={loading} />

      {error && (
        <div className="mt-4 p-4 bg-red-900/30 border border-red-500/30 rounded-xl flex items-center justify-between animate-fade-in">
          <p className="text-sm text-red-300">{error}</p>
          <button onClick={handleClearError} className="text-red-300 hover:text-white">
            <CloseIcon />
          </button>
        </div>
      )}

      <PlaylistMonitor
        playlists={playlists}
        onSelect={handleSelectPlaylist}
        onCheckAll={handleCheckAll}
        selectedId={selectedPlaylist?.id}
        checking={checking}
      />

      <TrackList
        playlist={selectedPlaylist}
        onDownload={handleDownload}
        onDownloadAll={handleDownloadAll}
        onDownloadNew={handleDownloadNew}
        onRefresh={handleRefresh}
        downloadStatus={downloadStatus}
        refreshing={refreshing}
      />

      {!selectedPlaylist && playlists.length === 0 && (
        <div className="mt-16 text-center animate-fade-in">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-spotify-mid-gray flex items-center justify-center">
            <MusicIcon className="w-10 h-10 text-spotify-light-gray" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">No playlists yet</h3>
          <p className="text-spotify-light-gray max-w-md mx-auto">
            Paste a Spotify playlist URL above to start monitoring and downloading your favorite music.
          </p>
        </div>
      )}

      <DownloadProgress downloads={downloads} onClear={handleClearProgress} />
      {downloads.length > 0 && <div className="h-40" />}
    </Layout>
  );
}
