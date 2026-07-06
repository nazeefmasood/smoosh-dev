import { h, Component } from 'preact';

import * as style from './style.css';
import 'add-css:./style.css';
import logoIcon from 'url:static-build/assets/brand/smoosh-icon.png';
import type SnackBarElement from 'shared/custom-els/snack-bar';
// Vendored engine — pure-JS reverse alpha blending (no npm dependency).
import { removeWatermarkFromImage } from 'vendor/gwm';

const currentYear = new Date().getFullYear();

interface Props {
  files: File[];
  showSnack: SnackBarElement['showSnackbar'];
  onBack: () => void;
  onAddFiles?: (files: File[]) => void;
}

type ItemStatus = 'pending' | 'processing' | 'done' | 'error';

interface WatermarkItem {
  id: string;
  file: File;
  previewUrl: string;
  status: ItemStatus;
  resultUrl?: string;
  resultSize?: number;
  detected?: boolean;
  error?: string;
}

interface State {
  items: WatermarkItem[];
  processing: boolean;
}

let idCounter = 0;
const nextId = () => `wm-${idCounter++}`;

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode'));
    };
    img.src = url;
  });
}

function canvasToPngFile(canvas: any, name: string): Promise<File> {
  const out = name.replace(/.[^.]*$/, '') + '-clean.png';
  // The engine may return an HTMLCanvasElement (toBlob) or an
  // OffscreenCanvas (convertToBlob). Handle both.
  if (typeof canvas.convertToBlob === 'function') {
    return canvas
      .convertToBlob({ type: 'image/png' })
      .then((blob: Blob) => new File([blob], out, { type: 'image/png' }));
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob: Blob | null) => {
      if (!blob) {
        reject(new Error('encode'));
        return;
      }
      resolve(new File([blob], out, { type: 'image/png' }));
    }, 'image/png');
  });
}

export default class Watermark extends Component<Props, State> {
  state: State = {
    items: this.props.files.map((file) => ({
      id: nextId(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'pending' as ItemStatus,
    })),
    processing: false,
  };

  private fileInput?: HTMLInputElement;
  private cancelled = false;

  componentWillUnmount() {
    this.cancelled = true;
    for (const item of this.state.items) {
      URL.revokeObjectURL(item.previewUrl);
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
    }
  }

  private updateItem = (id: string, patch: Partial<WatermarkItem>) => {
    this.setState((prev) => ({
      items: prev.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }));
  };

  private removeItem = (id: string) => {
    this.setState((prev) => {
      const item = prev.items.find((i) => i.id === id);
      if (item) {
        URL.revokeObjectURL(item.previewUrl);
        if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
      }
      return { items: prev.items.filter((i) => i.id !== id) };
    });
  };

  private clearAll = () => {
    if (this.state.processing) return;
    for (const item of this.state.items) {
      URL.revokeObjectURL(item.previewUrl);
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
    }
    this.setState({ items: [] });
  };

  private onAddFilesClick = () => this.fileInput?.click();

  private addFiles = (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return;
    this.setState((prev) => ({
      items: [
        ...prev.items,
        ...imgs.map((file) => ({
          id: nextId(),
          file,
          previewUrl: URL.createObjectURL(file),
          status: 'pending' as ItemStatus,
        })),
      ],
    }));
  };

  private onDrop = (event: DragEvent) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files ?? []);
    this.addFiles(files);
  };

  private onDragOver = (event: DragEvent) => event.preventDefault();
  private onDragLeave = (event: DragEvent) => event.preventDefault();

  private onFileChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    input.value = '';
    if (!files.length) return;
    if (this.props.onAddFiles) {
      this.props.onAddFiles(files);
      return;
    }
    this.setState((prev) => ({
      items: [
        ...prev.items,
        ...files.map((file) => ({
          id: nextId(),
          file,
          previewUrl: URL.createObjectURL(file),
          status: 'pending' as ItemStatus,
        })),
      ],
    }));
  };

  private processAll = async () => {
    if (this.state.processing) return;
    this.cancelled = false;
    this.setState({ processing: true });
    try {
      for (const item of this.state.items) {
        if (this.cancelled) break;
        if (item.status === 'done') continue;
        this.updateItem(item.id, { status: 'processing', error: undefined });
        try {
          const img = await loadImage(item.file);
          const { canvas, meta } = await removeWatermarkFromImage(img);
          const resultFile = await canvasToPngFile(canvas, item.file.name);
          const url = URL.createObjectURL(resultFile);
          this.setState((prev) => ({
            items: prev.items.map((i) =>
              i.id === item.id
                ? {
                    ...i,
                    status: 'done',
                    resultUrl: i.resultUrl
                      ? (URL.revokeObjectURL(i.resultUrl), url)
                      : url,
                    resultSize: resultFile.size,
                    detected: !!(meta && (meta as any).detected),
                  }
                : i,
            ),
          }));
        } catch (err) {
          this.updateItem(item.id, { status: 'error', error: 'Failed' });
        }
      }
    } finally {
      this.setState({ processing: false });
    }
  };

  private cancel = () => {
    this.cancelled = true;
    this.setState({ processing: false });
  };

  private downloadAll = () => {
    for (const item of this.state.items) {
      if (item.status === 'done' && item.resultUrl) {
        const a = document.createElement('a');
        a.href = item.resultUrl;
        a.download = item.file.name.replace(/.[^.]*$/, '') + '-clean.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    }
  };

  render({ onBack }: Props, { items, processing }: State) {
    const doneCount = items.filter((i) => i.status === 'done').length;
    const allDone = doneCount === items.length && items.length > 0;

    return (
      <div class={style.page}>
        <input
          ref={(el: HTMLInputElement | null) => {
            this.fileInput = el ?? undefined;
          }}
          class={style.hide}
          type="file"
          multiple
          accept="image/*"
          onChange={this.onFileChange}
        />

        <nav class={style.nav}>
          <a class={style.wordmark} href="/" onClick={onBack}>
            <img
              class={style.markImg}
              src={logoIcon}
              alt=""
              width="28"
              height="28"
            />
            <span class={style.wordmarkText}>Smoosh</span>
          </a>
          <div class={style.navLinks}>
            <button class={style.navLink} onClick={onBack}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M15 6l-6 6 6 6"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span>Back to home</span>
            </button>
          </div>
        </nav>

        <section class={style.hero}>
          <h1>
            Remove <span class={style.accent}>Gemini watermarks</span>, right in
            your browser.
          </h1>
          <p class={style.heroSub}>
            Drop your Gemini-generated images and Smoosh cleanly removes the
            watermark using reverse alpha blending — a mathematically exact
            inversion, not AI inpainting. Batch supported, fully private.
          </p>

          {items.length > 0 && (
            <div class={style.actions}>
              <button class={style.btnAdd} onClick={this.onAddFilesClick}>
                + Add images
              </button>
              {items.length > 0 && !processing && (
                <button class={style.btnGhost} onClick={this.clearAll}>
                  Clear all
                </button>
              )}
              <div class={style.spacer} />
              {processing ? (
                <button class={style.btnGhost} onClick={this.cancel}>
                  Cancel
                </button>
              ) : (
                <button class={style.btnPrimary} onClick={this.processAll}>
                  {allDone
                    ? 'Re-process all'
                    : `Remove watermarks (${items.length})`}
                </button>
              )}
              {doneCount > 0 && (
                <button class={style.btnPrimary} onClick={this.downloadAll}>
                  Download all ({doneCount})
                </button>
              )}
            </div>
          )}
        </section>

        <section class={style.toolArea}>
          {items.length === 0 ? (
            <button
              class={style.dropzone}
              onClick={this.onAddFilesClick}
              onDrop={this.onDrop}
              onDragOver={this.onDragOver}
              onDragLeave={this.onDragLeave}
            >
              <div class={style.dropIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 16V4m0 0L8 8m4-4 4 4"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <path
                    d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                </svg>
              </div>
              <div class={style.dropTitle}>Drop Gemini-generated images</div>
              <div class={style.dropHint}>
                or <span>browse files</span> · batch supported
              </div>
            </button>
          ) : (
            <div class={style.list}>
              {items.map((item) => (
                <div class={style.row} data-status={item.status}>
                  <div class={style.thumbs}>
                    <img
                      class={style.thumb}
                      src={item.previewUrl}
                      alt={item.file.name}
                    />
                    {item.resultUrl && (
                      <img
                        class={style.thumb}
                        src={item.resultUrl}
                        alt={`${item.file.name} cleaned`}
                      />
                    )}
                  </div>
                  <div class={style.rowMeta}>
                    <div class={style.rowName}>{item.file.name}</div>
                    <div class={style.rowSizes}>
                      {prettyBytes(item.file.size)}
                      {item.resultSize !== undefined && (
                        <span>
                          {' → '}
                          <strong>{prettyBytes(item.resultSize)}</strong>
                        </span>
                      )}
                    </div>
                    {item.status === 'done' && (
                      <div class={style.detected}>
                        {item.detected === false
                          ? 'No watermark detected — output unchanged'
                          : 'Watermark removed'}
                      </div>
                    )}
                    {item.status === 'error' && (
                      <div class={style.rowError}>{item.error}</div>
                    )}
                  </div>
                  <div class={style.rowStatus}>
                    {item.status === 'processing' && (
                      <span class={style.statusProcessing}>Processing…</span>
                    )}
                    {item.status === 'done' && item.resultUrl && (
                      <a
                        class={style.dlLink}
                        href={item.resultUrl}
                        download={
                          item.file.name.replace(/.[^.]*$/, '') + '-clean.png'
                        }
                      >
                        Download
                      </a>
                    )}
                    {item.status === 'pending' && (
                      <span class={style.statusPending}>Queued</span>
                    )}
                  </div>
                  {!processing && (
                    <button
                      class={style.removeBtn}
                      onClick={() => this.removeItem(item.id)}
                      aria-label={`Remove ${item.file.name}`}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <footer class={style.footer}>
          <div class={style.footerBar}>
            <span>© {currentYear} Smoosh · Open source</span>
            <span class={style.footerMade}>Runs 100% in your browser</span>
          </div>
        </footer>
      </div>
    );
  }
}
