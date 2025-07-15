/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';

/** A single genre button. */
@customElement('genre-button')
export class GenreButton extends LitElement {
  static override styles = css`
    :host {
      display: inline-block;
    }
    .genre {
      font-family: 'Google Sans', sans-serif;
      font-weight: 500;
      font-size: clamp(0.9rem, 1vw + 0.5rem, 1.1rem);
      color: #fff;
      background-color: rgba(0,0,0,0.3);
      border: 1px solid var(--glow-color, #fff);
      padding: clamp(0.4rem, 0.5vw + 0.2rem, 0.6rem) clamp(0.8rem, 1vw + 0.4rem, 1.2rem);
      border-radius: 100px;
      cursor: pointer;
      transition: background-color 0.3s, box-shadow 0.3s, color 0.3s;
      -webkit-font-smoothing: antialiased;
      user-select: none;
      white-space: nowrap;
    }
    .genre:hover {
        background-color: rgba(255,255,255,0.2);
    }
    .genre.active {
      background-color: var(--glow-color, #fff);
      color: #000;
      box-shadow: 0 0 5px var(--glow-color, #fff), 0 0 15px var(--glow-color, #fff), 0 0 30px var(--glow-color, #fff);
    }
  `;

  @property({ type: String }) promptId = '';
  @property({ type: String }) text = '';
  @property({ type: Number }) weight = 0;
  @property({ type: String }) color = '#fff';
  @property({ type: Boolean, reflect: true }) filtered = false;

  private onGenreClick() {
    if (this.filtered) return;
    this.dispatchEvent(
      new CustomEvent('genre-click', {
        bubbles: true,
        composed: true,
        detail: { promptId: this.promptId },
      }),
    );
  }

  override render() {
    const isActive = this.weight > 0;
    const classes = classMap({
      'genre': true,
      'active': isActive && !this.filtered,
    });
    const styles = styleMap({
        '--glow-color': this.filtered ? '#555' : this.color,
        'text-decoration': this.filtered ? 'line-through' : 'none',
        'cursor': this.filtered ? 'not-allowed' : 'pointer',
        'opacity': this.filtered ? '0.6' : '1',
    });

    return html`<button class=${classes} style=${styles} @click=${this.onGenreClick}>
        ${this.text}
      </button>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'genre-button': GenreButton;
  }
}