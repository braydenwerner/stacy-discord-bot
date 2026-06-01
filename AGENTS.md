# Stacy Discord Bot — Raspberry Pi (PiQueen)

This repo runs on a Raspberry Pi. The bot process must run inside the **`shared`** tmux session so output is visible on the Pi console (`tmux attach -t shared` on tty1).

## Tmux session

| Item | Value |
|------|--------|
| Session name | `shared` |
| Typical pane | `shared:0` |
| Project directory | `/home/breadone/server/stacy-discord-bot` |
| Dev command | `pnpm run dev` (`tsx watch src/index.ts`) |

Do **not** start or restart the server only in a detached Cursor agent shell. Run pull/build/restart **in the `shared` tmux pane** (or via `tmux send-keys` targeting `shared:0`) so the user can watch logs on the Pi.

## Starting or restarting the server

1. Confirm the session exists: `tmux has-session -t shared 2>/dev/null` (create with `tmux new -s shared` only if missing).
2. If a dev server is already running in `shared:0`, stop it first (`C-c` in that pane).
3. In `shared:0`, from the project root:

```bash
cd /home/breadone/server/stacy-discord-bot
git pull
pnpm run dev
```

Equivalent one-liner via tmux (when not interactively attached):

```bash
tmux send-keys -t shared:0 C-c
sleep 2
tmux send-keys -t shared:0 'cd /home/breadone/server/stacy-discord-bot && git pull && pnpm run dev' Enter
```

4. Verify with `tmux capture-pane -t shared:0 -p | tail -20` — expect `Ready event has been fired`.

## Production-style restart

For a built production run instead of watch mode:

```bash
cd /home/breadone/server/stacy-discord-bot
git pull
pnpm install
pnpm run build
pnpm run start
```

Still run these commands in `shared:0`, not in a background-only shell.

## What not to do

- Do not assume a tmux session named `config` exists; on this Pi the bot uses **`shared`** only.
- Do not leave `pnpm run dev` running only on pts from Cursor SSH without routing through `shared` when the user asked to run or restart the server.
