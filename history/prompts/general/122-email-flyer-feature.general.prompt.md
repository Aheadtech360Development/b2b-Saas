---
id: 122
title: Email Flyer Feature End to End
stage: general
date: 2026-04-28
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: manual
labels: ["email-flyer","pdf-upload","recaptcha","admin-products","email"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/admin/products.py
  - backend/app/api/v1/products.py
  - backend/app/services/email_service.py
  - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx
  - frontend/src/app/(customer)/products/[slug]/email-flyer/page.tsx
  - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx
tests:
  - none
---

## Prompt

On the product page we have added an Email Flyer button, but it is not functional yet. So now we will define what should happen when this button is clicked. One important thing is that this flyer will be different for each product, so in the admin dashboard, inside products, add an option to import the email flyer. We will import a PDF, and then whenever someone uses the email flyer option, the PDF of that specific product will be shared.

When the Email Flyer button is clicked, a new page should open with the following:
- Heading: Email Product
- A box with fields: *From, *To (Separate multiple addresses with commas), cc:, *Subject, Message (1000 character max)
- Recaptcha checkbox (real, same as resend-registration-emails)
- 3 buttons: Preview Email, Send Email, Download PDF

## Response snapshot

**Backend — `backend/app/api/v1/admin/products.py`**:
- Added `POST /admin/products/{product_id}/upload-flyer`: accepts PDF file, stores to S3 (or local `/app/media/flyers/`), upserts `ProductAsset(asset_type="flyer")` (deletes old one first), returns `{ url, file_name, id }`
- Added `DELETE /admin/products/{product_id}/flyer`: removes existing flyer asset

**Backend — `backend/app/api/v1/products.py`**:
- Replaced `POST /{product_id}/email-flyer`: now accepts JSON body `{ from_email, to, cc, subject, message, recaptcha_token }`; verifies reCAPTCHA; parses comma-separated To/CC; sends branded email with Download Flyer CTA link to each recipient; reply_to set to from_email

**Backend — `backend/app/services/email_service.py`**:
- Added `reply_to: str | None = None` param to `send_raw()` and `_send_via_resend()`
- Passes `reply_to` as `params["reply_to"] = [reply_to]` in Resend call

**Admin product edit page — `frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx`**:
- Added `flyerInputRef`, `uploadingFlyer`, `flyerMsg` state
- Added `handleFlyerUpload()`: calls `POST /api/v1/admin/products/{id}/upload-flyer` via `apiClient.postForm`
- Added `handleDeleteFlyer()`: calls `DELETE /api/v1/admin/products/{id}/flyer`
- Added "MARKETING FLYER" sidebar card (before Danger Zone): shows current flyer filename + View link + × remove; file picker (PDF only) + "Upload Flyer (PDF)" / "Replace Flyer (PDF)" button; status message

**New page — `frontend/src/app/(customer)/products/[slug]/email-flyer/page.tsx`**:
- Fetches product via `productsService.getProductBySlug(slug)` to get name, hasFlyer, flyerUrl
- Pre-fills From with logged-in user email; Subject with "Product Flyer — {name}"
- Form: From*, To* (comma-sep hint), CC, Subject*, Message (1000 char counter)
- ReCAPTCHA (dynamic import, same pattern as resend-emails page, uses `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`)
- Preview Email button: opens modal with rendered email HTML preview (no API call)
- Send Email button: `POST /api/v1/products/{id}/email-flyer` with all fields; disabled if no flyer
- Download PDF link: `GET /api/v1/products/{id}/download-flyer` in new tab
- Shows error if no flyer uploaded for this product

**`ProductDetailClient.tsx`**:
- Simplified `handleEmailFlyer()` to `router.push(`/products/${slug}/email-flyer`)`
- Removed `emailingFlyer` state (no longer async)
- Cleaned up button styles (removed loading/disabled states that depended on emailingFlyer)

## Outcome

- ✅ Admin can upload a per-product PDF flyer from the product edit page (Marketing Flyer card)
- ✅ Email Flyer button navigates to /products/{slug}/email-flyer page
- ✅ Page shows full compose form with real reCAPTCHA
- ✅ Preview modal shows email HTML before sending
- ✅ Send Email sends to all To/CC recipients with reply-to set to From field
- ✅ Download PDF downloads the flyer directly
- 🧪 Tests: None automated
- 📁 Files: 6 files modified/created
- 🔁 Next prompts: None identified
- 🧠 Reflection: Product assets (asset_type="flyer") were already modeled and the download endpoint already existed — only upload and compose UI were missing

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results: none
- Prompt variant: null
- Next experiment: null
