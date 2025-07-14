/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import { throttle } from '../utils/throttle';

import './PromptController';
import './PlayPauseButton';
import type { PlaybackState, Prompt } from '../types';
import { MidiDispatcher } from '../utils/MidiDispatcher';
import { AudioRecorder } from '../utils/AudioRecorder';

/** The grid of prompt inputs. */
@customElement('prompt-dj-midi')
export class PromptDjMidi extends LitElement {
  static override styles = css`
    :host {
      min-height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      box-sizing: border-box;
      position: relative;
      padding: 15vmin 0 4vmin;
      --reorder-handle-size: 16px;
    }
    #background {
      will-change: background-image;
      position: absolute;
      height: 100%;
      width: 100%;
      z-index: -1;
      background: #111;
    }
    #grid {
      width: 80vmin;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 2.5vmin;
      position: relative;
    }

    .prompt-item {
      position: relative;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      cursor: move;
    }

    .prompt-item.dragging {
      opacity: 0.8;
      transform: scale(1.02);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      z-index: 10;
    }

    .reorder-handle {
      position: absolute;
      top: 8px;
      right: 8px;
      width: var(--reorder-handle-size);
      height: var(--reorder-handle-size);
      background: rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      cursor: move;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 5;
      transition: background 0.2s ease;
    }

    .reorder-handle:hover {
      background: rgba(255, 255, 255, 0.4);
    }

    .reorder-handle::before {
      content: '';
      width: 12px;
      height: 2px;
      background: white;
      position: absolute;
      box-shadow: 
        0 -4px 0 white,
        0 4px 0 white;
    }
    prompt-controller {
      width: 100%;
    }
    play-pause-button {
      position: relative;
      width: 8vmin;
    }
    #buttons {
      position: fixed;
      top: 2vmin;
      left: 2vmin;
      padding: 1vmin;
      display: flex;
      gap: 1.5vmin;
      z-index: 10;
      align-items: center;
      background: rgba(0, 0, 0, 0.25);
      backdrop-filter: blur(5px);
      -webkit-backdrop-filter: blur(5px);
      border-radius: 50px;
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    button, a.button {
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      color: #fff;
      background: #0002;
      -webkit-font-smoothing: antialiased;
      border: 1.5px solid #fff;
      border-radius: 4px;
      user-select: none;
      padding: 3px 6px;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      &.active {
        background-color: #fff;
        color: #000;
      }
      &.record.active {
        background-color: #ff2a2a;
        border-color: #ff2a2a;
        color: #fff;
      }
      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
    .close-download {
        padding: 0 5px;
        min-width: 20px;
        height: 20px;
        border-radius: 100%;
        line-height: 1;
    }
    select {
      font: inherit;
      padding: 5px;
      background: #fff;
      color: #000;
      border-radius: 4px;
      border: none;
      outline: none;
      cursor: pointer;
    }
  `;

  private prompts: Map<string, Prompt>;
  private midiDispatcher: MidiDispatcher;
  private dragStartIndex: number = -1;
  private dragOverIndex: number = -1;

  @property({ type: Object }) audioRecorder?: AudioRecorder;

  @property({ type: Boolean }) private showMidi = false;
  @property({ type: String }) public playbackState: PlaybackState = 'stopped';
  @state() public audioLevel = 0;
  @state() private midiInputIds: string[] = [];
  @state() private activeMidiInputId: string | null = null;
  @state() private isRecording = false;
  @state() private downloadUrl: string | null = null;
  @state() private downloadFileName: string | null = null;

  @property({ type: Object })
  private filteredPrompts = new Set<string>();

  constructor(
    initialPrompts: Map<string, Prompt>,
  ) {
    super();
    this.prompts = initialPrompts;
    this.midiDispatcher = new MidiDispatcher();
  }

  override firstUpdated() {
    if (this.audioRecorder) {
        this.audioRecorder.addEventListener('statechange', (e: Event) => {
            const customEvent = e as CustomEvent<boolean>;
            this.isRecording = customEvent.detail;
        });
        this.audioRecorder.addEventListener('finished', (e: Event) => {
            const customEvent = e as CustomEvent<{url: string, fileName: string}>;
            this.downloadUrl = customEvent.detail.url;
            this.downloadFileName = customEvent.detail.fileName;
        });
    }
  }

  private handlePromptChanged(e: Event) {
    const event = e as CustomEvent<Prompt>;
    const { promptId, text, weight, cc } = event.detail;
    const prompt = this.prompts.get(promptId);

    if (!prompt) {
      console.error('prompt not found', promptId);
      return;
    }

    prompt.text = text;
    prompt.weight = weight;
    prompt.cc = cc;

    const newPrompts = new Map(this.prompts);
    newPrompts.set(promptId, prompt);

    this.prompts = newPrompts;
    this.requestUpdate();

    // Save to localStorage
    this.savePrompts();

    this.dispatchEvent(
      new CustomEvent('prompts-changed', { detail: this.prompts }),
    );
  }

  private savePrompts() {
    const event = new CustomEvent('save-prompts', {
      detail: this.prompts,
      bubbles: true,
      composed: true
    });
    this.dispatchEvent(event);
  }

  /** Generates radial gradients for each prompt based on weight and color. */
  private readonly makeBackground = throttle(
    () => {
      const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

      const MAX_WEIGHT = 0.5;
      const MAX_ALPHA = 0.6;

      const bg: string[] = [];

      const numCols = 4; // from CSS grid-template-columns
      const numRows = Math.ceil(this.prompts.size / numCols);

      [...this.prompts.values()].forEach((p, i) => {
        const alphaPct = clamp01(p.weight / MAX_WEIGHT) * MAX_ALPHA;
        const alpha = Math.round(alphaPct * 0xff)
          .toString(16)
          .padStart(2, '0');

        const stop = p.weight / 2;

        const col = i % numCols;
        const row = Math.floor(i / numCols);

        const x = numCols > 1 ? col / (numCols - 1) : 0.5;
        const y = numRows > 1 ? row / (numRows - 1) : 0.5;

        const s = `radial-gradient(circle at ${x * 100}% ${
          y * 100
        }%, ${p.color}${alpha} 0px, ${p.color}00 ${stop * 100}%)`;

        bg.push(s);
      });

      return bg.join(', ');
    },
    30, // don't re-render more than once every XXms
  );

  private toggleShowMidi() {
    return this.setShowMidi(!this.showMidi);
  }

  public async setShowMidi(show: boolean) {
    this.showMidi = show;
    if (!this.showMidi) return;
    try {
      const inputIds = await this.midiDispatcher.getMidiAccess();
      this.midiInputIds = inputIds;
      this.activeMidiInputId = this.midiDispatcher.activeMidiInputId;
    } catch (e: unknown) {
      this.showMidi = false;
      this.dispatchEvent(new CustomEvent('error', {detail: e instanceof Error ? e.message : 'Unknown error'}));
    }
  }

  private handleMidiInputChange(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const newMidiId = selectElement.value;
    this.activeMidiInputId = newMidiId;
    this.midiDispatcher.activeMidiInputId = newMidiId;
  }

  private playPause() {
    this.dispatchEvent(new CustomEvent('play-pause'));
  }

  public addFilteredPrompt(prompt: string) {
    this.filteredPrompts = new Set([...this.filteredPrompts, prompt]);
  }

  private toggleRecording() {
    if (!this.audioRecorder) return;
    if (this.isRecording) {
      this.audioRecorder.stop();
    } else {
      if (this.playbackState !== 'playing') return;
      this.downloadUrl = null;
      this.downloadFileName = null;
      this.audioRecorder.start();
    }
  }

  private renderControls() {
    return html`
      <play-pause-button .playbackState=${this.playbackState} @click=${this.playPause}></play-pause-button>
      <button
        class="record ${this.isRecording ? 'active' : ''}"
        @click=${this.toggleRecording}
        ?disabled=${this.playbackState !== 'playing' && !this.isRecording}
      >${this.isRecording ? 'Stop' : 'Rec'}</button>
      <button
        @click=${this.toggleShowMidi}
        class=${this.showMidi ? 'active' : ''}
        >MIDI</button
      >
      <select
        @change=${this.handleMidiInputChange}
        .value=${this.activeMidiInputId || ''}
        style=${this.showMidi ? '' : 'visibility: hidden'}>
        ${this.midiInputIds.length > 0
      ? this.midiInputIds.map(
        (id) =>
          html`<option value=${id}>
                  ${this.midiDispatcher.getDeviceName(id)}
                </option>`,
      )
      : html`<option value="">No devices found</option>`}
      </select>
      ${this.downloadUrl ? html`
        <a class="button" href=${this.downloadUrl} download=${this.downloadFileName}>Download</a>
        <button class="close-download" @click=${() => { this.downloadUrl = null; this.downloadFileName = null; }}>×</button>
      ` : ''}
    `;
  }

  override render() {
    const bg = styleMap({
      backgroundImage: this.makeBackground(),
    });
    return html`<div id="background" style=${bg}></div>
      <div id="buttons">
        ${this.renderControls()}
      </div>
      <div id="grid">${this.renderPrompts()}</div>`;
  }

  private handleDragStart(e: DragEvent, index: number) {
    this.dragStartIndex = index;
    const target = e.currentTarget as HTMLElement;
    target.classList.add('dragging');
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', ''); // Required for Firefox
      e.dataTransfer.effectAllowed = 'move';
    }
  }

  private handleDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    if (this.dragStartIndex === -1) return;
    this.dragOverIndex = index;
    this.requestUpdate();
  }

  private handleDragEnd(e: DragEvent) {
    const target = e.currentTarget as HTMLElement;
    target.classList.remove('dragging');
    
    if (this.dragStartIndex !== -1 && this.dragOverIndex !== -1 && this.dragStartIndex !== this.dragOverIndex) {
      const promptsArray = Array.from(this.prompts.entries());
      const [removed] = promptsArray.splice(this.dragStartIndex, 1);
      promptsArray.splice(this.dragOverIndex, 0, removed);
      
      const newPrompts = new Map(promptsArray);
      this.prompts = newPrompts;
      
      // Save the new order to localStorage
      this.savePrompts();
      
      this.dispatchEvent(
        new CustomEvent('prompts-changed', { detail: this.prompts })
      );
    }
    
    this.dragStartIndex = -1;
    this.dragOverIndex = -1;
    this.requestUpdate();
  }

  private renderPrompts() {
    return [...this.prompts.entries()].map(([, prompt], index) => {
      const isDragging = this.dragStartIndex === index;
      const isDragOver = this.dragOverIndex === index && this.dragStartIndex !== -1 && this.dragStartIndex !== index;
      
      // Create properly typed event handlers
      const handleDragStart = (e: DragEvent) => this.handleDragStart(e, index);
      const handleDragOver = (e: DragEvent) => this.handleDragOver(e, index);
      const handleDragEnd = (e: DragEvent) => this.handleDragEnd(e);
      const handleDragLeave = () => {
        if (this.dragOverIndex === index) {
          this.dragOverIndex = -1;
          this.requestUpdate();
        }
      };
      
      return html`
        <div 
          class="prompt-item ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}"
          draggable="true"
          @dragstart=${handleDragStart}
          @dragover=${handleDragOver}
          @dragend=${handleDragEnd}
          @dragleave=${handleDragLeave}
        >
          <div class="reorder-handle" title="Drag to reorder"></div>
          <prompt-controller
            promptId=${prompt.promptId}
            ?filtered=${this.filteredPrompts.has(prompt.text)}
            cc=${prompt.cc}
            text=${prompt.text}
            weight=${prompt.weight}
            color=${prompt.color}
            .midiDispatcher=${this.midiDispatcher}
            .showCC=${this.showMidi}
            audioLevel=${this.audioLevel}
            @prompt-changed=${this.handlePromptChanged}>
          </prompt-controller>
        </div>`;
    });
  }
}