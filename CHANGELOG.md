# Changelog

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
