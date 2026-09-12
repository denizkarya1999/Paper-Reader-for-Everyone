# Paper Reader for Everyone

**Version 1.1 · Developed by Deniz K. Acikbas**

A simple, installable Linux PDF reader. Highlight a passage or crop a figure, ask ChatGPT a question, and pin the answer as a sticky note on the PDF.

<img src="assets/icon.png" alt="Paper Reader for Everyone icon" width="80" />

## Install on Linux

Download `paper-reader-for-everyone_1.1.0_amd64.deb` from [Releases](https://github.com/denizkarya1999/Paper-Reader-for-Everyone/releases/latest).

Open it with your system's software installer, or run this command from your download folder:

```sh
sudo apt install ./paper-reader-for-everyone_1.1.0_amd64.deb
```

Launch **Paper Reader for Everyone** from your application menu.

The package targets **64-bit Intel/AMD Debian-based Linux**, including Ubuntu, Debian, and Linux Mint. It is a desktop application built with Electron; you do not need Node.js, a browser, or a running web server to use the installed app. This release does not contain an ARM64 package.

## Use it

1. Choose **Open PDF**, drag a PDF into the window, or try the included example.
2. Use **Highlight** to select text, or **Crop area** to select a figure, equation, table, or scanned passage.
3. Enter your OpenAI API key in the first-run setup, or open **Connection** later. Choose GPT-6 Astra, GPT-5.6 Sol, Terra, or Luna, or the previous GPT-4.1 models.
4. Type a question and press the arrow button or **Ctrl+Enter**.
5. Choose **Pin as sticky note**. In **Notes**, edit the answer, change its color, or return to its page.
6. Choose **Save PDF** to write an annotated copy using the native save dialog.

### Summarize or ask about the whole paper

Choose **Summarize paper** above the PDF, or **Whole paper** in the question panel. Then choose **Summarize whole paper** to request the main question, approach, findings, limitations, and takeaway with PDF page references. You can also enter your own question about the complete document.

The app sends the complete original PDF directly to OpenAI for these requests, including page images, figures, tables, scanned pages, and any annotations or metadata already in that file. It does not silently truncate to an abstract or a few pages. Newly added local notes are not included unless they were exported into the PDF you opened. Whole-paper requests require files smaller than 50 MB (50,000,000 bytes), can cost more than selection requests, and allow up to five minutes before timing out. Model context limits still apply; very long documents may need to be split. Cancel stops waiting for the response but does not undo content already sent or guarantee that OpenAI stops processing it.

Choose **Save as note on page 1** to keep a summary. It appears as a whole-paper note and is included in annotated PDF exports, with no artificial highlight. Reopen exports in version 1.1 or later to edit these notes.

### Models

GPT-5.6 Luna is the default for economical everyday reading. Select **GPT-6 Astra** under **Connection → Model** for the most capable option, or GPT-5.6 Sol / Terra for other tradeoffs. GPT-4.1 mini and GPT-4.1 remain available. Your chosen model is saved with your connection and shown above the question box, and answers retain the name of the model that generated them. Account access varies; the app reports an unavailable model instead of silently substituting another.

The model IDs and request settings were checked against [OpenAI's model catalog](https://developers.openai.com/api/docs/models) and [GPT-6 Astra guidance](https://developers.openai.com/api/docs/guides/latest-model). Modern reasoning models use low reasoning effort, with extra output space for reasoning and summaries. These choices are fixed in this release, not automatically updated when new models appear.

You can also use **Write a note** to add your own note without ChatGPT. Reading, selection, notes, and PDF export work offline.

## Local files and privacy

- PDFs and notes are saved automatically in the app's local IndexedDB library, under your system's application-data directory (`~/.config/paper-reader-for-everyone` on most Linux systems).
- The app has no sign-in, cloud library, analytics, or automatic document uploads.
- In **Selection** mode, only the selected text or cropped image, the page number, and your question are sent to OpenAI. In **Whole paper** mode, the complete original PDF and your question are sent. The interface identifies the active scope before you send.
- First-run setup asks for your OpenAI API key. **Remember my key on this device** is enabled by default when secure storage is available. The key is encrypted using Electron safeStorage and the Linux system keyring, saved in an owner-only (0600) connection file, and loaded automatically on later launches. Your selected model is also remembered.
- **Connection** lets you replace the key, change models, or **Remove key**. Leave the replacement field blank to keep the existing key. The decrypted saved key remains in the desktop main process; it is not returned to the PDF interface, saved in the PDF library, or exported with a PDF.
- GNOME Keyring or KWallet must be available and unlocked to remember keys. LXQt/LXDE use the Secret Service backend explicitly. The app refuses Electron's unprotected Linux fallback; when secure storage is unavailable, setup offers session-only use and explains how to enable persistence. Choosing session-only use removes any previously saved key. A locked or damaged saved connection can be replaced or removed without affecting PDFs and notes.
- Saving checks the key's format locally. Account validity and model access are checked by OpenAI when you send a question; setup does not make a billable request.
- API usage requires an OpenAI API account and billing; a ChatGPT subscription does not include API usage. [Get an API key](https://platform.openai.com/api-keys).
- The app requests `store: false` for generated responses. OpenAI's own [data controls and retention policies](https://developers.openai.com/api/docs/guides/your-data) still apply.
- Save annotated PDF copies to back up your work or move it to another device. Clearing or deleting the app's data directory removes the local library.

## PDF compatibility

Exports retain the original pages and add standard PDF highlight, square, text-note, and popup annotations. Readers such as Okular or Adobe Acrobat can open the sticky-note comments; some browser PDF viewers do not display every annotation type. The app also embeds its own note metadata so exported files can be reopened here for continued editing without duplicating notes.

This version supports PDFs up to **50 MB**. Open an unlocked copy of password-protected files. Text selection requires a text layer; use a crop for scanned pages. AI answers use the active scope: the selected passage or crop, or the complete PDF in Whole paper mode. Check answers against the source. Exporting modifies a copy of the PDF and does not preserve cryptographic signature validity. Existing annotations from other readers are preserved but are not editable in this app's Notes panel.

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
- **OpenAI Responses API**: text, image, and complete PDF questions. See [file input documentation](https://developers.openai.com/api/docs/guides/file-inputs) and [image input documentation](https://developers.openai.com/api/docs/guides/images-vision).

The 21-test suite covers export/reimport, Unicode, rotations, existing annotations, duplicate prevention, deletion, input validation, selected-content requests, full-PDF payloads, all model options, summary note round trips, cancellation, response limits, API error handling, and protected-key save/restore/replacement/removal. The system keyring was also checked locally with a test-only value; no OpenAI request was made. Live OpenAI responses require your own valid API key; tests use simulated API responses and do not incur API charges.

## License

[MIT](LICENSE). Copyright © 2026 Deniz K. Acikbas.
