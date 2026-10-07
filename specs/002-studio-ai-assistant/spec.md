# Gang sheet builder — customer AI assistant

## Goal
A customer building a gang sheet can ask, in English or Roman Urdu, "will my designs fit on 22x10?", "what does a bigger sheet cost?", "do my designs have backgrounds?" and get a correct, short answer — without learning the builder.

## Principle
**The builder works out the numbers; the model reads and explains them.** Fits come from `lib/sheetNesting` (the same nesting Auto Nest uses), prices from the sizes the shop sells, backgrounds and DPI from `analyzeArtwork`. The model never does geometry or arithmetic, so it cannot promise a fit the builder cannot deliver.

## Phases
1. **Read-only assistant (this change).** Asks, explains, suggests; says which button to press. Changes nothing on the canvas.
2. **Actions.** Remove background, auto-build, copies, resize — each proposed as a confirm card and undoable (the admin copilot's `propose_action` pattern). The model's tool calls run in the browser through a studio actions interface.
3. **End to end.** "Build my sheet" through save and add to cart.

## Phase 1 — behaviour
- "Ask AI" in the builder's top bar opens a panel. Guests and signed-in customers.
- Each question carries a `StudioContext` (sheet, designs with DPI and background flag, warning counts, and a fit/price row per size the shop sells) built at the moment of asking.
- Replies follow the customer's language and script (English, Roman Urdu, mixed, Urdu script).
- Overflow: offers the nearest size that fits (with its price), smaller designs, or a second sheet.
- Backgrounds: asks once, naming the files; never assumes yes.
- Low DPI and warnings are surfaced.

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
- [ ] 20 Roman Urdu / English scenarios run against Haiku and Gemini Flash; pick by tool-free answer quality and cost (needs API keys).
- [ ] Phase 2 studio actions interface.
