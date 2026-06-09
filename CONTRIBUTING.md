# Contributing

buildbeat is a small toy, but fixes and additions are welcome.

- Open an issue first for anything non-trivial, so we can agree on the shape before you build it.
- `bun install`, then keep `bun test` and `bun run typecheck` green. Use `bunx biome check .` for
  format and lint.
- Keep the audio core (`public/engine.js`) and the renderer (`public/render.js`) separate. The audio
  graph is the load-bearing, seam-free part; the visual layer only reads audio state.
- The most useful contributions are new mood and accent mappings (the taste), new test-runner or
  editor integrations, and a real curated stems pack to replace the synth pads.

By contributing, you agree your work is licensed under the MIT License.
