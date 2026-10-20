# Privacy Notice

**Draft for the 2 Bachillerato Study Extension.** Before public distribution, verify these statements against the final build and Google/Chrome Web Store requirements, and publish this notice at a stable public URL.

## Information the extension handles

- Notebook data, notes, and settings are stored in this browser using extension-local storage and IndexedDB.
- API credentials that the user enters are encrypted locally. The encryption key is also stored locally, so this does not protect credentials from someone with access to the browser profile or extension storage.
- When enabled and used, the extension can process page content for explicit page-reading or agent features. Its content script also checks page elements for CAPTCHA widgets so it can highlight a visible challenge and alert the user. CAPTCHA alerts report the detected provider/type and request manual completion; they do not include page text.
- Files and visible-screen content are processed when the user explicitly chooses file ingestion or screen OCR.

## When information leaves the browser

- When the user submits an AI prompt, the prompt and selected context are sent directly to the configured AI provider. Context can include notebook excerpts, uploaded-file text, Google Drive results, or page/screen content the user selected to read. The AI provider's privacy practices and retention terms apply.
- When the user starts Google web search, the search query is sent to Google's Programmable Search API.
- Google Drive and Docs requests are sent to Google when the user starts those features or uses notebook synchronization. Google OAuth permissions are described in the extension's consent flow.
- Custom AI providers receive requests directly from the browser according to the provider configuration.

The extension project does not operate a hosted application backend for these features.

## User choices and controls

Users choose when to send questions to an AI provider, run web or Drive searches, read a webpage, capture the screen, or process files. Users can remove the extension to stop its content script from running and can revoke Google access through their Google Account settings.

The extension requests access to all websites to provide automatic CAPTCHA-widget detection and page-agent capabilities. Detection is local to the page/extension; a CAPTCHA is never automatically solved or bypassed.

## Contact

Publisher privacy contact: **[RELEASE BLOCKER: add a monitored contact email or support URL]**

Public privacy policy URL: **[RELEASE BLOCKER: publish this notice at a stable HTTPS URL]**
