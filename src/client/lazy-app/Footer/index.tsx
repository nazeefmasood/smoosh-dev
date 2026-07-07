import { h } from 'preact';

import * as style from './style.css';
import 'add-css:./style.css';
import logoFull from 'url:static-build/assets/brand/smoosh-full.png';
import { TOOLS } from '../ToolNav';
import type { ToolMode } from '../Tool';

const currentYear = new Date().getFullYear();

interface Props {
  /** SPA navigation to a tool; falls back to hard links when omitted. */
  onOpenTool?: (mode: ToolMode) => void;
}

/**
 * Shared site footer used on the landing page and every tool page. Tool links
 * are derived from the same TOOLS list that drives the nav, so the footer
 * never drifts out of sync as tools are added.
 */
export default function Footer({ onOpenTool }: Props) {
  return (
    <footer class={style.footer}>
      <div class={style.footerInner}>
        <div class={style.footerBrand}>
          <img class={style.footerFullLogo} src={logoFull} alt="Smoosh" />
          <p class={style.footerTag}>
            Private, in-browser image tools. Compress, convert, and clean up
            images — your files never leave your device.
          </p>
        </div>
        <div class={style.footerCols}>
          <div class={style.footerCol}>
            <h4>Tools</h4>
            {TOOLS.map((t) => (
              <a
                class={style.footerLink}
                href={`/editor?tool=${t.mode}`}
                onClick={
                  onOpenTool
                    ? (e: Event) => {
                        e.preventDefault();
                        onOpenTool(t.mode);
                      }
                    : undefined
                }
              >
                {t.label}
              </a>
            ))}
          </div>
          <div class={style.footerCol}>
            <h4>Resources</h4>
            <a
              class={style.footerLink}
              href="https://github.com/nazeefmasood/smoosh-dev/blob/main/README.md"
            >
              Privacy
            </a>
            <a
              class={style.footerLink}
              href="https://github.com/nazeefmasood/smoosh-dev"
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
      <div class={style.footerBar}>
        <span>© {currentYear} Smoosh · Open source</span>
        <span class={style.footerMade}>Runs 100% in your browser</span>
      </div>
    </footer>
  );
}
