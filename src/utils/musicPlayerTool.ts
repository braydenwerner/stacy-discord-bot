import { DynamicStructuredTool } from "langchain/tools";
import { z } from "zod";

export const MUSIC_PLAYER = "musicPlayer";

const playMusicSchema = z.object({
  songName: z.string().describe("The name of the song to play."),
  artist: z.string().optional().describe("The artist of the song."),
});

export const musicPlayerTool = new DynamicStructuredTool({
  name: MUSIC_PLAYER,
  description: "Can play music.",
  schema: playMusicSchema,
  func: async ({ songName, artist }) => {
    if (!songName) throw new Error("No song provided.");
    return `Now playing: ${songName} by ${artist}`;
  },
});
