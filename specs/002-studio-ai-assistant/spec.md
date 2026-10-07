# Gang sheet builder — customer AI assistant

## Goal
A customer building a gang sheet can ask, in plain English, "will my designs fit on 22x10?", "what does a bigger sheet cost?", "do my designs have backgrounds?" and get a correct, short answer — without learning the builder.

## Principle
**The builder works out the numbers; the model reads and explains them.** Fits come from `lib/sheetNesting` (the same nesting Auto Nest uses), prices from the sizes the shop sells, backgrounds and DPI from `analyzeArtwork`. The model never does geometry or arithmetic, so it cannot promise a fit the builder cannot deliver.

## Phases
1. **Read-only assistant (done).** Asks, explains, suggests.
2. **Builds the sheet (done).** The model calls `propose_plan` with what the customer asked for (designs by ref, total copies, a width or height, a sheet size, backgrounds to remove, add to cart). The server checks it against the sheet and returns it; the builder shows it as a card with its own layout and price, and runs it on one press: backgrounds → build (Auto Nest rules) → save and cart. One undo puts the sheet back.
3. **Next.** Quantity of sets, text designs, and a per-shop on/off switch in the admin.

## Phase 2 — the easy path
- Builder opens empty → the assistant opens itself (once per browser; closed stays closed).
- 📎 in the chat uploads designs straight onto the sheet with no background pop-up, and the assistant is told at once, so it asks: how many, how big, remove the background?
- Plan card: label, steps, "N designs on K × size — $price", low-DPI and overflow warnings, a design too big (button disabled). When the sheet overflows or a cheaper size holds it all, a second button offers that one sheet instead, with its price.
- After a build, "Add to cart" is one tap (no model call).
- A newer plan retires the one before it; the model is told on the next question whether its plan was pressed.
- Backgrounds are only flagged on files the builder actually read (`alphaChecked`); designs reopened from an order are "unknown", not "has a background".

## Phase 1 — behaviour
- "Ask AI" in the builder's top bar opens a panel. Guests and signed-in customers.
- Each question carries a `StudioContext` (sheet, designs with DPI and background flag, warning counts, and a fit/price row per size the shop sells) built at the moment of asking.
- Replies are always in plain English, whatever language the customer writes in.
- Overflow: offers the nearest size that fits (with its price), smaller designs, or a second sheet.
- Backgrounds: asks once, naming the files; never assumes yes.
- Low DPI and warnings are surfaced.

## Phase 3 — asks on every upload, knows sizes, full control
- **Every upload is asked about first** (a card from the builder, not the model): "Background found on X — remove it? Yes / No" (only when the file has one) and "Put it on the sheet now? Yes / Not yet". Nothing happens until both are answered; then the assistant is told what was uploaded and what became of it, and asks what is left (copies, size). While the assistant is open this covers the clip, the Upload panel and drops on the canvas; closed, the builder behaves as before.
- **Size knowledge**: each design is sent with `size_now` and `copies_that_fit` — about how many copies of it fit on the open sheet alone at 1.5″–12″ (and its current width), with the dpi at each, up to the first width that no longer fits. The prompt tells the model to warn of overflow before proposing and to offer a width where they fit, fewer copies, or a bigger sheet.
- **Fill the sheet**: a build item may `fill` instead of giving copies; the builder counts exactly how many fit beside everything else by laying them out (`fillCount`), on a roll at its cut length.
- **Spacing and sets**: `build.gap_in` (0–3″) sets the margin between designs; `sets` (1–100) sets how many of the sheet are printed.

## Phase 3b — layout, margins, overflow, the builder's tools
- **Layout**: a build may be `standard` (Auto Nest's tight packing) or `cutting` (Auto nest for cutting's rows). The assistant asks once, before the first build, with the usual answer first.
- **Margins**: `gap_in` is the image margin (between designs) and `sheet_margin_in` the sheet margin (at the edges, never under the shop's bleed). The context sends both, and the least allowed.
- **Overflow**: besides the bigger sheet, the card offers "Shrink to fit one sheet" (`shrinkToFit`: the largest scale, to the percent, at which it all goes on one sheet of this size, never under 25%), and the Do-it button says how many sheets it will take and what that costs. The prompt has the model explain the ways out before proposing.
- **Tools**: the prompt names the builder's own tools (Uploads, Designs, Gallery, Add Text, Settings, the image editor's tabs, Auto Build, Auto Nest, Auto nest for cutting, Auto fill sheet, Add new sheet, Preview, Save) so it can tell people how to do things by hand.
- **Fixes**: signing in from Save & Add to Cart now carries on into the cart (save read a stale signed-out flag and opened the form again); a link styled `ui-btn` keeps white text inside a shop drawn by the website builder; a background that cannot be removed is reported in the chat and to the model.

## Phase 4 — fewer tokens, every tool in reach
- **Prompt cache**: the system prompt holds only what is the same all session (instructions, sizes, the shop's ready-made designs, the gallery) and carries a cache mark, so it and the tool are read at a tenth of the price after the first question. The sheet as it is now goes with the newest question (`context_note`), and the turn before it carries a second mark, so the earlier conversation is read from the cache too. The system prompt is checked to stay byte-identical whatever the sheet holds.
- **One call per plan**: an accepted `propose_plan` ends the answer (`stop_when`); the model writes its line before the call. A refused plan still gets a second turn to fix it.
- **Smaller context**: no pixel sizes (the dpi they come to is sent instead).
- **Every tool in reach**: `add_designs` (the shop's ready-made designs s1…, the gallery g1…), `add_text` (text, colour name or hex, bold), `open_editor` (enhance, crop, removecolor, colors, halftone), `save`. New designs are added in a plan of their own; the assistant is then told and builds with their real sizes, so the card is never worked out on a guess. Moving, resizing, rotating, undo and preview stay by hand, and the prompt names their buttons.
- **Estimate**: per question ~3,000 tokens read from the cache and ~750 at full price, one call; about $0.08 a sheet on Sonnet 5.5 (was ~$0.20), mostly output.

## Model and cost
- **Claude Sonnet 5.5** (`claude-sonnet-5-5`, $2 / $10 per MTok) is the default for this assistant on Claude (`COPILOT_STUDIO_MODEL` overrides; other providers use their own default). Chosen over Haiku 4.5 because the assistant now reads the room left at every size, warns of overflow before proposing and fills in a nested plan.
- **Effort `low`** (`COPILOT_STUDIO_EFFORT`, `COPILOT_EFFORT`), sent only to models that take it (not Haiku 4.5). Thinking counts towards `max_tokens`, raised to 8000.
- **Refusals**: `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) on Sonnet 5.5 / Opus 5.5 / Opus 5 / Fable 5.1; a final `stop_reason: "refusal"` is answered with a plain sentence. Across a fallback, the declined model's thinking and tool calls are not echoed back.
- **Estimated cost** (~6,500 input and ~700 output tokens per question, ~10 questions a sheet): about $0.20 a sheet on Sonnet 5.5, $0.08 on Haiku 4.5. Measure from usage before relying on it.
- Limits per day: `COPILOT_STUDIO_USER_LIMIT` (60) per signed-in user, `COPILOT_STUDIO_GUEST_LIMIT` (15) per guest address, plus the brand's `COPILOT_DAILY_LIMIT` (200) for the builder.

## Constraints
- Reuses `run_copilot`; plan-gated by the existing `ai_agent` feature on `/api/v1/copilot`.
- File names are customer-supplied: the prompt marks the data block as untrusted. With no tools and no write path, injection has nothing to act on.
- Out of scope in Phase 1: any change to the sheet, uploads, ordering.

## Acceptance
- [x] `POST /api/v1/copilot/studio` works for guests, limited per person.
- [x] Studio model resolves to Haiku on Anthropic; owner copilot unchanged.
- [x] `buildStudioContext` / `fitOn` tested (fixed sheet, overflow, too-wide, roll length and price, minimum length, copies folded, background and DPI flags).
- [ ] 20 English scenarios run against Gemini Flash-Lite, Gemini Flash and Haiku; pick by plan quality and cost (needs API keys).
- [x] `propose_plan` validated server-side (unknown design, copies 0-500, unknown size, duplicate item, empty build, non-picture background, empty cart) — 20 backend tests.
- [x] `planBuild` / `betterSize` — spacing, edges, overflow pricing, too-big, roll length and minimum.
- [x] Phase 3: upload card (yes/yes, no/not yet, no-background file, Upload panel routed while open, unchanged while closed), fill (exact count, smaller fills more), spacing and sets applied; `capacity` and `fillCount` checked against the real nesting.
- [x] Real builder (vitest + testing-library): card before change, one-press build, resize keeps shape, overflow → bigger sheet or second sheet, too-big refused, undo, model told the outcome, newer plan retires older, 📎 upload tells the model, background removed before build.
