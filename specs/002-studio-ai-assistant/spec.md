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

## Model and cost
- Claude Haiku 4.5 by default for this assistant (`COPILOT_STUDIO_MODEL` overrides; other providers use their own default). The owner copilot keeps its model.
- Limits per day: `COPILOT_STUDIO_USER_LIMIT` (60) per signed-in user, `COPILOT_STUDIO_GUEST_LIMIT` (15) per guest address, plus the brand's `COPILOT_DAILY_LIMIT`.
- No tools in Phase 1: one model call per question. Fits are skipped above 300 designs on a sheet.

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
