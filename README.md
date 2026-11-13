# Kinotingla — local movie dictation trainer

A fully static Vite + React + TypeScript app for IELTS listening practice, with an Uzbek interface. The app processes media locally with no account, backend, paid API, or media upload. The browser downloads public model and decoder assets as needed.

## Run locally

Use Node.js **22.12 or newer** (Node 24 recommended).

```powershell
cd "D:\Coding projects\script kino"
npm ci
npm run dev
```

Open the URL Vite prints (normally `http://localhost:5173`). Drop an MP4, MKV, WebM, MOV, MP3, M4A, WAV, or OGG file, or paste a direct HTTPS media URL. `localhost` and HTTPS provide the secure context required for SHA-256 fingerprinting.

```powershell
npm run build
npm run preview
```

The production app is only `dist/`. It does not need a running Node server.

## Deploy to Cloudflare Pages

### Git integration (recommended)

1. Sign in to the Cloudflare dashboard on the Free plan and open **Workers & Pages**.
2. Select **Create** → **Pages** → **Connect to Git**. Choose GitHub and authorize access to the repository if prompted.
3. Select `sabdur4hmonov/script-kino-eng-` and continue to setup. Choose a project name and set the production branch to `main`.
4. Set the build command to `npm run build` and the build output directory to `dist`. Leave the root directory at the repository root.
5. Under **Environment variables**, add `NODE_VERSION` with value `24`.
6. Select **Save and Deploy**. Open the generated `https://<project-name>.pages.dev` address. That default subdomain works on the Free plan. Subsequent pushes to `main` trigger a new build.

Cloudflare's official [build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/) lists `npm run build` and `dist` for React/Vite. No API keys or backend bindings are required by the app.

### Direct upload with Wrangler

```powershell
npm run build
npx wrangler login
npx wrangler pages project create kinotingla --production-branch main
npm run deploy
```

If that project name is taken, change `name` in `wrangler.toml` and `--project-name` in the deploy script. Authentication belongs to your local Cloudflare CLI; no credentials are bundled into the site. The build includes Cloudflare `_headers` for WASM and HTTPS media access. Whisper weights and ONNX Runtime are fetched on demand. The matching runtime binaries and FFmpeg core are served from jsDelivr so no deployed asset exceeds the Pages 25 MiB limit.

## Practice

- Pick a local video or audio file. Playback uses `URL.createObjectURL(file)`. Direct links need CORS, byte ranges, and an exposed `Content-Range` header. Platform share pages must be opened separately to obtain a local file.
- Whisper starts automatically. To start sooner, select an embedded English text track or import `.srt`/`.vtt`. When both sources are available, the app shows disagreements and lets you choose.
- Shift the whole subtitle timeline by −0.5, −0.1, +0.1 or +0.5 seconds. A positive offset plays the cue later.
- **Ctrl + Space** replays the current cue with 0.2 seconds of padding. **Enter** checks, then advances. **Shift + Enter** allows a line break. Playback speed can be 0.75× or 1×.
- Answers stay hidden during a replay. Checking shows a word-level LCS comparison: green matches, red extra/wrong typed words, grey missing expected words. A substitution displays both the wrong word and the missing word.
- Checking ignores case and punctuation, expands common contractions, and accepts integer numerals as English number words (for example, `20` and `twenty`). British `one hundred and twenty` is accepted too. Ambiguous contractions use the common interpretation (`he's` → `he is`, `'d` → `would`).
- Click an answer or mistaken word to open its actions. **Talaffuz** uses the browser’s `speechSynthesis` with `en-US`. **Tarjima** opens Google Translate in a new tab.
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

**Container/codec support is still browser-dependent.** A browser may reject MKV, HEVC video, AC3/DTS audio, or another codec even if subtitles can be extracted. Audio inspection uses native playback capability checks and displays an Uzbek warning; actual player errors also display a clear Uzbek message. For local AC3, E-AC3 and DTS files, the app can load FFmpeg WASM and transcode short audio windows. Video playback still depends on browser support. Remote sources with unsupported codecs must be saved locally first. For broad compatibility, convert a copy locally to **MP4, H.264 video and AAC audio**. Burned-in subtitles cannot be hidden by a web app.

## Local storage and privacy

IndexedDB stores subtitles, text edits, offset, current cue, draft/checked answer, attempts with device classification, and mistaken-word counts. Sessions are keyed by `size:SHA256(first 1 MiB || last 1 MiB)`; renaming a video keeps the same session. Choose the same file again to resume (browsers do not let websites silently reopen local files).

Drafts save after a short 300 ms typing pause and on blur; other changes save immediately. Wait for the saved indicator before closing. Storage errors are visible and practice remains usable. Storage is scoped to this browser and origin; moving from localhost to a deployed domain starts a separate local history. Private browsing, cleared website data, browser eviction, or a full disk can remove/prevent saves. This edge fingerprint intentionally does not hash the middle of a multi-GB movie, so files with identical size and edges share a session.

The app sends no video, audio, text or transcripts to an inference server. HTTPS media links are read from their origin. Model files and decoder assets come from Hugging Face and jsDelivr. Speech synthesis uses the browser’s available voices. All interface copy is in `src/i18n/uz.ts`.

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

## Automatic transcription and evaluation

The app defaults to the English Base model when WebGPU is available and Tiny with WASM otherwise. You can choose Tiny, Base, or Small from the subtitle settings. Downloads are cached where the browser permits. Clearing site data can cause a new download. Each inference reads up to roughly 30 seconds of mono audio and saves its results in IndexedDB. The scheduler aims for about five minutes ahead of the active cue. It stops scheduling new work while hidden and lets an active window finish so it can be saved. Use the cue list to prioritize a different time.

Confidence comes from model token probabilities where the runtime exposes usable logits. Scores are estimates. Silence, repeated output, common hallucinations and short replies are filtered heuristically. Words without confidence data are not assigned a fabricated probability. The model is English-only and may still transcribe non-English audio inaccurately.

For developer evaluation, install Node.js 24 plus native `ffmpeg` and `ffprobe` on PATH. Add `test-media/eval/clip.wav` and a matching `test-media/eval/clip.srt`. Each media file needs a reference with the same base name. The evaluator uses bounded native FFmpeg decoding and the same Transformers.js model and sentence filter on the CPU.

```powershell
npm run eval:whisper
npm run eval:whisper -- tiny
```

The first command runs all three models. Use model names as arguments to select a subset. It prints word error rate (substitutions, insertions and deletions divided by reference word count) per file, aggregate WER per model, and wall-clock seconds per audio minute including model initialization. Keep evaluation clips and subtitles in the Git-ignored directory.
