# Stacy Discord Bot

A Discord bot with AI capabilities, music playback, and flexible group management.

## Features

- **AI-Powered Chat**: Natural language interactions powered by OpenAI
- **Music Player**: Play songs from YouTube and other sources
- **Group Management**: Create and manage custom user groups with dynamic membership
- **Web Search**: Search the web and fetch page content
- **GitHub Integration**: Open pull requests directly from Discord

## Group Management

The bot supports flexible group management with persistent storage. Groups allow you to organize users and easily ping them with messages.

### Commands

**Creating Groups & Adding Members**
- `Stacy, add @user to group_name` - Add a user to a group (creates the group if it doesn't exist)

**Sending Messages to Groups**
- `Stacy, send "message" to group_name` - Ping all members of a group with a message
- Example: `Stacy, send "who wants to play tonight?" to gamers`

**Managing Groups**
- `Stacy, remove @user from group_name` - Remove a user from a group
- `Stacy, show me existing groups` - List all groups and their members
- `Stacy, delete group_name` - Delete a group entirely

### Permissions

- **Equality Rank Required**: Only users with the "Equality" Discord role can:
  - Add/remove users to/from groups
  - Delete groups
- **Anyone Can**: View existing groups and send messages to groups

### Technical Details

- Groups are stored in a SQLite database (`data/groups.db`)
- Group names are case-insensitive
- When sending messages to a group, the sender is automatically excluded from pings
- Database schema includes:
  - `groups` table: group metadata
  - `group_members` table: user membership with foreign key constraints

## Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Create a `.env` file with required credentials:
   ```env
   TOKEN=your_discord_bot_token
   OPENAI_API_KEY=your_openai_api_key
   GITHUB_TOKEN=your_github_token (optional)
   YOUTUBE_COOKIE=your_youtube_cookie (optional, for music)
   ```

3. Deploy slash commands:
   ```bash
   pnpm run deployCommands
   ```

4. Run the bot:
   ```bash
   pnpm run dev
   ```

## Development

- Built with TypeScript and discord.js
- Uses LangChain for AI tool orchestration
- SQLite for persistent storage
- discord-player for music functionality

## Project Structure

```
src/
├── commands/       # Slash commands
├── events/         # Discord event handlers
├── tools/          # AI tools for bot capabilities
├── utils/          # Utility functions
└── constants/      # Configuration and constants
```
