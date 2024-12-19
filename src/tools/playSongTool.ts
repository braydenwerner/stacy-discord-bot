// import {
//   QueryResolver,
//   QueryType,
//   useMainPlayer,
//   useQueue,
// } from "discord-player";
// import { Message } from "discord.js";
// import { DynamicStructuredTool } from "langchain/tools";
// import { parse } from "node-html-parser";
// import { z } from "zod";

// const playMusicSchema = z.object({
//   songName: z.string().optional().describe("The name of the song to play."),
//   artist: z.string().optional().describe("The artist of the song."),
//   url: z.string().optional().describe("The URL of the song."),
//   message: z.custom<Message>(),
// });

// const discordPlayerConf = {
//   removeYoutube: true,
//   attemptYoutubeSearchEvenIfDisabled: true,
//   removeDeezer: false,
//   skipLogin: true,
//   usePoToken: false,
//   useCookie: false,
//   log: false,
//   highWaterMark: 2097152,
//   skipFFmpeg: false,
//   useSoundcloudBridge: false,
//   streamPriorities: ["youtube", "deezer", "soundcloud"],
// };

// export const playSongTool = new DynamicStructuredTool({
//   name: "playSong",
//   description: "Plays a song. ONLY PROVIDE A URL IF GIVEN.",
//   schema: playMusicSchema,
//   func: async ({ songName, artist, url, message }) => {
//     if (!message || !message?.guild?.id || !message.member)
//       throw new Error("Message not found");

//     const MAX_QUEUE_SIZE = 10000;

//     const player = useMainPlayer();
//     const queue = useQueue(message.guild.id);
//     // const playerConfig = config.get("discordPlayerConf");
//     let res, research, specificSearch;

//     if (!message.member.voice.channel) {
//       message.reply("You must be in a voice channel to play music!");
//       return "";
//     }

//     const attachment = message.attachments.first()?.attachment;

//     let query = `${songName} ${artist ? `by ${artist}` : ""}`;

//     const stringQueryType = QueryResolver.resolve(query).type;

//     const isYoutube =
//       stringQueryType == QueryType.YOUTUBE_SEARCH ||
//       stringQueryType == QueryType.YOUTUBE ||
//       stringQueryType == QueryType.YOUTUBE_PLAYLIST ||
//       stringQueryType == QueryType.YOUTUBE_VIDEO;

//     if (
//       stringQueryType === QueryType.YOUTUBE_VIDEO &&
//       discordPlayerConf.removeYoutube &&
//       discordPlayerConf.attemptYoutubeSearchEvenIfDisabled
//     ) {
//       const messageEmbeds = message.embeds || [];
//       for (const embed of messageEmbeds) {
//         if (embed.provider?.name === "YouTube") {
//           query = `${embed.title} - ${embed?.author?.name}`;
//           break;
//         }
//       }
//     }

//     const sentMessage = await message.reply("Request received, fetching...");

//     const linkRegex =
//       /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;

//     try {
//       if (
//         stringQueryType === QueryType.AUTO_SEARCH ||
//         stringQueryType === QueryType.SPOTIFY_SONG
//       ) {
//         if (stringQueryType === QueryType.SPOTIFY_SONG) {
//           research = await player.search(query, {
//             requestedBy: message.member,
//             searchEngine: QueryType.SPOTIFY_SONG,
//           });
//           if (!research.hasTracks()) {
//             message.reply("No results found");
//             return "";
//           }
//           if (research && research.hasTracks())
//             specificSearch = `${research.tracks[0].title} - ${research.tracks[0].author}`;
//           else if (!linkRegex.test(query)) specificSearch = query;
//         } else {
//           specificSearch = query;
//         }

//         console.log("specificSearch: ", specificSearch);
//         research = await player.search(specificSearch ?? "", {
//           requestedBy: message.member,
//           searchEngine: QueryType.AUTO_SEARCH,
//         });

//         if (!research.hasTracks()) {
//           let footerText = "";

//           if (discordPlayerConf.removeYoutube && isYoutube) {
//             footerText =
//               "Youtube has been disabled, for more info, use the help command and go in the support server.";
//             if (discordPlayerConf.attemptYoutubeSearchEvenIfDisabled)
//               footerText =
//                 "YouTube extraction is disabled, to support YouTube links, the YouTube embed must be visible";
//           }

//           message.reply("No results found");
//           return "";
//         }

//         // const choicesEmbed = embedGenerator.info({
//         //   title: "Type in chat the number you want to play",
//         //   description: "Not entering a number will make it play the best match",
//         //   fields: [],
//         //   timestamp: new Date(),
//         // });

//         const choices = research.tracks.slice(0, 10);
//         // choices.map((track, index) => {
//         //   choicesEmbed.data.fields.push({
//         //     name: `${index + 1} - ${track.title}`,
//         //     value: `By ${track.author}`,
//         //   });
//         // });

//         // await sentMessage.edit({ embeds: [choicesEmbed] });

//         // const filter = (m) => m.author.id === message.author.id;
//         // await message.channel
//         //   .awaitMessages({ filter, max: 1, time: 10000, errors: ["time"] })
//         //   .then((collected) => {
//         //     const responseMessage = collected.first();
//         //     research = choices[parseInt(responseMessage.content) - 1];
//         //     responseMessage.delete();
//         //   })
//         //   .catch(() => (research = choices[0]));
//       } else {
//         const soundgasm = await getSoundgasmLink(query);
//         if (soundgasm) query = soundgasm;

//         research = await player.search(query, {
//           requestedBy: message.member,
//           searchEngine: !discordPlayerConf.removeYoutube
//             ? QueryType.YOUTUBE_SEARCH
//             : QueryType.AUTO_SEARCH,
//         });

//         if (!research.hasTracks()) {
//           console.log("No results found");
//         }
//       }

//       if (research?.tracks?.length + (queue?.size ?? 0) > MAX_QUEUE_SIZE)
//         console.log("Cannot enqueue more than 10000 tracks.");

//       let finalTrack, finalSearchResult;
//       // if (optionalArgs["shuffle|s"]) await research?.tracks?.shuffle();

//       // if (optionalArgs["playnext|pn"] && queue) {
//       if (false) {
//         for (const track of research.tracks.reverse())
//           queue.insertTrack(track, 0);
//         finalTrack = research.tracks[0];
//         finalSearchResult = research;
//       } else {
//         const playResult = await player.play(
//           message.member.voice.channel.id,
//           attachment ?? research,
//           {
//             nodeOptions: {
//               metadata: {
//                 channel: message.channel,
//                 client: message.guild.members.me,
//                 requestedBy: message.member.user,
//                 guild: message.guild,
//               },
//               volume: 50,
//               maxSize: MAX_QUEUE_SIZE,
//               bufferingTimeout: 15000,
//               leaveOnStop: true,
//               leaveOnStopCooldown: 0,
//               leaveOnEnd: true,
//               leaveOnEndCooldown: 15000,
//               leaveOnEmpty: true,
//               leaveOnEmptyCooldown: 300000,
//               skipOnNoStream: true,
//             },
//           },
//         );
//         finalTrack = playResult.track;
//         finalSearchResult = playResult.searchResult;
//       }

//       if (isYoutube && discordPlayerConf.attemptYoutubeSearchEvenIfDisabled)
//         console.log(
//           "Youtube links might not be accurate as YouTube extraction is disabled",
//         );
//     } catch (err) {
//       console.error(err);
//     }
//   },
// });

// const getSoundgasmLink = async (link: string) => {
//   const regex = /^https:\/\/soundgasm\.net\/.*/;
//   if (!regex.test(link)) return null;

//   const response = await fetch(link);
//   const html = await response.text();
//   const root = parse(html);
//   const scriptContent = root.querySelectorAll("script").pop()?.text;

//   const startIndex = scriptContent?.indexOf(
//     '"https://media.soundgasm.net/sounds/',
//   );

//   if (!scriptContent || startIndex == null) return null;

//   const endIndex = scriptContent.indexOf('.m4a"', startIndex) + 4;

//   const m4aLink = scriptContent.substring(startIndex + 1, endIndex);
//   return m4aLink;
// };
