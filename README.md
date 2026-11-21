# dsh-onlineoutline

**English** | [简体中文](README.zh-CN.md)

A scrollable **question outline** on the right edge of a DeepSeek Harness conversation. It replaces the built-in turn tick rail with a list of your questions, so you can see where you are and jump around.

> **Unofficial.** This is a community plugin. It is not a DeepSeek release and is
> not affiliated with or endorsed by DeepSeek.
>
> **Runs with the harness's own permissions.** A DSH plugin is not sandboxed: it
> executes inside the harness process with the same file and process access as the
> app itself. Read the source before installing this or any fork of it.
>
> **Pinned to one DSH version.** Written and verified against DeepSeek Harness
> `0.2.2-rc.5` only. It reads built-in markers and a hashed class name, so a DSH
> upgrade will probably break it — see
> [Requirements and known limits](#requirements-and-known-limits).

Developed and verified against **DeepSeek Harness `0.2.2-rc.5`** (Windows desktop).

## What it does

- **Collapsed**: a slim strip of ticks at the right edge — grey pills for every turn, one bright-blue pill for the turn you are reading. No text, no scrollbar, no border.
- **Hover / keyboard focus**: expands instantly into a 240px panel listing every question, each row with its turn number, a single-line title, and a tick.
- **Hover preview**: a 300×100 card to the left of the row shows the full question plus the first lines of the answer, mirroring the built-in preview.
- **Click a row**: scrolls the conversation to that turn.
- **Never jumps**: ticks and text are right-aligned, and the scrollbar gutter is reserved in both states, so nothing shifts horizontally when the panel opens.
- **Yields when space is tight**: the panel hides when it would come closer than 18px to the message column, or when the conversation area drops below 420px (with hysteresis, so it cannot flicker).
- **Window resizing**: below 1080px it collapses the built-in left sidebar to give the conversation room, and above 1220px it restores it. The click is verified and retried, because a single programmatic click is sometimes swallowed during a large relayout.

Three colours only: grey at rest, white on hover, bright accent for the current turn.

## Install

The bundle is a plain directory; no build step.

Install straight from GitHub:

```
dsh plugin --profile desktop add github:NAME7220/dsh-onlineoutline
```

Or clone it and add the local directory:

```
git clone https://github.com/NAME7220/dsh-onlineoutline.git
dsh plugin --profile desktop add <path-to-this-directory>
```

or, from inside DeepSeek Harness, use the plugin manager's `install_bundle` with the absolute path of this directory.

Then reload the client (refresh the window; restart the desktop app if the client module was already cached).

## Requirements and known limits

- Needs the `conversation.composer.dock` slot and the `turnOutline` session projection, both provided by `@deepseek-ai/dsh-client-ui-chat`.
- Three couplings to built-in artefacts, all marked in `client.js` and all of which may change on a DSH upgrade:
  - `.SNx2jG_frame` — the hashed class of the built-in rail this plugin hides;
  - `[data-turn-tail]` — the per-turn marker used for jumping, for tracking the reading position, and for measuring the column width;
  - `[data-sidebar-toggle]` — the button used for the sidebar collapse.
- Turns whose prompt is empty (for example image-only messages) are labelled `#<turn>`.

## Layout constants

All tunables live at the top of `client.js`: panel width and cap height, the collapsed strip width, the right offset, the minimum gap to the message column, and the two viewport thresholds for the sidebar behaviour.

## License

MIT — see [LICENSE](LICENSE).
