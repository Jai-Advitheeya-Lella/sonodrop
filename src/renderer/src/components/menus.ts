import type { Track } from '@shared/types'
import { artistId, useLibrary, type Album } from '@/stores/library'
import { usePlayer } from '@/stores/player'
import { useUi, type MenuItem } from '@/stores/ui'
import { useUser } from '@/stores/user'

/** "Add to playlist" submenu for any set of tracks. */
function playlistItems(ids: string[]): MenuItem[] {
  const { playlists, createPlaylist, addToPlaylist } = useUser.getState()
  const { toast, go } = useUi.getState()
  return [
    {
      label: 'New playlist',
      icon: 'plus',
      action: () => go({ name: 'playlist', id: createPlaylist(ids).id })
    },
    ...(playlists.length ? [{ label: '', separator: true }] : []),
    ...playlists.map((p): MenuItem => ({
      label: p.name,
      icon: 'playlist',
      action: () => {
        addToPlaylist(p.id, ids)
        toast(`Added to ${p.name}`)
      }
    }))
  ]
}

export function trackMenu(track: Track, playlist?: { id: string; index: number }): MenuItem[] {
  const player = usePlayer.getState()
  const user = useUser.getState()
  const { go, toast } = useUi.getState()
  const liked = user.liked.includes(track.id)
  return [
    { label: 'Play next', icon: 'next', action: () => (player.playNext([track.id]), toast('Playing next')) },
    { label: 'Add to queue', icon: 'queue', action: () => (player.addToQueue([track.id]), toast('Added to queue')) },
    { label: '', separator: true },
    { label: liked ? 'Remove from Liked' : 'Like', icon: 'heart', action: () => user.toggleLike(track.id) },
    { label: 'Add to playlist', icon: 'playlist', children: playlistItems([track.id]) },
    ...(playlist
      ? [{ label: 'Remove from this playlist', icon: 'trash', action: () => user.removeFromPlaylist(playlist.id, playlist.index) } satisfies MenuItem]
      : []),
    { label: '', separator: true },
    { label: 'Go to album', icon: 'disc', action: () => go({ name: 'album', id: track.albumId }) },
    { label: 'Go to artist', icon: 'user', action: () => go({ name: 'artist', id: artistId(track.albumArtist) }) },
    { label: 'Show in file manager', icon: 'folder', action: () => window.sono.showInFolder(track.path) }
  ]
}

export function albumMenu(album: Album): MenuItem[] {
  const player = usePlayer.getState()
  const { go, toast } = useUi.getState()
  return [
    { label: 'Play', icon: 'play', action: () => player.playTracks(album.trackIds) },
    { label: 'Shuffle', icon: 'shuffle', action: () => player.shufflePlay(album.trackIds) },
    { label: 'Play next', icon: 'next', action: () => (player.playNext(album.trackIds), toast('Playing next')) },
    { label: 'Add to queue', icon: 'queue', action: () => (player.addToQueue(album.trackIds), toast('Added to queue')) },
    { label: 'Add to playlist', icon: 'playlist', children: playlistItems(album.trackIds) },
    { label: '', separator: true },
    { label: 'Go to artist', icon: 'user', action: () => go({ name: 'artist', id: artistId(album.artist) }) }
  ]
}

export const allTrackIds = (): string[] => useLibrary.getState().tracks.map((t) => t.id)
