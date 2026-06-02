import { GuildQueue } from "discord-player";
import { usePlayer } from "discord-player";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  Message,
  Guild,
  type SendableChannels,
  escapeMarkdown,
} from "discord.js";
import { queueLinkPreviewContent } from "@/utils/music/musicMessage";
import { resolveMusicNotifyChannel } from "@/utils/music/requestChannel";
import { msToHumanReadableTime } from "@utils/util";

type ContextPanelView = "nowPlaying" | "queue" | "lyrics";

interface MusicContextState {
  message: Message;
  currentView: ContextPanelView;
  lyricsData?: {
    name: string;
    artistName: string;
    plainLyrics: string;
  };
}

const EMBED_DESCRIPTION_MAX_LENGTH = 2048;
const guildContextPanels = new Map<string, MusicContextState>();

export function getContextPanel(guildId: string): MusicContextState | undefined {
  return guildContextPanels.get(guildId);
}

export function clearContextPanel(guildId: string): void {
  const state = guildContextPanels.get(guildId);
  if (state) {
    void deletePanelMessage(state.message);
  }
  guildContextPanels.delete(guildId);
}

async function deletePanelMessage(message: Message): Promise<void> {
  try {
    await message.delete();
  } catch {
    // Message may already be gone.
  }
}

function resolvePanelChannel(queue: GuildQueue): SendableChannels | null {
  return resolveMusicNotifyChannel(queue, queue.currentTrack);
}

/** Delete the previous panel (if any) and post a fresh one at the bottom of chat. */
async function repostContextPanel(
  queue: GuildQueue,
  options: {
    view?: ContextPanelView;
    lyricsData?: MusicContextState["lyricsData"] | null;
  } = {},
): Promise<void> {
  const guildId = queue.guild.id;
  const previous = guildContextPanels.get(guildId);

  if (previous) {
    await deletePanelMessage(previous.message);
  }

  const view = options.view ?? previous?.currentView ?? "nowPlaying";
  let lyricsData = previous?.lyricsData;
  if (options.lyricsData !== undefined) {
    lyricsData = options.lyricsData ?? undefined;
  }

  const channel = resolvePanelChannel(queue);
  if (!channel) {
    console.warn("[music] cannot post context panel — no sendable channel");
    guildContextPanels.delete(guildId);
    return;
  }

  const embed = resolvePanelEmbed(queue, view, lyricsData);
  const components = createPanelComponents(guildId, view, !!lyricsData);
  const previewContent = queueLinkPreviewContent(queue);

  const panelMessage = await channel.send({
    content: previewContent ?? "",
    embeds: [embed],
    components,
  });

  guildContextPanels.set(guildId, {
    message: panelMessage,
    currentView: view,
    lyricsData,
  });
}

function isPlaybackPaused(guildId: string): boolean {
  const player = usePlayer(guildId);
  return player?.isPaused() ?? false;
}

/** Top row: view tabs (active tab uses Primary / blurple). */
function createTabRow(
  currentView: ContextPanelView,
  hasLyrics: boolean,
): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();

  row.addComponents(
    new ButtonBuilder()
      .setCustomId("music_view_nowplaying")
      .setLabel("Now Playing")
      .setStyle(
        currentView === "nowPlaying"
          ? ButtonStyle.Primary
          : ButtonStyle.Secondary,
      ),
    new ButtonBuilder()
      .setCustomId("music_view_queue")
      .setLabel("Queue")
      .setStyle(
        currentView === "queue" ? ButtonStyle.Primary : ButtonStyle.Secondary,
      ),
  );

  if (hasLyrics) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId("music_view_lyrics")
        .setLabel("Lyrics")
        .setStyle(
          currentView === "lyrics" ? ButtonStyle.Primary : ButtonStyle.Secondary,
        ),
    );
  }

  return row;
}

/** Second row: playback controls (separate from tabs). */
function createControlRow(isPaused: boolean): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();

  row.addComponents(
    new ButtonBuilder()
      .setCustomId("music_pause")
      .setLabel(isPaused ? "Resume" : "Pause")
      .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setEmoji(isPaused ? "▶️" : "⏸️"),
    new ButtonBuilder()
      .setCustomId("music_skip")
      .setLabel("Skip")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("⏭️"),
    new ButtonBuilder()
      .setCustomId("music_dismiss")
      .setLabel("Dismiss")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("✖️"),
  );

  return row;
}

function createPanelComponents(
  guildId: string,
  currentView: ContextPanelView,
  hasLyrics: boolean,
): ActionRowBuilder<ButtonBuilder>[] {
  return [
    createTabRow(currentView, hasLyrics),
    createControlRow(isPlaybackPaused(guildId)),
  ];
}

function createNowPlayingEmbed(queue: GuildQueue, guild: Guild): EmbedBuilder {
  const track = queue.currentTrack;
  
  if (!track) {
    return new EmbedBuilder()
      .setColor(1752220)
      .setTitle("Music Player")
      .setDescription("No track currently playing")
      .setAuthor({
        name: guild.name,
        iconURL: guild.iconURL() ?? undefined,
      });
  }

  const embed = new EmbedBuilder()
    .setColor(1752220)
    .setTitle("🎵 Now Playing")
    .setURL(track.url)
    .setDescription(`[${escapeMarkdown(track.title)}](${track.url})`)
    .setThumbnail(track.thumbnail)
    .setAuthor({
      name: guild.name,
      iconURL: guild.iconURL() ?? undefined,
    });

  const fields = [];
  
  if (track.author) {
    fields.push({ name: "Artist", value: track.author, inline: true });
  }
  
  if (track.duration) {
    fields.push({ name: "Duration", value: track.duration, inline: true });
  }

  const repeatModeStr = 
    queue.repeatMode === 3 ? "🔀 Autoplay" :
    queue.repeatMode === 2 ? "🔁 Queue" :
    queue.repeatMode === 1 ? "🔂 Track" :
    "▶️ Off";
  
  fields.push({ name: "Repeat Mode", value: repeatModeStr, inline: true });

  const queueLength = queue.tracks.size;
  if (queueLength > 0) {
    fields.push({ 
      name: "Up Next", 
      value: `${queueLength} track${queueLength !== 1 ? 's' : ''} in queue`, 
      inline: true 
    });
  }

  if (queue.estimatedDuration) {
    fields.push({
      name: "Estimated Time Remaining",
      value: msToHumanReadableTime(queue.estimatedDuration),
      inline: true,
    });
  }

  embed.addFields(fields);

  const requester = track.requestedBy;
  if (requester?.username) {
    embed.setFooter({ text: `Requested by ${requester.username}` });
  } else if (queue.metadata?.member?.user?.username) {
    embed.setFooter({ text: `Requested by ${queue.metadata.member.user.username}` });
  }

  return embed;
}

function createQueueEmbed(queue: GuildQueue, guild: Guild): EmbedBuilder {
  const currQueue = queue.tracks.toArray();
  const embed = new EmbedBuilder()
    .setColor(1752220)
    .setTitle("📜 Queue")
    .setAuthor({
      name: guild.name,
      iconURL: guild.iconURL() ?? undefined,
    });

  if (currQueue.length === 0) {
    embed.setDescription("Queue is currently empty");
    return embed;
  }

  const track = queue.currentTrack;
  let description = track 
    ? `**🎵 Now Playing:** [${escapeMarkdown(track.title)}](${track.url})\n\n`
    : "";

  const maxTracks = 10;
  const displayQueue = currQueue.slice(0, maxTracks);
  
  description += displayQueue
    .map((t, idx) => `${idx + 1}. (${t.duration}) [${escapeMarkdown(t.title)}](${t.url})`)
    .join("\n");

  if (currQueue.length > maxTracks) {
    description += `\n\n*... and ${currQueue.length - maxTracks} more track${currQueue.length - maxTracks !== 1 ? 's' : ''}*`;
  }

  embed.setDescription(description);

  if (displayQueue[0]?.thumbnail) {
    embed.setImage(displayQueue[0].thumbnail);
  }

  if (queue.estimatedDuration) {
    embed.setFooter({ 
      text: `${currQueue.length} track${currQueue.length !== 1 ? 's' : ''} • Estimated Time: ${msToHumanReadableTime(queue.estimatedDuration)}` 
    });
  }

  return embed;
}

function createLyricsEmbed(
  lyricsData: { name: string; artistName: string; plainLyrics: string },
  guild: Guild
): EmbedBuilder {
  let description = lyricsData.plainLyrics;
  
  if (description && description.length > EMBED_DESCRIPTION_MAX_LENGTH) {
    description = description.slice(0, EMBED_DESCRIPTION_MAX_LENGTH - 3) + "...";
  }

  const embed = new EmbedBuilder()
    .setColor(1752220)
    .setTitle(`📝 ${lyricsData.name ?? "Unknown"}`)
    .setAuthor({
      name: lyricsData.artistName ?? "Unknown",
    })
    .setDescription(description ?? "Instrumental")
    .setFooter({ text: `Lyrics for ${guild.name}` });

  return embed;
}

function resolvePanelEmbed(
  queue: GuildQueue,
  view: ContextPanelView,
  lyricsData?: MusicContextState["lyricsData"],
): EmbedBuilder {
  switch (view) {
    case "queue":
      return createQueueEmbed(queue, queue.guild);
    case "lyrics":
      return lyricsData
        ? createLyricsEmbed(lyricsData, queue.guild)
        : createNowPlayingEmbed(queue, queue.guild);
    case "nowPlaying":
    default:
      return createNowPlayingEmbed(queue, queue.guild);
  }
}

/** Post a fresh Now Playing panel when a track starts (replaces any prior panel). */
export async function ensureNowPlayingPanel(queue: GuildQueue): Promise<void> {
  await repostContextPanel(queue, { view: "nowPlaying", lyricsData: null });
}

export async function updateContextPanel(
  queue: GuildQueue,
  view?: ContextPanelView,
  lyricsData?: { name: string; artistName: string; plainLyrics: string },
): Promise<void> {
  const guildId = queue.guild.id;
  if (!guildContextPanels.has(guildId) && !view && !lyricsData) return;

  await repostContextPanel(queue, {
    ...(view ? { view } : {}),
    ...(lyricsData ? { lyricsData } : {}),
  });
}

export async function createOrUpdateContextPanel(
  message: Message,
  queue: GuildQueue,
  view: ContextPanelView = "nowPlaying",
  lyricsData?: { name: string; artistName: string; plainLyrics: string },
): Promise<Message> {
  if (!queue.metadata?.channel && message.channel.isSendable()) {
    queue.metadata = { ...queue.metadata, channel: message.channel };
  }

  await repostContextPanel(queue, {
    view,
    ...(lyricsData ? { lyricsData } : {}),
  });

  const state = guildContextPanels.get(queue.guild.id);
  if (!state) {
    throw new Error("Failed to post music context panel.");
  }
  return state.message;
}

export async function handleContextPanelInteraction(
  interaction: ButtonInteraction,
  queue: GuildQueue,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;

  const state = guildContextPanels.get(guildId);

  if (!state) {
    await interaction.reply({
      content: "Music context panel not found. Please use a music command first.",
      ephemeral: true,
    });
    return;
  }

  if (interaction.customId === "music_dismiss") {
    try {
      await state.message.delete();
      guildContextPanels.delete(guildId);
      await interaction.deferUpdate();
    } catch (error) {
      console.error("Failed to dismiss context panel:", error);
    }
    return;
  }

  if (interaction.customId === "music_pause") {
    const player = usePlayer(guildId);
    if (!player) {
      await interaction.reply({
        content: "No active player found.",
        ephemeral: true,
      });
      return;
    }
    await interaction.deferUpdate();
    player.setPaused(!player.isPaused());
    await updateContextPanel(queue);
    return;
  }

  if (interaction.customId === "music_skip") {
    const player = usePlayer(guildId);
    if (!player) {
      await interaction.reply({
        content: "No active player found.",
        ephemeral: true,
      });
      return;
    }
    await interaction.deferUpdate();
    player.skip();
    return;
  }

  const viewMap: Record<string, ContextPanelView> = {
    music_view_nowplaying: "nowPlaying",
    music_view_queue: "queue",
    music_view_lyrics: "lyrics",
  };

  const newView = viewMap[interaction.customId];
  if (newView) {
    if (newView === "lyrics" && !state.lyricsData) {
      await interaction.reply({
        content: "No lyrics available. Use the lyrics command first to fetch lyrics.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferUpdate();
    await updateContextPanel(queue, newView);
  }
}
