# Design Constitution — PolyGlance

Written before the frontend, per Blueprint Part V. References are the user's set; only patterns were taken, nothing copied.

## References and what was taken from each
- **dark.design / darkmodedesign.com** — near-black surfaces, one accent colour doing all the talking, borders instead of shadows. PolyGlance: the page is black; the only accent is the G2's own phosphor green.
- **minimal.gallery** — one idea per screen, generous empty space. PolyGlance: the glasses screens hold one market, one number, one action; the landing sections breathe.
- **godly.website / land-book.com** — landing rhythm: a claim, then proof, then the product working. PolyGlance: hero claim → problem → solution → the live simulator → outcome numbers from the real API.
- **21st.dev / Skiper UI** — small, precise components; chips and segmented controls with honest states. PolyGlance: the simulator's control row (scroll, tap, double-tap, voice chips) is built like that — every control labelled with what it stands for.
- **gsap.com** — motion that explains, not decorates. PolyGlance: the display crossfades when a screen changes and the ticker line slides; nothing loops for attention. Transform/opacity only.
- **threeui.com / tasteskill.dev** — depth used sparingly, one spatial moment. PolyGlance: the hero holds one spatial moment — the glasses display floats at a slight angle over a faint field of live odds lines, tilted in 3D with CSS as the pointer moves (disabled under reduced motion and on touch). The spatial element is the product itself, not decoration.
- **Vengeance UI / onepagelove.com** — strong single-column storytelling. PolyGlance: one column, sections in the order a judge asks questions.

## Identity — how this differs from the fleet
- Verity is a dark glass research instrument (serif + amber/cyan). GeoRaksha is a radar watch floor. Delhi Bus Bheed is a paper departure board.
- **PolyGlance is a phosphor terminal.** Black page, one green (#4dff88 family, the G2's green), monospace for every number, hairline borders, scanline-faint texture on the simulator bezel only. The G2 screen is reproduced at true 576×288 proportions and is the visual centre of every section. No gradients except the faintest green glow behind the hero display. Typography: a grotesque for prose (system stack), ui-monospace for data.

## Rules for the build
- Type scale: 12 / 14 / 16 / 20 / 24 / 32 / 44. Radii: 4 / 8 / 16 / full.
- Nothing on the page below 12px. Body copy 16px.
- Every interactive element must look different from static labels (border + hover + pressed state).
- Motion: transform + opacity only; `prefers-reduced-motion` and a Low motion toggle both still everything, including the hero tilt.
- The glasses screens: max ~44 characters per line, max 9 lines of body text — if copy does not fit, cut words, never shrink type.
- Footer text capped at ~68 characters per line.
