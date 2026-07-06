# Smoosh

**Smoosh** is a privacy-first image toolkit that runs entirely in your browser. Shrink and convert images with industry-standard codecs, compare formats side by side, batch a whole folder at once, and cleanly remove Gemini AI watermarks — all without your files ever leaving your device.

Smoosh is a fork of [Squoosh] by Google Chrome Labs, extended with a unified two-tool workflow.

## Tools

### Compress

Re-encode and convert images between modern formats, tuning quality with live before/after previews.

- **Formats:** JPEG, PNG, WebP, AVIF, JXL, WebP2 (WP2), and GIF
- **Side-by-side comparison** to weigh quality against file size
- **Batch mode** — drop a whole folder and export in multiple formats at once

### Watermark

Remove watermarks from Gemini-generated images using **reverse alpha blending** — a mathematically exact inversion of the blend operation, not AI inpainting. If no watermark is detected, the output is left unchanged.

- Exact, reversible removal (not a reconstruction)
- Batch supported
- Fully local — nothing is uploaded

## Privacy

Smoosh never sends your images to a server. All processing — compression, conversion, and watermark removal — happens locally in your browser via WebAssembly codecs.

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
