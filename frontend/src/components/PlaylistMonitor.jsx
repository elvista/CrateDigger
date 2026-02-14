import React from 'react';
import { timeAgo } from '../utils/format';
import { RefreshIcon, MusicIcon } from './Icons';

export default React.memo(function PlaylistMonitor({ playlists, onSelect, onCheckAll, selectedId, checking }) {
  if (!playlists || playlists.length === 0) return null;

  return (
    <div className="animate-fade-in mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Monitored Playlists</h2>
        <button
          onClick={onCheckAll}
          disabled={checking}
          className="text-sm text-spotify-green hover:text-spotify-green-dark transition-colors flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshIcon className="w-4 h-4" spinning={checking} />
          {checking ? 'Checking...' : 'Check All'}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {playlists.map((pl) => {
          const newCount = pl.tracks?.filter(t => t.is_new).length || 0;
          const isSelected = selectedId === pl.id;

          return (
            <button
              key={pl.id}
              onClick={() => onSelect(pl)}
              className={`text-left p-4 rounded-xl transition-all ${
                isSelected
                  ? 'bg-spotify-mid-gray ring-1 ring-spotify-green'
                  : 'bg-spotify-dark-gray hover:bg-spotify-mid-gray'
              }`}
            >
              <div className="flex items-start gap-3">
                {pl.image_url ? (
                  <img src={pl.image_url} alt={pl.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-spotify-mid-gray flex items-center justify-center flex-shrink-0">
                    <MusicIcon className="w-6 h-6 text-spotify-light-gray" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{pl.name}</p>
                  <p className="text-xs text-spotify-light-gray mt-0.5">{pl.track_count} tracks</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs text-spotify-light-gray">
                      Checked {timeAgo(pl.last_checked)}
                    </span>
                    {newCount > 0 && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold bg-spotify-green text-black rounded">
                        {newCount} NEW
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
});
