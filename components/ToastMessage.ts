/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

@customElement('toast-message')
export class ToastMessage extends LitElement {
  static override styles = css`
    .toast {
      line-height: 1.6;
      position: fixed;
      top: 2rem;
      left: 50%;
      transform: translateX(-50%);
      background-color: rgba(20, 10, 30, 0.7);
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      width: min(500px, 80vw);
      transition: transform 0.5s cubic-bezier(0.19, 1, 0.22, 1), opacity 0.5s;
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 4px 30px rgba(0, 0, 0, 0.5);
      text-wrap: pretty;
      z-index: 100;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    .message {
      flex-grow: 1;
    }
    button {
      border-radius: 50%;
      width: 28px;
      height: 28px;
      border: 1px solid rgba(255,255,255,0.2);
      color: #fff;
      background: rgba(255,255,255,0.1);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      line-height: 1;
      flex-shrink: 0;
      transition: background-color 0.2s;
    }
    button:hover {
      background: rgba(255,255,255,0.2);
    }
    .toast:not(.showing) {
      transition-duration: 0.5s;
      transform: translate(-50%, -200px);
      opacity: 0;
      pointer-events: none;
    }
    a {
      color: #8ab4f8;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  `;

  @property({ type: String }) message = '';
  @property({ type: Boolean }) showing = false;

  private renderMessageWithLinks() {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = this.message.split( urlRegex );
    return parts.map( ( part, i ) => {
      if ( i % 2 === 0 ) return part;
      return html`<a href=${part} target="_blank" rel="noopener">${part}</a>`;
    } );
  }

  override render() {
    return html`<div class=${classMap({ showing: this.showing, toast: true })}>
      <div class="message">${this.renderMessageWithLinks()}</div>
      <button @click=${this.hide}>✕</button>
    </div>`;
  }

  show(message: string) {
    this.showing = true;
    this.message = message;
  }

  hide() {
    this.showing = false;
  }

}

declare global {
  interface HTMLElementTagNameMap {
    'toast-message': ToastMessage
  }
}