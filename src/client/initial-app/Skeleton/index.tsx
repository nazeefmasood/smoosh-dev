import { h } from 'preact';

import * as style from './style.css';
import 'add-css:./style.css';

/**
 * Skeleton placeholder for the app's initial load. Mimics the landing layout
 * (top nav, hero heading + subcopy, dropzone) with shimmering bone/gray blocks
 * so the very first paint reads as the product, not a generic spinner.
 */
export default function Skeleton() {
  return (
    <div class={style.skeleton} aria-hidden="true">
      <nav class={style.nav}>
        <div class={style.wordBlock}>
          <span class={`${style.shimmer} ${style.mark}`} />
          <span class={`${style.shimmer} ${style.wordText}`} />
        </div>
        <span class={`${style.shimmer} ${style.navLink}`} />
      </nav>

      <section class={style.hero}>
        <div class={style.headingLine} style={{ width: '52%' }} />
        <div class={style.headingLine} style={{ width: '68%' }} />
        <div class={style.headingLine} style={{ width: '30%' }} />
        <div
          class={style.subLine}
          style={{ width: '80%', marginTop: '28px' }}
        />
        <div class={style.subLine} style={{ width: '64%' }} />
        <div class={style.subLine} style={{ width: '46%' }} />
        <div class={style.toggleRow}>
          <span class={`${style.shimmer} ${style.togglePill}`} />
          <span class={`${style.shimmer} ${style.togglePill}`} />
          <span class={`${style.shimmer} ${style.togglePill}`} />
        </div>
      </section>

      <div class={style.dropzone}>
        <span class={`${style.shimmer} ${style.dzIcon}`} />
        <span class={style.dzLine} style={{ width: '220px' }} />
        <span class={style.dzLineThin} style={{ width: '160px' }} />
        <span class={style.dzButton} />
        <div class={style.formatChips}>
          <span class={`${style.shimmer} ${style.chip}`} />
          <span class={`${style.shimmer} ${style.chip}`} />
          <span class={`${style.shimmer} ${style.chip}`} />
          <span class={`${style.shimmer} ${style.chip}`} />
        </div>
      </div>
    </div>
  );
}
