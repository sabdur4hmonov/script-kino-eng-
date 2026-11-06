# Kinotingla — local movie dictation trainer

A fully static Vite + React + TypeScript app for IELTS listening practice, with an Uzbek interface. No account, backend, paid API, movie upload, or remote asset dependencies.

## Run locally

Use Node.js **22.12 or newer** (Node 24 recommended).

```powershell
cd "D:\Coding projects\script kino"
npm ci
npm run dev
```

Open the URL Vite prints (normally `http://localhost:5173`). Choose your own MP4/MKV and English subtitles. `localhost` and HTTPS provide the secure context required for SHA-256 fingerprinting.

```powershell
npm run build
npm run preview
```

The production app is only `dist/`. It does not need a running Node server.

## Deploy to Cloudflare Pages

### Git integration (recommended)

1. In Cloudflare **Workers & Pages**, create a **Pages** project and connect GitHub repository `sabdur4hmonov/script-kino-eng-`.
2. Select production branch `main`, framework **React (Vite)**, root directory `/`.
3. Set build command **`npm run build`**, output directory **`dist`**, and environment variable **`NODE_VERSION=24`**.
4. Deploy. Subsequent pushes to `main` trigger another static build.

Cloudflare's official [build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/) lists `npm run build` and `dist` for React/Vite. No API keys or backend bindings are required by the app.

### Direct upload with Wrangler

```powershell
npm run build
npx wrangler login
npx wrangler pages project create kinotingla --production-branch main
npm run deploy
```

If that project name is taken, change `name` in `wrangler.toml` and `--project-name` in the deploy script. Authentication belongs to your local Cloudflare CLI; no credentials are bundled into the site. The build includes Cloudflare `_headers` with a restrictive policy (`connect-src 'none'`) to prevent production app network uploads.

## Practice

- Pick a local video. Playback uses `URL.createObjectURL(file)`; changing files revokes the old URL. The video itself is never stored in IndexedDB.
- Import `.srt`/`.vtt` or select an embedded text subtitle track. English tracks are preferred. The automatic transcription button is deliberately disabled.
- Shift the whole subtitle timeline by −0.5, −0.1, +0.1 or +0.5 seconds. A positive offset plays the cue later.
- **Ctrl + Space** replays the current cue with 0.2 seconds of padding. **Enter** checks, then advances. **Shift + Enter** allows a line break. Playback speed can be 0.75× or 1×.
- Answers stay hidden during a replay. Checking shows a word-level LCS comparison: green matches, red extra/wrong typed words, grey missing expected words. A substitution displays both the wrong word and the missing word.
- Checking ignores case and punctuation, expands common contractions, and accepts integer numerals as English number words (for example, `20` and `twenty`). British `one hundred and twenty` is accepted too. Ambiguous contractions use the common interpretation (`he's` → `he is`, `'d` → `would`).
- Click an answer or mistaken word to pronounce it with the browser's `speechSynthesis` using `en-US`. Available voices depend on your browser/OS.
- Edit the current cue, or open the cue list to jump to and edit any cue. Importing a replacement subtitle source starts a new set of attempts for this video; the current sync offset is retained.
- WPM is `(correct typed characters / 5) / active typing minutes`. Matching normalized words are credited with their original typed character lengths, so `20` does not earn the length of `twenty`. Only input activity contributes time; idle gaps of 2+ seconds, playback, checking, and unfocused time are excluded. Pasted answers count toward accuracy but not WPM. Accuracy is the number of matching normalized words divided by the larger word count.
- Android IME events (`229`, `Unidentified`, composition) identify phone input. Physical key events identify physical keyboards. Results have separate phone/physical-keyboard tabs. Touch devices default to phone until physical key events are observed. Detection is a browser heuristic, not hardware attestation.
- `visualViewport` resize/scroll events adjust the page for mobile keyboards and keep the focused answer field visible.

## Embedded subtitle support and honest limits

The installed **Mediabunny** version reads the movie through a lazy `BlobSource` to inspect media/audio tracks and codecs. Its [reading guide](https://mediabunny.dev/guide/reading-media-files) explicitly says subtitle reading is not currently supported. Therefore, this project supplements Mediabunny with small, bounded container readers rather than calling a nonexistent subtitle API:

| Container                  | Text subtitle formats                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| MKV                        | `S_TEXT/UTF8` (SRT), `S_TEXT/ASS`, `S_TEXT/SSA`, `S_TEXT/WEBVTT`, WebM WebVTT subtitle/caption blocks |
| Standard, unfragmented MP4 | `tx3g`/QuickTime timed text, `wvtt` (WebVTT), raw SRT/ASS/SSA sample entries                          |

The MKV parser skips media blocks and reads only text blocks, with bounded 256 KiB windows (up to 8 MiB for one exceptionally large field). The MP4 parser follows subtitle sample tables; 64-bit chunk offsets and simple edit-list offsets are supported. Movie bytes are never read into one giant array. Fingerprinting separately reads just the first and last 1 MiB plus file size, then computes SHA-256.

ASS/SSA styles and HTML-like tags are removed; subtitle content is rendered as React text, never executable HTML. Image subtitles (PGS/VobSub), encrypted/compressed subtitle tracks, laced subtitle blocks, fragmented MP4 subtitle streams, and complex MP4 edit lists are unsupported; upload an external SRT/VTT for these. MKV cues without a block/default duration use a 4-second fallback. WebVTT positioning/styling is intentionally ignored. Extraction is cancellable and limited to 200,000 text cues.

**Container/codec support is still browser-dependent.** A browser may reject MKV, HEVC video, AC3/DTS audio, or another codec even if subtitles can be extracted. Audio inspection uses native playback capability checks and displays an Uzbek warning; actual player errors also display a clear Uzbek message. There is no automatic transcoder. For broad compatibility, convert a copy locally to **MP4, H.264 video and AAC audio**. Burned-in subtitles cannot be hidden by a web app.

## Local storage and privacy

IndexedDB stores subtitles, text edits, offset, current cue, draft/checked answer, attempts with device classification, and mistaken-word counts. Sessions are keyed by `size:SHA256(first 1 MiB || last 1 MiB)`; renaming a video keeps the same session. Choose the same file again to resume (browsers do not let websites silently reopen local files).

Drafts save after a short 300 ms typing pause and on blur; other changes save immediately. Wait for the saved indicator before closing. Storage errors are visible and practice remains usable. Storage is scoped to this browser and origin; moving from localhost to a deployed domain starts a separate local history. Private browsing, cleared website data, browser eviction, or a full disk can remove/prevent saves. This edge fingerprint intentionally does not hash the middle of a multi-GB movie, so files with identical size and edges share a session.

There are no analytics, fetches, uploads, external fonts, or CDN scripts. Speech synthesis uses the platform's available voices; a platform may use a network voice. All interface copy is in `src/i18n/uz.ts`.

## Tests and test media

No personal movies were supplied. `test-media/` contains generated, copyright-free **12-second color + tone fixtures**, not a real dictation lesson. Keep your own test movies and subtitles there. The entire folder and common movie extensions are ignored by Git.

To regenerate fixtures, install a local `ffmpeg` executable and run:

```powershell
npm run test:fixtures
npm test
npm run test:e2e
```

Unit/integration tests cover SRT/VTT sanitization, LCS/normalization, bounded reads from a simulated 2 GB source, cancellation, fingerprints, IndexedDB restore, and actual generated MKV SRT/ASS/AC3 and MP4 timed-text extraction. Browser tests run desktop and Pixel-sized layouts using installed Microsoft Edge, covering local file selection, clip end timing, hotkeys, checking, edits, sync, resume, embedded English preference, phone stat separation, overflow and absence of external requests. For another browser, change `channel` in `playwright.config.ts` (or install Playwright Chromium).

Real 1–2 GB movies and a physical Android/iOS keyboard still merit a device check; simulated browser tests cannot prove every container/OS combination. Generated videos, screenshots, browser traces and build output stay ignored.
