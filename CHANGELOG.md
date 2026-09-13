# Changelog

## 1.5.1 — 2026-09-13

- Add **Read this page aloud** to the PDF toolbar, using the same natural American English AI voice, pause, resume, and stop controls.
- Read selectable page text directly in its stored reading order. For pages with no text layer, recognize text from the current page image with AI before speaking; normal API charges apply.
- Label playback with its PDF page number and stop it when switching pages or documents. Cancel page preparation and ignore late recognition results.
- Keep all version 1.5 features: multiple crops, drawing, AI-answer speech throughout the app, and automatic GitHub release updates.

## 1.5.0 — 2026-09-13

- Add **Crop & draw**, with a pen, translucent highlighter, arrows, circles, four ink colors, adjustable line sizes, undo, redo, and clear.
- Send marked crops to ChatGPT alongside the complete PDF. Keep editable drawings in saved chats and ZIP bundles, and export native drawing annotations with pinned PDF notes.
- Add **Read aloud** for AI answers, saved chats, notes, flashcards, focusing tips, and focus-cat quizzes, using OpenAI’s natural Marin voice with an American English accent.
- Include pause, resume, and stop controls shared across the reader and cat. Read long answers in ordered segments; starting another answer cancels previous playback.
- Use the existing OpenAI API connection for speech only when requested. Spoken text uses API credits; audio stays in memory.
- Automatically check GitHub releases at startup and every four hours, download and verify Linux updates, and offer **Install and restart**. Change this preference or check manually in **Settings → App updates**.
- Publish future tagged Linux releases with updater metadata after automated checks pass.
- Preserve existing libraries, notes, chat histories, connection settings, and older single/multiple-crop bundles.

## 1.4.0 — 2026-09-12

- Collect up to 10 numbered crops from the same PDF across pages and zoom levels, with previews, page links, individual removal, and clear-all.
- Send all selected crops together with one question and the complete PDF, labeling each crop with its source page.
- Retain multiple crops in saved chats and portable PDF/chat bundles, including every image in HTML transcripts.
- Pin one answer to every selected page and preserve crop outlines and notes through PDF export and reopening.
- Keep older single-crop chats, notes, and bundles compatible; enforce crop count, individual size, and combined-size limits.
- Add request, export, bundle, and desktop interaction regression tests for multiple crops.


## 1.3.0 revision 2 — 2026-09-12

- Show the full Paper Reader for Everyone name in the header and the exact name plus Version 1.3.0 in the footer.
- Add Focusing Tips for Readers with optional ADHD, AuDHD, autism, and anxiety preferences, paper/book reading, and adjustable session time.
- Generate practical reading tips and ask follow-ups about focus and motivation through the saved ChatGPT connection, without attaching a PDF.
- Save focusing conversations separately on this device, with individual deletion, clearing, interruption recovery, and bounded follow-up context.
- Add ten app screenshots to the repository gallery.
- Keep the displayed app version at 1.3.0; Debian package revision 2 upgrades the previous installer.

## 1.3 — 2026-09-12

- Include the complete PDF with highlighted text and cropped-area questions, connecting answers to relevant material elsewhere with requested page references.
- Start in Whole paper mode with a ready question box; no selection is needed, and clearing a selection returns to general questions.

- Add an About Us page showing the app name, package version, developer, programming languages, and OpenAI Codex development credit.
- Add a Settings page combining appearance, ChatGPT connection, focus-cat preferences, and local-data controls.
- Add persistent light and dark modes, including the cat’s reminder bubble, while preserving original PDF colors.
- Generate 1–50 PDF-grounded flashcards with revealable answers, source pages, saved sets, and pin-as-note actions.
- Generate larger sets in batches and keep completed cards after interruption or cancellation.
- Include flashcards in PDF + chats ZIP bundles and readable transcripts; preserve compatibility with existing bundles.
- Keep reading state when switching between the reader and the new pages.

## 1.2 — 2026-09-12

- Save chat history with each PDF, including questions, answers, crops, models, and cancelled or interrupted requests.
- Review, reopen, pin, or delete individual chats; clear one PDF’s chats or all chat history on this device.
- Export and reopen a portable ZIP with an annotated PDF, readable HTML transcript, and JSON chat data.
- Preserve existing PDFs, notes, and protected API keys on upgrade.
- Add an optional walking desktop cat with a name, three coats, custom reminder minutes, Never, and disable controls.
- Add offline focus check-ins and opt-in ChatGPT quizzes from the open PDF, with revealable answers and saved quiz history.
- Pause reminders during sleep, cancel stale quiz requests, and prevent late answers from restoring deleted history.

## 1.1 — 2026-09-12

- Add GPT-6 Astra and GPT-5.6 Sol, Terra, and Luna; use Luna as the everyday default.
- Add Whole paper mode for complete PDF summaries and document-wide questions, including figures and scanned pages.
- Make the active model and the content being sent to OpenAI visible before sending.
- Save whole-paper summaries as editable notes on page 1 and preserve them through PDF export and reopening.
- Allow more time and output space for reasoning models and complete-paper requests.
- Handle cancellation, context limits, unavailable models, and incomplete answers clearly.
- Add first-run API-key setup, keyring-protected storage, automatic connection restore, and key replacement/removal.
- Support GNOME Keyring on LXQt/LXDE and clearly handle unavailable or locked keyrings.
- Keep the existing local library and GPT-4.1 options compatible.

## 1.0 — 2026-09-12

First Linux desktop release of Paper Reader for Everyone, developed by Deniz K. Acikbas.

- Open local PDF files with a native file picker or drag and drop.
- Select text or crop figures, equations, and scanned pages.
- Ask ChatGPT through OpenAI's Responses API with your own API key.
- Pin answers as editable yellow, blue, or pink sticky notes.
- Write your own notes without an internet connection.
- Automatically keep PDFs and notes on this device.
- Save annotated PDFs with native highlights and sticky-note annotations.
- Reopen exported PDFs and continue editing the app's notes.
- Install on Debian-based Linux systems using the amd64 `.deb` package.
