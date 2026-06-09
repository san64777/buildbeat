# buildbeat

[![CI](https://github.com/san64777/buildbeat/actions/workflows/ci.yml/badge.svg)](https://github.com/san64777/buildbeat/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/buildbeat)](https://www.npmjs.com/package/buildbeat)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-20+-blue.svg)](https://nodejs.org/)

**your codebase gets a live soundtrack.** A terminal daemon that watches your dev loop and scores it
in real time: calm while you edit, a nervous pulse on a type error, tense and dissonant when tests
fail, a clean major-key resolve when you commit. Free, offline, no key, runs on every OS.

![buildbeat demo](https://github.com/san64777/buildbeat/releases/latest/download/demo.gif)

[Watch the 24-second demo, with sound.](https://github.com/san64777/buildbeat/releases/latest/download/buildbeat-clip.mp4)

```bash
npx buildbeat watch --test "npm test"
```

Open the localhost URL it prints, click once to start audio, and code. Your saves, test results, and
commits drive the music. Nothing to configure, no account, no network calls.

## What you get

A localhost page that is one brutalist build-monitor: a giant mood word (`CALM` / `FOCUS` / `TENSE` /
`FAIL`) carved live by the audio spectrum, a VU meter and an oscilloscope that never stop moving, a
tension gauge, and a typewriter event log of what your project just did. It reads like a CI dashboard
that happens to be playing music.

## The mapping

The whole point is the event to sound mapping. It is meant to feel like a film composer scoring your
work, not a gimmick you mute in five minutes.

| your project does this | you hear |
|---|---|
| editing, all green | a calm, low pad |
| a type error | the pad darkens, a nervous pulse enters |
| tests fail | it turns tense and dissonant, the word goes red, a low thud |
| tests pass | relief, a soft rising bell |
| `git commit` | a clean major-key resolve |

Tension is held high the whole time tests are failing and only resolves when you go green or commit,
so the score tracks the real state of your work, not just isolated events.

## Commands

```console
buildbeat watch --test "<your test command>"   # the live loop (default)
buildbeat demo                                   # a scripted ~25s arc: calm to fail to commit
buildbeat start                                  # manual control, for trying the sound
```

`--test` wraps whatever command you already use (`npm test`, `pytest`, `go test`, and so on);
buildbeat runs it on save and reads the exit code.

## How it works

- **Signals.** File saves via `chokidar`, test pass/fail by running your `--test` command and reading
  the exit code, git commits by watching the reflog (no hook to install). On WSL and network drives
  it falls back to polling so it never misses an event or crashes.
- **Mapping.** One engine turns those events into a musical intent (mood, tension, density,
  brightness, bpm, key). That is the part worth caring about.
- **Sound.** The daemon serves a localhost page that holds a Web Audio session; intents stream to it
  over a websocket. Transitions are equal-power crossfades, so the score morphs with no seam. The
  default sound is synthesized in the browser, so there are no assets to download and it runs on any
  OS, offline, with no key.

## What it is, and is not

- It is a toy: a continuous, adaptive score for your dev loop, meant to be fun and left running.
- It is not a productivity tool, and the default sound is procedural Web Audio, not generative AI
  music. (Real-time generative AI scoring is heavy and hardware-dependent, so it is kept as an
  optional flavor behind a swappable driver, never the default.)

## Develop

```bash
bun install
bun run demo        # the scripted arc
bun test            # unit tests
bun run build       # bundle to dist/cli.js (runs on plain node)
```

Built with Bun and TypeScript; ships as a single bundled file that runs on Node 20+.

## License

MIT.
