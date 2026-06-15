import { QueryType, useMainPlayer } from "discord-player";
import type {
  APIInteractionGuildMember,
  GuildMember,
  TextBasedChannel,
  VoiceBasedChannel,
} from "discord.js";

const HELLO_CLIP = "audio/hey_boys.mp3";

type HelloPlayContext = {
  voiceChannel: VoiceBasedChannel;
  textChannel: TextBasedChannel | null;
  member: GuildMember | APIInteractionGuildMember | null;
};

export async function playHelloClip(ctx: HelloPlayContext): Promise<void> {
  try {
    const player = useMainPlayer();
    await player.play(ctx.voiceChannel, HELLO_CLIP, {
      searchEngine: QueryType.FILE,
      nodeOptions: {
        metadata: {
          channel: ctx.textChannel,
          member: ctx.member as GuildMember | null,
          disableEmbeds: true,
        },
      },
    });
  } catch (error) {
    console.error("[music] playHelloClip failed:", error);
  }
}
