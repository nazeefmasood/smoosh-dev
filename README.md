# Smoosh

**Smoosh** is a privacy-first image toolkit that runs entirely in your browser. Edit, compress, convert, and clean up images — comparing formats side by side and batching a whole folder at once — all without your files ever leaving your device.

Smoosh is a fork of [Squoosh] by Google Chrome Labs, extended into a multi-tool image workspace with a shared, consistent UI.

## Tools

All tools share one top nav and run 100% client-side. They live under `/editor?tool=<name>`.

### Edit

A Canva-style interactive editor combining crop, resize, rotate, and flip on one live canvas, with a tool rail, contextual properties panel, and a filmstrip for switching between images. Operations compose (rotate → flip → crop → resize) before export.

### Compress

Re-encode and convert images between modern formats, tuning quality with live before/after previews.

- **Formats:** JPEG, PNG, WebP, AVIF, JXL, WebP2 (WP2), and GIF
- **Side-by-side comparison** to weigh quality against file size
- **Batch mode** — drop a whole folder and export in multiple formats at once

### Watermark remover

Remove watermarks from Gemini-generated images using **reverse alpha blending** — a mathematically exact inversion of the blend operation, not AI inpainting. If no watermark is detected, the output is left unchanged. Batch supported, fully local.

### EXIF strip

Remove EXIF, GPS, camera, IPTC, and timestamp metadata. JPEG and PNG are rewritten at the byte level, so pixels and quality are preserved exactly (lossless), and a before/after list shows precisely what was removed.

### Favicon

Turn text, an emoji, or an image into a complete favicon package — `favicon.ico` (16/32/48), `favicon-16/32.png`, `apple-touch-icon`, Android 192/512 icons, and a `site.webmanifest` — zipped and ready, with a copy-paste HTML snippet. A **Check site** mode also inspects any deployed site's declared favicons.

## Privacy

Smoosh never sends your images to a server. All processing — editing, compression, conversion, metadata stripping, and watermark removal — happens locally in your browser via WebAssembly codecs and canvas. (The favicon **Check site** feature is the one exception: it fetches the target URL through a small serverless function to read that site's markup.)

Smoosh uses Google Analytics to collect anonymous usage data:

- [Basic visitor data](https://support.google.com/analytics/answer/6004245?ref_topic=2919631)
- Before/after image size values
- For the installed PWA: installation type, time, and date

## Developing

1. Clone the repository:
   ```sh
   git clone git@github.com:nazeefmasood/smoosh-dev.git
   cd smoosh-dev
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Build the app:
   ```sh
   npm run build
   ```
4. Start the development server:
   ```sh
   npm run dev
   ```

## Contributing

Contributions are welcome. See the [contributing guide](/CONTRIBUTING.md) to get started.

## License

Licensed under the [Apache License 2.0](/LICENSE). Built on [Squoosh], © Google Chrome Labs.

[squoosh]: https://squoosh.app
