# MacroPad Tools Editor

Web editor for an open source 16-key (2×8) MIDI macro pad based on the
ESP32-S3. The firmware is an **interpreter**: it has no hard-wired musical
logic — it reads "tools" defined as JSON from its flash (LittleFS) and brings
them to life. This app is where those tools are created, edited, validated,
assigned to slots and synced to the device. It should feel like configuring a
Stream Deck, not like programming.

**Live app:** https://hardwork91.github.io/macroPad/

## Features

- **Slots** — assign tools to the 15 available slots (key 16 is the Ctrl key:
  held on boot it enters the bootloader, held in use it opens the tool
  selector). Drag & drop to swap. Edits `device.json`, keeping the legacy
  `toolOrder` in sync for the current firmware.
- **Tool editor** — clickable 2×8 grid + per-key form for the 6 v1 primitives
  (`none`, `note`, `scale_note`, `chord`, `cc`, `param`), tool parameters
  (`vars`) with declarative ranges, raw JSON tab (read-only + advanced edit
  toggle), copy/paste keys and export/import single-key snippets.
- **Library** — local tools persisted in IndexedDB, import/export as `.json`
  files or pasted text, duplicate to remix; the 4 example tools preloaded.
- **Validation** — zod-based schema + semantic pass (cross references, typo
  suggestions, tool↔device scale coupling). Errors block sync — an invalid
  JSON never travels to the device. Unknown key primitives are warnings: kept
  as-is, flagged as "requires newer firmware".
- **Live view** — the grid mirrors physical key presses and a local
  interpreter (an exact mirror of the firmware's semantics) renders a
  human-readable MIDI log ("Chord: C4 · E4 · G4"). Works against the
  **simulated device** (no hardware needed) or Web Serial.
- **i18n** — English / Spanish.

## Development

```bash
npm install
npm run dev      # local dev server
npm run test     # contract tests (the 4 example JSONs must pass as-is)
npm run build    # typecheck + build into docs/
```

## Publishing (GitHub Pages)

GitHub Pages serves the compiled app from the `docs/` folder on `main`
(Settings → Pages → Deploy from a branch → `main` / `docs`). **Before every
push, run a build and commit `docs/`** so the published site matches the
source:

```bash
npm run build
git add -A
git commit -m "..."
git push
```

## Device protocol (Web Serial, line-based, UTF-8, 115200 baud)

Not yet implemented by the firmware; the app ships with a `MockDeviceLink`
simulator that speaks the same protocol. All communication is isolated in
`src/device/`.

```
Web -> Pad:
  PING                        -> PONG <fwVersion> <schemaVersion>
  LIST                        -> FILES <n>\n<name>\t<bytes>\n...
  GET <file>                  -> DATA <bytes>\n<content>
  PUT <file> <bytes>\n<content>  -> OK | ERR <reason>
  DEL <file>                  -> OK | ERR <reason>
  RELOAD                      -> OK   (reload tools without reboot)
  LIVE ON|OFF                 -> OK   (enable key events)

Pad -> Web (async, while LIVE ON):
  EV PRESS <idx> | EV RELEASE <idx>
  EV TOOL <toolId>
```

Note for the firmware: the web writes a `slots` field (16 entries, tool id or
`null`, entry 15 always `null`) into `device.json` — the target model for the
Ctrl+key tool selector. `toolOrder` stays in sync for the current cycling
gesture.

## Data contract (schema v1)

See `src/schema/` (types + validation, the single source of truth) and the
reference JSONs in `src/examples/` — the same files embedded in the firmware
`tool_interpreter_esp32s3.ino`. Contract tests in `tests/schema.test.ts`.

## Stack

Vite + React + TypeScript · zod · zustand · idb-keyval · vitest. 100% static
site, no backend. Web Serial requires Chrome/Edge; everything else works in
any modern browser (offline mode).
