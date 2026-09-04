# MacroPad Configurator

Standalone web prototype for configuring a 2×8 (16-key) macropad with per-key RGB LEDs.

## Features

- 16-key layout (2 rows × 8 columns) rendered as a dark, minimalist macropad.
- Click a key to open its configuration panel.
- **Capture** button opens a "Listening…" modal that records any key combination or shortcut (Ctrl / Alt / Shift / Win + key).
- Per-key RGB LED color: 10 presets, custom color picker, or LED off.
- Configured keys show their shortcut label and a glow in the assigned LED color.
- Configuration persists in `localStorage`.

## Usage

Open `index.html` in any modern browser. No build step, no dependencies.
