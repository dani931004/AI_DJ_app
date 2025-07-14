/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

/** A vertical slider for adjusting and visualizing prompt weight. */
@customElement('weight-slider')
export class WeightSlider extends LitElement {
  static override styles = css`
    :host {
      cursor: ns-resize;
      position: relative;
      width: 3.5vmin;
      height: 15vmin;
      touch-action: none;
      display: flex;
      justify-content: center;
    }
    .track {
      position: relative;
      width: 100%;
      height: 100%;
      background: #0003;
      border: 0.2vmin solid #fff8;
      border-radius: 2vmin;
      overflow: hidden;
    }
    .fill {
      position: absolute;
      bottom: 0;
      width: 100%;
      background-color: var(--slider-color);
      will-change: height;
    }
    .halo {
        position: absolute;
        bottom: 0;
        width: 100%;
        border-radius: inherit;
        box-shadow: 0 0 15px 3px var(--slider-color);
        opacity: 0;
        will-change: opacity;
        transition: opacity 0.1s;
    }
  `;

  @property({ type: Number }) value = 0; // 0 to 2
  @property({ type: String }) color = '#000';
  @property({ type: Number }) audioLevel = 0; // 0 to 1

  private dragStartPos = 0;
  private dragStartValue = 0;

  constructor() {
    super();
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
  }

  private handlePointerDown(e: PointerEvent) {
    e.preventDefault();
    this.dragStartPos = e.clientY;
    this.dragStartValue = this.value;
    document.body.classList.add('dragging');
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
  }

  private handlePointerMove(e: PointerEvent) {
    const rect = this.getBoundingClientRect();
    const delta = this.dragStartPos - e.clientY;
    const valueChange = (delta / rect.height) * 2;
    this.value = this.dragStartValue + valueChange;
    this.value = Math.max(0, Math.min(2, this.value));
    this.dispatchEvent(new CustomEvent<number>('input', { detail: this.value }));
  }

  private handlePointerUp() {
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    document.body.classList.remove('dragging');
  }

  private handleWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY;
    this.value = this.value + delta * -0.01;
    this.value = Math.max(0, Math.min(2, this.value));
    this.dispatchEvent(new CustomEvent<number>('input', { detail: this.value }));
  }

  override render() {
    const fillHeight = (this.value / 2) * 100;
    const fillStyle = styleMap({
      height: `${fillHeight}%`,
    });
    const haloStyle = styleMap({
        height: `${fillHeight}%`,
        opacity: `${this.value > 0 ? this.audioLevel : 0}`,
    });

    return html`
      <div
        class="track"
        style="--slider-color: ${this.color};"
        @pointerdown=${this.handlePointerDown}
        @wheel=${this.handleWheel}
      >
        <div class="halo" style=${haloStyle}></div>
        <div class="fill" style=${fillStyle}></div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'weight-slider': WeightSlider;
  }
}
