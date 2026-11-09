# salman2301.github.io

A terminal portfolio that doubles as a tiling workspace. Live at **[salman2301.github.io](https://salman2301.github.io)**.

Type `help` in the terminal to see every command.

![Terminal portfolio](docs/screenshots/terminal.png)

## Screenshots

| Morning Brief template | Markdown notes |
| --- | --- |
| ![Hacker News, pomodoro and tasks](docs/screenshots/morning-brief.png) | ![Notes next to the terminal](docs/screenshots/notes.png) |

| Autocomplete | Tetris |
| --- | --- |
| ![Floating autocomplete menu](docs/screenshots/autocomplete.png) | ![Tetris](docs/screenshots/tetris.png) |

| Space Impact | Bounce | Car Racing |
| --- | --- | --- |
| ![Space Impact](docs/screenshots/spaceimpact.png) | ![Bounce](docs/screenshots/bounce.png) | ![Car Racing](docs/screenshots/racing.png) |

## What's inside

- **Tiling panes**: split, resize (drag or keyboard), maximize, drag a pane header onto another pane to swap them, and turn any pane into any widget from its title menu.
- **Templates**: pick a layout with `Alt+T` or `templates`, or save your own (`template save <name>`). More templates appear automatically as more widgets are added.
- **Widgets**: the terminal, pomodoro (`pomodoro`), tasks (`todo`), Hacker News (`news`), markdown notes (`notes`: Obsidian-style live preview where the line you are on shows its markdown and the rest stays rendered, plus source and reading views; import and export .md) and the arcade.
  - **Tasks** (`todo`): tasks in spaces, sub-tasks, notes on tasks and spaces, a number for every task (`#12`, `todo focus 12`). Type `@` in a task or a note to link the other one, written as `[@task: #123]` or `[@note: Title]`; click a link to jump to it. Dates are written `[@date: 2026-11-28]` and `[@time: 2026-11-28 15:20]` (`@date`, `@time`, `@today`, `@tmrw`, `@monday` … `@sunday`, `@nextweek`, or pick one from a calendar). In a task a date sets its due date (`todo add pay rent @friday` works too); in a note it adds a reminder. The notes preview shows these as chips: tasks with a completed / active marker, dates with "in 3 days"; hover or right-click a chip for details and actions. Reminders show in the status-bar calendar, for all spaces or one, and pop a toast when due.
  - **Spaces** (`space work`, `space all`, or the status bar): group tasks and notes into spaces (Inbox is the default). Picking a space in the status bar shows only its tasks, notes and reminders, and switches to the space's own theme if it has one. Rename, theme or delete a space from the same menu. Notes can be dragged to reorder.
  - **Reminders** (`open reminders`): upcoming reminders grouped as overdue, today, tomorrow, this week and later; add one with `call mom @tmrw`.
  - **Calendar** (`calendar`, `cal week`): year, month, week and day views of your reminders. Pinch (touch or trackpad) or ctrl+scroll to zoom between them with an animated zoom into the spot you pinched; swipe or ←/→ for the next page. Click an hour in the day view to add a reminder there.
  - **Clock** (`clock`): calm by default, just the time and date; hover for digital / analog and 12 / 24h (digital), and "cities" for world clocks (`clock add Asia/Tokyo`).
  - **Timer** (`timer 5m`, `stopwatch`): stopwatch with laps, and a countdown that still rings when its pane is closed.
  - **Radio** (`radio`, `radio list`): free live stations (FIP, KEXP, Radio Paradise, NTS), drawn in your theme. Play and pause from the status bar or with `Alt+P`. **Spotify** (`spotify <link>`) plays playlists with presets.
  - **Digital Rain** (`open matrix`) and **Embed** (`embed <url>`) for any page that allows it.
- **Arcade**: Snake, Tetris, Space Impact, Bounce, Car Racing, Brick Breaker, Byte Runner, Typing Defense, Pairs and Sudoku, with saved high scores (`games`, `play sudoku`). WASD or arrows everywhere, Space pauses and resumes, and touch screens get an on-screen pad.
- **Extras**: 26 themes, including popular VS Code ones (One Dark Pro, GitHub, Night Owl, Monokai Pro, Ayu, Palenight, Cobalt2, Shades of Purple), with a system / dark / light switch in the status bar (`theme system`), share links that recreate a layout (`share`), screensavers in your theme (`screensaver matrix|stars|pipes|bounce`, `Alt+S`, or after idle minutes), `hack`, a tmux-style status bar, tab completion with inline suggestions, command chaining with `&&`.

Everything is saved in your browser's local storage. Nothing is sent to a server.

## Shortcuts

| Keys | Action |
| --- | --- |
| `Alt+T` | template picker |
| `Alt+\` or `Alt+Enter` | split right |
| `Alt+-` | split down |
| `Alt+W` | close pane |
| `Alt+M` | maximize / restore |
| `Alt+N` | new tab (window) |
| `Alt+[` / `Alt+]` | previous / next tab |
| `Alt+Y` | next theme |
| `Alt+Shift+Y` | random theme |
| `Alt+Arrows` | move focus between panes |
| `Alt+1..9` | focus pane by number |
| `Tab`, `Up`/`Down`, `Ctrl+C`, `Ctrl+L` | terminal completion, history, stop, clear |

On macOS, `Alt` is the `Option` key.

## Development

```sh
yarn install
yarn dev        # start the dev server
yarn run check  # type check
yarn build      # production build into dist/
```

Pushing to `master` builds the site and deploys it to the `gh-pages` branch.

### Adding things

Features are discovered automatically. You never edit a central list.

| Add a... | Create | Export |
| --- | --- | --- |
| widget | `src/lib/widgets/<id>/index.ts` | `WidgetDef` |
| game | `src/lib/games/<id>/index.ts` | `GameDef` (hosted by `GameShell`) |
| command | `src/lib/commands/<name>.ts` | `CommandDef` or `CommandDef[]` |
| overlay | `src/lib/overlays/<id>/index.ts` | `OverlayDef` |
| template | `src/lib/core/templates.ts` | `TemplateDef` |

The contracts are documented in `src/lib/core/types.ts`.
