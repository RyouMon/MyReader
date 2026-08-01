# MyReader C4 pilot app icon

C4 is the only active pilot direction. The A variants are retired from the active shortlist.

## Sources

- `c4-reference.png` — user-approved C4 generation, kept unchanged.
- `c4-pilot-master.png` — flat-color production master derived from the approved C4 composition.
- `c4-pilot-1024.png` — opaque flat-color 1024 px source for iOS and general launcher icons.
- `c4-pilot-foreground.png` — flat-color transparent foreground for splash and layered exports.
- `c4-pilot-adaptive-foreground.png` — flat-color Android foreground sized to a 54/108 visual footprint within the 66/108 safe zone.
- `c4-pilot-adaptive-background.png` — solid warm-gold Android background.
- `c4-pilot-monochrome.png` — flat Android 13+ themed-icon silhouette.
- `c4-pilot-macos.png` — flat-color macOS enclosure variant on a transparent 1024 px canvas.

## Production palette

- Background: `#F6C568`
- Pages: `#FFFFFF`
- Second layer / cover: `#C4622D`

Production exports use solid fills with edge antialiasing only. Do not add gradients, highlights, shadows, glows, or textures.
Vertical placement is platform-specific and optical, not derived from page-only bounds. iOS/general and desktop preserve the approved original C4 position; Android adaptive keeps its original scale and moves the foreground 11 px down on the 512 px source canvas. Do not reposition the subject when flattening colors.

The platform copies under `my-reader/src-tauri/icons` and `my-reader-mobile/assets/images` are derived from these files. Do not add a rounded-corner mask to the iOS source; the operating system supplies it.
