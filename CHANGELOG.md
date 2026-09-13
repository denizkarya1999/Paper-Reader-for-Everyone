# Changelog

## 1.3 — 2026-09-12

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
