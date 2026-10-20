# 2 Bachillerato Study Extension

Local-first Chrome Manifest V3 extension for advanced study workflows: custom editors, Google Docs sync, dyslexia training, AI routing, ingestion/OCR, and agentic automation.

## Stack

- React + Vite + TypeScript
- Tailwind CSS
- Dexie (IndexedDB)
- Chrome Extension Manifest V3

## Core Features by Phase

- Phase 0: Project setup, full Dexie schema, export/import backup safety.
- Phase 1: Notebook shell, dynamic tabs, feature toggles, offline queue status.
- Phase 2: Zero-dependency custom Math/Physics/Lengua editors with macros and AST.
- Phase 3: Help tab, global hotkey registry, manual toolbars, contextual popup help.
- Phase 4: Google OAuth + Drive folder/doc sync + human-speed typewriter writer.
- Phase 5: Local dyslexia typo injection with protected spans + clean backup/restore.
- Phase 6: Universal file ingestion (PDF/DOCX/TXT/MD/ZIP/RAR/images), full-page capture, OCR screen reader.
- Phase 7: AI provider/key pool with at-rest encryption, multi-model router, style pass constraints.
- Phase 8: Natural language doc commands, section-aware insertion, live highlighting while writing.
- Phase 9: Human-like web agent (watch/auto modes), anti-bot simulation, CAPTCHA handling pipeline.

## Prerequisites

- Node.js 22.13+
- npm
- Google Chrome

## Install

```bash
npm install
```

## Configure Google OAuth

The Chrome extension OAuth client ID is configured in both `manifest.json` and `public/manifest.json`. In Google Cloud Console, confirm the OAuth client is of type **Chrome Extension** and its Item ID matches the extension ID shown at `chrome://extensions`. Configure the OAuth consent screen, authorized test users (while in testing), and publish/verify consent as required by Google before public release.

Scopes already configured:

- `https://www.googleapis.com/auth/documents`
- `https://www.googleapis.com/auth/drive.file`
- `https://www.googleapis.com/auth/drive.readonly` (requested when you explicitly start a Drive search)

## Production release checklist

Treat this as a go/no-go gate for each public release. The repository can verify build and packaging details, but it cannot verify publisher-owned Google, Chrome Web Store, legal, or operational setup. Do not publish until every applicable item is checked.

### Publisher, privacy, and policy

- [ ] Replace the release-blocker placeholders in [PRIVACY.md](./PRIVACY.md) with a monitored contact and the final public HTTPS policy URL.
- [ ] Host the final privacy notice at that URL. Make sure the notice accurately covers local storage, backups, credential protection limits, page access, OCR, Google services, and each AI provider used by the release.
- [ ] Decide and document how users can delete their local data and revoke Google access; confirm the published notice describes the actual behavior.
- [ ] Complete the Chrome Web Store privacy/data-use disclosures and ensure they match the extension behavior and privacy notice.
- [ ] Get qualified advice on privacy, education, and child-directed-service requirements for the intended audience and distribution regions. This checklist is not legal advice.
- [ ] Provide a working support channel and a process to respond to privacy and security reports.

### Identity, OAuth, and permissions

- [ ] Set the release version and final name, description, icons, and minimum Chrome version in both `manifest.json` and `public/manifest.json`.
- [ ] Confirm the production Google OAuth client is publisher-owned, configured for the final Chrome extension ID, and approved for the scopes actually used. Verify the consent screen and any required Google verification.
- [ ] Review every permission and host permission against the release's shipped features. Remove access that is not needed.
- [ ] Decide whether automatic CAPTCHA detection on all sites is essential. If retaining `"<all_urls>"`, explain the user benefit and behavior clearly in the store listing and privacy notice; otherwise, narrow or remove the access and test the affected features.
- [ ] Verify the Chrome Web Store listing, OAuth consent disclosures, and privacy notice all describe the same data flows and permissions.

### Security and data handling

- [ ] Check source files and the production `dist/` output for private API keys, credentials, test data, and development-only configuration. Never ship provider secrets in the extension.
- [ ] Review credential handling with the documented limitation that the local encryption key is also stored in the browser profile; do not describe this as protection from someone with access to that profile.
- [ ] Verify file type/size and archive-entry limits, invalid-file errors, and failure handling for ingestion and OCR.
- [ ] Verify external requests go only to the intended providers, errors do not expose credentials or sensitive content, and user-selected content is sent only as described.
- [ ] Confirm backup export/import and deletion behavior in a clean profile; remind users that exported backups may contain private notebook data.

### Automated checks

Run from the repository root after installing the locked dependencies. Build before production validation because the validator checks `dist/`.

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run validate:production
```

- [ ] All commands pass on the release candidate.
- [ ] Review the production build output and confirm it contains the expected manifest, icons, UI, service worker, and content script.

### Manual release-candidate test

- [ ] Load the built `dist/` folder into a clean Chrome profile and check install, startup, side panel, and update/version behavior.
- [ ] Test notebook editing, subject management, local persistence, export/import, and deletion.
- [ ] Test offline behavior and queued/retried Google Docs sync, then verify Drive search and Google web search with production configuration.
- [ ] Test each supported AI provider, key setup/removal, request failures, and the exact context users choose to send.
- [ ] Test supported PDF/DOCX/text/archive/image ingestion, size-limit errors, OCR, screen capture, and page reading.
- [ ] Test watch and auto web-agent modes and CAPTCHA notifications. Confirm the extension does not solve or bypass CAPTCHA challenges.
- [ ] Check Chrome DevTools and extension errors during the test run; resolve release-blocking errors before submission.

### Store submission and launch

- [ ] Prepare accurate store description, screenshots, support contact, privacy URL, permission justifications, and data-use disclosures.
- [ ] Submit the exact build that passed the checks above; record its version and retain the tested package and source revision for rollback/support.
- [ ] Confirm the published listing and installed store build work after approval, including OAuth and any Google verification requirements.

## Run Development UI

```bash
npm run dev
```

## Build Extension

```bash
npm run build
```

Build artifacts appear in `dist/` including:

- `index.html`
- `background.js`
- `contentScript.js`

## Load in Chrome

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click Load unpacked
4. Select the `dist/` folder

## Workspace Navigation

- Use the top navigation for **Editor**, **Search**, **Analytics**, and **Help**.
- Expand notebook folders in the left sidebar to open a subject directly; use the circular arrow to collapse or reopen the sidebar.
- The top-right provider selector and API key field are available from any workspace view. Custom AI providers can be configured from the AI Assistant editor.
- Math and Physics now have separate 2º Bachillerato topic groups, templates, and symbol controls instead of the same generic toolbar. Mathematics covers algebra/matrices, calculus, functions, trigonometry, analytic geometry, and probability. Physics covers mechanics, fields, electromagnetism/circuits, waves/optics, and modern physics, with SI units and physical constants. Curriculum contents vary by autonomous community and school, so use these as editable starting points and check against your class syllabus.
- Use arrow keys or Tab to move between equation fields; Enter advances and Shift+Enter adds a note line. **Copy** copies one equation; **Copy all** copies the subject notes and equations as readable text. **Preview** shows clean typeset equations. Undo/redo are available with buttons or Ctrl+Z, Ctrl+Shift+Z, and Ctrl+Y.
- Notebooks can be renamed in settings, reordered, or deleted with their notes. Subjects can be renamed, archived with notes retained, restored, or permanently deleted from the archived-subject list.
- A linked Google Doc is treated as a mirror of the notebook: autosync replaces its contents with the latest notebook snapshot, including clearing it when all notes are deleted. Keep unrelated/manual content in a separate document.
- If Docs sync fails, pending changes remain saved locally and the sync indicator reports the failure; retry after resolving the displayed issue or restoring extension runtime/connectivity.
- Search matches saved notebook subject text and can send questions to the selected provider using supported uploaded files, matching Google Drive files, explicitly read webpage text, or visible-screen OCR as context.
- **Search web** runs Google Programmable Search through the extension service worker and shows results in the workspace; searching does not open a tab. Click a result only if you want to visit its page. Set up the Google Search API key and Search Engine ID in the Search workspace. Choose **Read current webpage** to explicitly provide active-page text to AI. Restricted Chrome pages cannot be read.
- Google Drive search requests read-only Drive access at first use and may require updated Google OAuth consent. It searches Drive full text and reads supported matching files. Drive search requires a configured `oauth2.client_id`.
- Analytics summarizes notebook, note, word, and pending-sync counts.
- The workspace is sized to the extension viewport; scroll within the main canvas or notebook tree when content exceeds the available space.

## Permissions and Host Access

Manifest includes:

- Permissions: `storage`, `activeTab`, `sidePanel`, `identity`, `tabs`, `alarms`, `notifications`
- Host permissions: `"<all_urls>"` + Google API domains

The all-sites access is currently used by the content script to detect visible CAPTCHA widgets and notify you, and by explicitly started page-reading/automation features. This broad access is intentional for automatic alerts on any site; the extension does not try to prevent CAPTCHA checks or solve them. A Chrome Web Store submission should explain this behavior and request only the access needed by the shipped features.

## Privacy and Data Handling

- Notebook content is stored locally in the extension's IndexedDB. API credentials are encrypted locally, but the encryption key is also stored on the device; this is not protection against someone who can access the browser profile.
- Data exports contain notebook content and encrypted API-key records, so keep backup files private. The local encryption key is not exported; after importing into a different browser profile, enter API keys again.
- Importing a backup replaces local data and discards pending Google Docs sync work from before the import. Make a fresh edit afterward to sync the restored notebook contents.
- When you explicitly ask an AI provider a question, the prompt and selected context (which may include notes, file text, Drive results, or page/screen text you chose to read) are sent to the selected third-party AI provider. Review that provider's terms and privacy policy.
- Google receives a query when you use Google web search. Google Drive/Docs access uses the OAuth scopes listed above and sends requests when you use sync or Drive features.
- The content script checks pages for CAPTCHA widget elements so it can show an alert. The CAPTCHA alert contains the detected provider/type and a manual-action message; it does not send page text to an AI provider.
- File reading/OCR happens when you choose those features. Page reading, screen capture, AI requests, Drive access, and web searches are user-initiated.
- File ingestion limits individual uploads to 50 MB, archive entries to 25 MB each, archives to 500 entries/100 MB expanded size, and batches to 50 files/100 MB total to prevent accidental resource exhaustion.
- Review the project privacy notice in [PRIVACY.md](./PRIVACY.md), replace its publisher contact placeholder, and host the final policy at a stable public URL before submitting to the Chrome Web Store.

## Hotkeys

- `Alt+S`: Screen Capture and OCR into current notebook
- Additional hotkeys are listed in the in-app Help/Instructions tab

## AI Provider Key Management

Use the AI panel to:

- Select provider (Gemini, Groq, OpenRouter defaults)
- Save one or more API keys
- Delete latest key for selected provider
- Add custom AI providers that expose an OpenAI-compatible chat completions API by entering a display name, HTTPS base URL, model IDs, and API key
- Send a prompt directly to the selected provider or keep using the existing automatic router

Keys are encrypted at rest via Web Crypto AES-GCM before saving in IndexedDB.
Custom provider requests are sent from the browser directly to that provider. Non-OpenAI-compatible APIs (for example, payment or SMS APIs) are not supported by the AI chat feature.

## Tab-Free Google Web Search

The Search workspace can query Google Programmable Search without opening a Google results tab:

1. Create a Programmable Search Engine and copy its Search Engine ID (`cx`).
2. In Google Cloud Console, enable the Custom Search JSON API for a project and create an API key. Google account/project eligibility, quotas, and API availability may apply.
3. Open **Search** in the extension, expand **Set up tab-free Google web search**, enter the API key and Search Engine ID, and save.
4. Type a query and select **Search web**. Results appear in the extension and are available as context for AI answers; only clicking a result link navigates to that page.

The extension service worker sends the request directly to Google's API; this is not a hosted backend. Google receives each query, and API quota/usage is subject to Google's terms. The API key is encrypted in extension-local storage, but because the encryption key is also stored locally, this is not protection against someone with access to the browser profile or extension storage. Restrict the key in Google Cloud Console where possible.

## Natural Command Examples

Use prompts like:

- Put this in a new doc called 'Thermodynamics Summary'.
- Edit the existing 'Physics' doc and add this to the bottom.
- Add this to the Thermodynamics section and highlight what is important.
- Type this into the 'History' doc but add my dyslexia typos at human speed.

These are parsed into structured actions:

- `CREATE_NEW_DOC` / `APPEND_TO_EXISTING` / `OVERWRITE_EXISTING`
- target document name
- style mode (`HUMAN_SPEED` or `INSTANT`)
- optional section heading insertion
- optional real-time highlighting

## Web Agent Modes

Available in AI Chat panel:

- Watch Mode (default): highlights target element and asks for permission before each action.
- Auto Mode: executes safe actions automatically, still asks for destructive actions (`delete`, `remove`, `cancel`, `purchase`).

Agent includes:

- Curved mouse movement with micro-jitter
- Gaussian typing delays
- Intentional typo/backspace behavior
- Smooth variable scrolling
- CAPTCHA handling that is explicitly human-in-the-loop: it watches for reCAPTCHA, hCaptcha, Cloudflare Turnstile, and generic CAPTCHA widgets. When an interactive challenge appears, it highlights the widget, focuses its tab, and shows a desktop notification asking you to solve it manually. The agent waits for the challenge to disappear before continuing. It does not attempt to prevent CAPTCHA checks, disguise automation, or solve/bypass a CAPTCHA.

## Development

```bash
npm run dev            # Vite dev server for the UI
npm run typecheck      # tsc --noEmit
npm run lint           # ESLint over src
npm test               # Vitest suite (unit + integration, fake-indexeddb backed)
npm run test:coverage  # Vitest with V8 coverage
npm run format         # Prettier write over src
npm run build          # Production bundle into dist/
```

Tests live in `src/__tests__/` and run with `fake-indexeddb` and `jsdom`, so the Dexie schema, migrations, sync queue, key pool encryption, and AI routing adapters are all covered without a browser.

## Data Safety

- Export All Data / Import Data are available from top controls.
- Dyslexia injection stores clean snapshots in `docBackups` before writing typos.

## Known Notes

- Some automation targets depend on site DOM/CSP behavior.
- Heavy file parsers (PDF.js, Tesseract, and unrar) are lazy-loaded chunks and only load when a matching file is ingested. DOCX text extraction uses the built-in ZIP/XML parser.

## Verification

Run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

All four should pass before loading unpacked.
