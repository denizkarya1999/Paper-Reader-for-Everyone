# Paper Reader for Everyone

**Version 1.0 · Developed by Deniz K. Acikbas**

A simple, installable Linux PDF reader. Highlight a passage or crop a figure, ask ChatGPT a question, and pin the answer as a sticky note on the PDF.

<img src="assets/icon.png" alt="Paper Reader for Everyone icon" width="80" />

## Install on Linux

Download `paper-reader-for-everyone_1.0.0_amd64.deb` from [Releases](https://github.com/denizkarya1999/Paper-Reader-for-Everyone/releases/latest).

Open it with your system's software installer, or run this command from your download folder:

```sh
sudo apt install ./paper-reader-for-everyone_1.0.0_amd64.deb
```

Launch **Paper Reader for Everyone** from your application menu.

The package targets **64-bit Intel/AMD Debian-based Linux**, including Ubuntu, Debian, and Linux Mint. It is a desktop application built with Electron; you do not need Node.js, a browser, or a running web server to use the installed app. This release does not contain an ARM64 package.

## Use it

1. Choose **Open PDF**, drag a PDF into the window, or try the included example.
2. Use **Highlight** to select text, or **Crop area** to select a figure, equation, table, or scanned passage.
3. Open **Connection** and enter your OpenAI API key. Choose GPT-4.1 mini or GPT-4.1.
4. Type a question and press the arrow button or **Ctrl+Enter**.
5. Choose **Pin as sticky note**. In **Notes**, edit the answer, change its color, or return to its page.
6. Choose **Save PDF** to write an annotated copy using the native save dialog.

You can also use **Write a note** to add your own note without ChatGPT. Reading, selection, notes, and PDF export work offline.

## Local files and privacy

- PDFs and notes are saved automatically in the app's local IndexedDB library, under your system's application-data directory (`~/.config/paper-reader-for-everyone` on most Linux systems).
- There are no accounts, cloud storage, analytics, or automatic document uploads.
- When you ask a question, only the selected text or cropped image, the page number, and your question are sent directly from the desktop app to OpenAI. The complete PDF is not sent.
- Your OpenAI key stays in memory until the app closes. It is not stored in the library or exported PDF.
- API usage requires an OpenAI API account and billing; a ChatGPT subscription does not include API usage. [Get an API key](https://platform.openai.com/api-keys).
- The app requests `store: false` for generated responses. OpenAI's own [data controls and retention policies](https://developers.openai.com/api/docs/guides/your-data) still apply.
- Save annotated PDF copies to back up your work or move it to another device. Clearing or deleting the app's data directory removes the local library.

## PDF compatibility

Exports retain the original pages and add standard PDF highlight, square, text-note, and popup annotations. Readers such as Okular or Adobe Acrobat can open the sticky-note comments; some browser PDF viewers do not display every annotation type. The app also embeds its own note metadata so exported files can be reopened here for continued editing without duplicating notes.

This version supports PDFs up to **50 MB**. Open an unlocked copy of password-protected files. Text selection requires a text layer; use a crop for scanned pages. AI answers are based on the selection, not the full paper. Check answers against the source. Exporting modifies a copy of the PDF and does not preserve cryptographic signature validity. Existing annotations from other readers are preserved but are not editable in this app's Notes panel.

## Build from source

Requirements: Linux, Node.js **22.13 or newer**, and npm. A graphical Linux session is needed to launch Electron. Package generation may download Electron and its Linux packaging tools.

```sh
git clone https://github.com/denizkarya1999/Paper-Reader-for-Everyone.git
cd Paper-Reader-for-Everyone
npm ci
npm run typecheck
npm test
npm start
```

Create the Debian installer:

```sh
npm run package:deb
```

The installer is written to `release/`. `npm run package:dir` makes an unpacked desktop build. `npm run dev` previews the renderer for layout development only; native dialogs and ChatGPT run in the Electron app.

## Implementation

- **Electron**: a sandboxed, isolated renderer, narrow validated IPC bridge, native open/save dialogs, and direct OpenAI requests in the main process.
- **React + TypeScript + Vite**: the desktop interface.
- **PDF.js**: page rendering, text selection, and cropped image capture, with all workers, fonts, character maps, and decoders packaged locally.
- **pdf-lib**: interoperable PDF annotations and editable note round trips.
- **IndexedDB**: device-local documents and notes.
- **OpenAI Responses API**: text and image questions. See [image input documentation](https://developers.openai.com/api/docs/guides/images-vision).

The test suite covers export/reimport, Unicode, rotations, existing annotations, duplicate prevention, deletion, input validation, selected-content requests, and API error handling. Live OpenAI responses require your own valid API key; tests use simulated API responses and do not incur API charges.

## License

[MIT](LICENSE). Copyright © 2026 Deniz K. Acikbas.
