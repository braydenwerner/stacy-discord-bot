import { GuildQueue, Track } from "discord-player";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Message,
  Guild,
  escapeMarkdown,
} from "discord.js";
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
  guildContextPanels.delete(guildId);
}

function createButtons(currentView: ContextPanelView, hasLyrics: boolean): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();

  row.addComponents(
    new ButtonBuilder()
      .setCustomId("music_view_nowplaying")
      .setLabel("Now Playing")
      .setStyle(currentView === "nowPlaying" ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji("▶️"),
    new ButtonBuilder()
      .setCustomId("music_view_queue")
      .setLabel("Queue")
      .setStyle(currentView === "queue" ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji("📜"),
  );

  if (hasLyrics) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId("music_view_lyrics")
        .setLabel("Lyrics")
        .setStyle(currentView === "lyrics" ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setEmoji("📝"),
    );
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId("music_dismiss")
      .setLabel("Dismiss")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("✖️"),
  );

  return row;
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

  if (queue.metadata?.member?.user?.username) {
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

export async function updateContextPanel(
  queue: GuildQueue,
  view?: ContextPanelView,
  lyricsData?: { name: string; artistName: string; plainLyrics: string }
): Promise<void> {
  const guildId = queue.guild.id;
  const state = guildContextPanels.get(guildId);

  if (!state) return;

  if (view) {
    state.currentView = view;
  }

  if (lyricsData) {
    state.lyricsData = lyricsData;
  }

  let embed: EmbedBuilder;
  switch (state.currentView) {
    case "queue":
      embed = createQueueEmbed(queue, queue.guild);
      break;
    case "lyrics":
      if (state.lyricsData) {
        embed = createLyricsEmbed(state.lyricsData, queue.guild);
      } else {
        embed = createNowPlayingEmbed(queue, queue.guild);
      }
      break;
    case "nowPlaying":
    default:
      embed = createNowPlayingEmbed(queue, queue.guild);
      break;
  }

  const buttons = createButtons(state.currentView, !!state.lyricsData);

  try {
    await state.message.edit({
      embeds: [embed],
      components: [buttons],
    });
  } catch (error) {
    console.error("Failed to update context panel:", error);
    guildContextPanels.delete(guildId);
  }
}

export async function createOrUpdateContextPanel(
  message: Message,
  queue: GuildQueue,
  view: ContextPanelView = "nowPlaying",
  lyricsData?: { name: string; artistName: string; plainLyrics: string }
): Promise<Message> {
  const guildId = queue.guild.id;
  const existingState = guildContextPanels.get(guildId);

  let embed: EmbedBuilder;
  switch (view) {
    case "queue":
      embed = createQueueEmbed(queue, queue.guild);
      break;
    case "lyrics":
      if (lyricsData) {
        embed = createLyricsEmbed(lyricsData, queue.guild);
      } else {
        embed = createNowPlayingEmbed(queue, queue.guild);
      }
      break;
    case "nowPlaying":
    default:
      embed = createNowPlayingEmbed(queue, queue.guild);
      break;
  }

  const buttons = createButtons(view, !!lyricsData || !!existingState?.lyricsData);

  if (existingState) {
    try {
      existingState.currentView = view;
      if (lyricsData) {
        existingState.lyricsData = lyricsData;
      }
      await existingState.message.edit({
        embeds: [embed],
        components: [buttons],
      });
      return existingState.message;
    } catch (error) {
      console.error("Failed to edit existing context panel, creating new one:", error);
      guildContextPanels.delete(guildId);
    }
  }

  const newMessage = await message.reply({
    embeds: [embed],
    components: [buttons],
  });

  guildContextPanels.set(guildId, {
    message: newMessage,
    currentView: view,
    lyricsData,
  });

  return newMessage;
}

export async function handleContextPanelInteraction(
  interaction: any,
  queue: GuildQueue
): Promise<void> {
  const guildId = interaction.guildId;
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

    await updateContextPanel(queue, newView);
    await interaction.deferUpdate();
  }
}
