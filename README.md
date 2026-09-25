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

Implemented by `ESP32/esp32s3_tool_interpreter_v2` in the firmware repo, which
requires "USB CDC On Boot: Enabled" so `Serial` is a CDC port inside the same
composite USB device as MIDI. The app also ships a `MockDeviceLink`
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

## Data contract

See `src/schema/` (types + validation, the single source of truth) and the
reference JSONs in `src/examples/`. Contract tests in `tests/schema.test.ts`.

**v1** is the reactive model: six key primitives (`none`, `note`, `scale_note`,
`chord`, `cc`, `param`) that only react to press and release. Still valid.

**v2** adds time and generative sequencing, so the three generative modes of the
7-mode firmware can be expressed declaratively:

- **List variables.** A var with `values` stores the *index* into the list, so a
  delta of ±1 walks it. Values may be numbers or note durations (`"1/16"`).
- **`sequencer` block** (`type: "phrase"`). A phrase of up to `maxSteps` raw
  notes drawn from `noteRange`, quantised to a scale (fixed by name or chosen by
  a var). Parameters: `steps`, `rate`, `transpose`, `gate` (a percentage of the
  slot or a fixed duration), `mutation`, `hold`, and per-step `ratchet` bursts
  with a linear velocity ramp.
- **Four key primitives**: `seq_step` (a step of the phrase, lit by the
  playhead), `seq_action` (regenerate/start/stop/toggle), `hold_select` (hold it
  and the first N keys pick a value for a list var) and `hold_assign` (hold it
  and the step keys assign a ratchet).
- **Clock** lives in `device.json`. The firmware only has to be a *slave*: count
  incoming `0xF8` pulses and honour Start/Continue/Stop. `"internal"` is
  optional and only needed to be a master.
- **Scales** may now have 5–12 degrees. v1 forced exactly 7, which is why
  `minor_pentatonic` used to be faked as `[0,3,5,7,10,12,15]` — its degrees 5–7
  came out 12, 15, 12, going *down* at the octave. Firmware must use the real
  scale length, not a hardcoded 7, when wrapping degrees.

**Modifier scope.** A `hold_select` or `hold_assign` only captures the **top row**
(keys 1–8) while held, so a list variable can hold at most 8 values. The bottom
row keeps its own action, which is what lets Random Melody keep cycling scale and
root while the mutation modifier is held. If several modifiers are held at once,
the lowest key index wins.

**Guaranteed behaviour, not declared.** Switching tools always sends All Notes
Off and resets every var to its `init`. It is a safety property, so it is not a
JSON field you can turn off. `seq_action` start/stop move the pad's local
transport only; they never emit 0xFA/0xFC back to the host.

Version coherence is enforced: using a v2 feature in a tool that declares
`schemaVersion: 1` is an error, not silent acceptance.


## Stack

Vite + React + TypeScript · zod · zustand · idb-keyval · vitest. 100% static
site, no backend. Web Serial requires Chrome/Edge; everything else works in
any modern browser (offline mode).
