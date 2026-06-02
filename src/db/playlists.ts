import { getDb } from "@/db/database";
import { normalizeName } from "@/utils/normalizeName";

/** Normalized key + display label for every user's default playlist. */
export const DEFAULT_PLAYLIST_KEY = "favorites";
export const DEFAULT_PLAYLIST_NAME = "Favorites";

export type PlaylistSummary = {
  name: string;
  trackCount: number;
};

export type PlaylistTrack = {
  id: number;
  name: string;
  title: string | null;
  artist: string | null;
  url: string | null;
};

type PlaylistRow = {
  id: number;
  name: string;
  display_name: string;
};

type TrackRow = {
  id: number;
  display_name: string;
  title: string | null;
  artist: string | null;
  url: string | null;
};

function assertUserId(userId: string): void {
  if (!/^\d{17,20}$/.test(userId)) {
    throw new Error("Invalid user ID.");
  }
}

function isDefaultPlaylist(rawName: string): boolean {
  return normalizeName(rawName) === DEFAULT_PLAYLIST_KEY;
}

/** Every user gets an empty **Favorites** playlist until they use other playlist features. */
export function ensureDefaultPlaylist(userId: string): void {
  assertUserId(userId);
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO playlists (user_id, name, display_name)
       VALUES (?, ?, ?)`,
    )
    .run(userId, DEFAULT_PLAYLIST_KEY, DEFAULT_PLAYLIST_NAME);
}

function prepareUserPlaylists(userId: string): void {
  assertUserId(userId);
  ensureDefaultPlaylist(userId);
}

function assertUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error("URL must be a valid http(s) link.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("URL must be a valid http(s) link.");
  }
}

function assertPlaybackTarget(data: {
  title?: string | null;
  artist?: string | null;
  url?: string | null;
}): void {
  if (!data.url?.trim() && !data.title?.trim()) {
    throw new Error("Provide a song URL or title.");
  }
}

function rowToTrack(row: TrackRow): PlaylistTrack {
  return {
    id: row.id,
    name: row.display_name,
    title: row.title,
    artist: row.artist,
    url: row.url,
  };
}

function getPlaylistRow(
  userId: string,
  rawPlaylistName: string,
): PlaylistRow | undefined {
  return getDb()
    .prepare(
      `SELECT id, name, display_name FROM playlists
       WHERE user_id = ? AND name = ?`,
    )
    .get(userId, normalizeName(rawPlaylistName)) as PlaylistRow | undefined;
}

export function createPlaylist(userId: string, playlistName: string): void {
  prepareUserPlaylists(userId);
  if (!playlistName.trim()) throw new Error("Playlist name is required.");

  const normalized = normalizeName(playlistName);
  const displayName = playlistName.trim();

  try {
    getDb()
      .prepare(
        `INSERT INTO playlists (user_id, name, display_name) VALUES (?, ?, ?)`,
      )
      .run(userId, normalized, displayName);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
    ) {
      throw new Error(`You already have a playlist named **${displayName}**.`);
    }
    throw error;
  }
}

export function deletePlaylist(userId: string, playlistName: string): boolean {
  prepareUserPlaylists(userId);
  if (!playlistName.trim()) throw new Error("Playlist name is required.");
  if (isDefaultPlaylist(playlistName)) {
    throw new Error(`The **${DEFAULT_PLAYLIST_NAME}** playlist can't be deleted.`);
  }

  const result = getDb()
    .prepare(`DELETE FROM playlists WHERE user_id = ? AND name = ?`)
    .run(userId, normalizeName(playlistName));
  return result.changes > 0;
}

export function renamePlaylist(
  userId: string,
  playlistName: string,
  newName: string,
): boolean {
  prepareUserPlaylists(userId);
  if (!playlistName.trim() || !newName.trim()) {
    throw new Error("Current and new playlist names are required.");
  }
  if (isDefaultPlaylist(playlistName)) {
    throw new Error(`The **${DEFAULT_PLAYLIST_NAME}** playlist can't be renamed.`);
  }

  const existing = getPlaylistRow(userId, playlistName);
  if (!existing) return false;

  const normalized = normalizeName(newName);
  const displayName = newName.trim();

  try {
    getDb()
      .prepare(
        `UPDATE playlists SET name = ?, display_name = ? WHERE id = ?`,
      )
      .run(normalized, displayName, existing.id);
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
    ) {
      throw new Error(`You already have a playlist named **${displayName}**.`);
    }
    throw error;
  }
}

export function listPlaylists(userId: string): PlaylistSummary[] {
  prepareUserPlaylists(userId);
  const rows = getDb()
    .prepare(
      `SELECT p.display_name, COUNT(t.id) AS track_count
       FROM playlists p
       LEFT JOIN playlist_tracks t ON t.playlist_id = p.id
       WHERE p.user_id = ?
       GROUP BY p.id
       ORDER BY p.display_name COLLATE NOCASE`,
    )
    .all(userId) as { display_name: string; track_count: number }[];

  return rows.map((row) => ({
    name: row.display_name,
    trackCount: row.track_count,
  }));
}

export function addTrackToPlaylist(
  userId: string,
  playlistName: string,
  trackName: string,
  data: { title?: string; artist?: string; url?: string },
): void {
  prepareUserPlaylists(userId);
  if (!playlistName.trim()) throw new Error("Playlist name is required.");
  if (!trackName.trim()) throw new Error("A short name is required for this track.");
  assertPlaybackTarget(data);

  const playlist = getPlaylistRow(userId, playlistName);
  if (!playlist) {
    throw new Error(`You don't have a playlist named **${playlistName.trim()}**.`);
  }

  const normalized = normalizeName(trackName);
  const displayName = trackName.trim();
  const url = data.url?.trim() || null;
  const title = data.title?.trim() || null;
  const artist = data.artist?.trim() || null;
  if (!url) {
    throw new Error("A track URL is required so playback can replay the same source.");
  }
  assertUrl(url);

  try {
    getDb()
      .prepare(
        `INSERT INTO playlist_tracks (playlist_id, name, display_name, title, artist, url)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(playlist.id, normalized, displayName, title, artist, url);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
    ) {
      throw new Error(
        `**${displayName}** is already on playlist **${playlist.display_name}**.`,
      );
    }
    throw error;
  }
}

export function removeTrackFromPlaylist(
  userId: string,
  playlistName: string,
  trackName: string,
): boolean {
  prepareUserPlaylists(userId);
  const playlist = getPlaylistRow(userId, playlistName);
  if (!playlist) return false;
  if (!trackName.trim()) throw new Error("Track name is required.");

  const result = getDb()
    .prepare(
      `DELETE FROM playlist_tracks WHERE playlist_id = ? AND name = ?`,
    )
    .run(playlist.id, normalizeName(trackName));
  return result.changes > 0;
}

export function updateTrackInPlaylist(
  userId: string,
  playlistName: string,
  trackName: string,
  updates: {
    newName?: string;
    title?: string;
    artist?: string;
    url?: string;
  },
): boolean {
  prepareUserPlaylists(userId);
  const playlist = getPlaylistRow(userId, playlistName);
  if (!playlist) return false;
  if (!trackName.trim()) throw new Error("Track name is required.");

  const hasField =
    updates.newName?.trim() ||
    updates.title !== undefined ||
    updates.artist !== undefined ||
    updates.url !== undefined;
  if (!hasField) {
    throw new Error("Provide a new name, title, artist, and/or URL to update.");
  }

  const existing = getDb()
    .prepare(
      `SELECT name, display_name, title, artist, url FROM playlist_tracks
       WHERE playlist_id = ? AND name = ?`,
    )
    .get(playlist.id, normalizeName(trackName)) as
    | {
        name: string;
        display_name: string;
        title: string | null;
        artist: string | null;
        url: string | null;
      }
    | undefined;
  if (!existing) return false;

  const nextNormalized = updates.newName?.trim()
    ? normalizeName(updates.newName)
    : existing.name;
  const nextDisplay = updates.newName?.trim() ?? existing.display_name;
  const nextTitle =
    updates.title !== undefined
      ? updates.title.trim() || null
      : existing.title;
  const nextArtist =
    updates.artist !== undefined
      ? updates.artist.trim() || null
      : existing.artist;
  const nextUrl =
    updates.url !== undefined ? updates.url.trim() || null : existing.url;

  if (nextUrl) assertUrl(nextUrl);
  if (!nextUrl) {
    throw new Error("A track must keep a URL so playback can replay the same source.");
  }

  try {
    getDb()
      .prepare(
        `UPDATE playlist_tracks
         SET name = ?, display_name = ?, title = ?, artist = ?, url = ?
         WHERE playlist_id = ? AND name = ?`,
      )
      .run(
        nextNormalized,
        nextDisplay,
        nextTitle,
        nextArtist,
        nextUrl,
        playlist.id,
        existing.name,
      );
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
    ) {
      throw new Error(
        `**${nextDisplay}** is already on playlist **${playlist.display_name}**.`,
      );
    }
    throw error;
  }
}

export function listPlaylistTracks(
  userId: string,
  playlistName: string,
): PlaylistTrack[] {
  prepareUserPlaylists(userId);
  const playlist = getPlaylistRow(userId, playlistName);
  if (!playlist) {
    throw new Error(`You don't have a playlist named **${playlistName.trim()}**.`);
  }

  const rows = getDb()
    .prepare(
      `SELECT id, display_name, title, artist, url FROM playlist_tracks
       WHERE playlist_id = ?
       ORDER BY display_name COLLATE NOCASE`,
    )
    .all(playlist.id) as TrackRow[];

  return rows.map(rowToTrack);
}

export function getTrackFromPlaylist(
  userId: string,
  playlistName: string,
  trackName: string,
): PlaylistTrack | undefined {
  prepareUserPlaylists(userId);
  const playlist = getPlaylistRow(userId, playlistName);
  if (!playlist) return undefined;

  const row = getDb()
    .prepare(
      `SELECT id, display_name, title, artist, url FROM playlist_tracks
       WHERE playlist_id = ? AND name = ?`,
    )
    .get(playlist.id, normalizeName(trackName)) as TrackRow | undefined;
  return row ? rowToTrack(row) : undefined;
}

export function pickRandomTrackFromPlaylist(
  userId: string,
  playlistName: string,
): PlaylistTrack | undefined {
  prepareUserPlaylists(userId);
  const playlist = getPlaylistRow(userId, playlistName);
  if (!playlist) return undefined;

  const rows = getDb()
    .prepare(
      `SELECT id, display_name, title, artist, url FROM playlist_tracks
       WHERE playlist_id = ?`,
    )
    .all(playlist.id) as TrackRow[];
  if (rows.length === 0) return undefined;
  return rowToTrack(rows[Math.floor(Math.random() * rows.length)]!);
}

export function describePlaylistTrack(track: PlaylistTrack): string {
  const parts: string[] = [];
  if (track.title) {
    parts.push(track.artist ? `${track.title} — ${track.artist}` : track.title);
  }
  if (track.url) parts.push(track.url);
  if (parts.length === 0) return track.name;
  return parts.join("\n");
}

/** Copy legacy favorite_songs rows into a per-user "Favorites" playlist. */
export function migrateFavoriteSongsToPlaylists(): void {
  const db = getDb();
  const hasLegacy = db
    .prepare(
      `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'favorite_songs'`,
    )
    .get();
  if (!hasLegacy) return;

  const users = db
    .prepare(`SELECT DISTINCT user_id FROM favorite_songs`)
    .all() as { user_id: string }[];

  const insertPlaylist = db.prepare(
    `INSERT OR IGNORE INTO playlists (user_id, name, display_name) VALUES (?, ?, ?)`,
  );
  const findPlaylist = db.prepare(
    `SELECT id FROM playlists WHERE user_id = ? AND name = ?`,
  );
  const insertTrack = db.prepare(
    `INSERT OR IGNORE INTO playlist_tracks (playlist_id, name, display_name, title, artist, url)
     SELECT ?, fs.name, fs.display_name, fs.title, fs.artist, fs.url
     FROM favorite_songs fs
     WHERE fs.user_id = ? AND fs.name = ?`,
  );

  for (const { user_id } of users) {
    insertPlaylist.run(user_id, DEFAULT_PLAYLIST_KEY, DEFAULT_PLAYLIST_NAME);
    const playlist = findPlaylist.get(user_id, DEFAULT_PLAYLIST_KEY) as
      | { id: number }
      | undefined;
    if (!playlist) continue;

    const songs = db
      .prepare(
        `SELECT name FROM favorite_songs WHERE user_id = ?`,
      )
      .all(user_id) as { name: string }[];

    for (const { name } of songs) {
      insertTrack.run(playlist.id, user_id, name);
    }
  }

  db.exec(`DROP TABLE IF EXISTS favorite_songs`);
}
