/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement, svg, PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import Sortable from 'sortablejs';
import { GoogleGenAI, Type } from '@google/genai';

import './PlayPauseButton';
import './PromptController'; // now a genre-button
import type { PlaybackState, Prompt } from '../types';

/** The main UI for the application. */
@customElement('prompt-dj-midi')
export class PromptDjMidi extends LitElement {
  static override styles = css`
    :host {
      height: 100%;
      width: 100%;
      display: flex;
      flex-direction: column;
      justify-content: flex-start; /* Align content to the top */
      align-items: center;
      box-sizing: border-box;
      overflow-y: auto; /* Allow vertical scrolling */
      padding: 2rem;
      gap: 1.5rem;
    }
    #grid {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: clamp(0.75rem, 1.5vmin, 1rem);
      width: 100%;
      max-width: 1600px;
    }
    genre-button {
      cursor: grab;
    }
    genre-button:active {
      cursor: grabbing;
    }
    /* SortableJS styles */
    .sortable-ghost-genre {
      opacity: 0.4;
    }
    .sortable-chosen {
        cursor: grabbing;
    }
    #controls {
      display: flex;
      gap: 1rem;
      z-index: 10;
      align-items: center;
      background: rgba(11, 2, 26, 0.6);
      padding: 0.5rem;
      border-radius: 100px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      flex-shrink: 0;
    }
    play-pause-button {
      width: clamp(70px, 12vmin, 90px);
      height: clamp(70px, 12vmin, 90px);
    }
    .control-button {
      font-family: 'Google Sans', sans-serif;
      font-weight: 500;
      font-size: clamp(0.9rem, 2vmin, 1rem);
      padding: 0.6rem 1.2rem;
      border-radius: 100px;
      border: 1px solid rgba(255, 255, 255, 0.5);
      background: rgba(0, 0, 0, 0.4);
      color: #fff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      transition: background-color 0.3s, box-shadow 0.3s, border-color 0.3s, opacity 0.3s;
      min-width: 80px;
    }
    .control-button:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    .control-button:disabled {
      background: rgba(0,0,0,0.4);
      cursor: wait;
      opacity: 0.7;
    }
    .control-button.rec.recording {
      background-color: #ff4b4b;
      border-color: #ff4b4b;
    }
    .control-button.auto-dj.active {
      background-color: #03a9f4;
      border-color: #03a9f4;
      color: #fff;
      box-shadow: 0 0 8px #03a9f4, 0 0 20px #03a9f4;
    }
    .auto-dj-icon {
      transition: transform 0.5s ease-in-out;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .auto-dj.active .auto-dj-icon {
      transform: rotate(360deg);
    }
    .rec-dot {
      width: clamp(0.6rem, 1.2vmin, 0.8rem);
      height: clamp(0.6rem, 1.2vmin, 0.8rem);
      border-radius: 50%;
      background: #fff;
      transition: background-color 0.3s;
    }
    .rec.recording .rec-dot {
      background: #fff;
      animation: pulse 1.5s infinite;
    }
    .volume-control {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0 0.5rem;
    }
    .volume-control svg {
      width: clamp(20px, 4vmin, 24px);
      height: clamp(20px, 4vmin, 24px);
      fill: #fff;
      opacity: 0.8;
    }
    .volume-slider {
      appearance: none;
      -webkit-appearance: none;
      width: clamp(80px, 15vw, 120px);
      height: 4px;
      background: rgba(255, 255, 255, 0.3);
      border-radius: 2px;
      outline: none;
      transition: opacity 0.2s;
    }
    .volume-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 16px;
      height: 16px;
      background: #fff;
      cursor: pointer;
      border-radius: 50%;
      box-shadow: 0 0 5px rgba(255,255,255,0.5);
    }
    .volume-slider::-moz-range-thumb {
      width: 16px;
      height: 16px;
      background: #fff;
      cursor: pointer;
      border-radius: 50%;
      border: none;
      box-shadow: 0 0 5px rgba(255,255,255,0.5);
    }

    .spinner {
      width: 18px;
      height: 18px;
    }
    .spinner .loader {
      stroke: #ffffff;
      stroke-width: 8;
      stroke-linecap: round;
      animation: spin linear 1s infinite;
      transform-origin: center;
      transform-box: fill-box;
      fill: none;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(359deg); }
    }

    @keyframes pulse {
      0% { opacity: 1; }
      50% { opacity: 0.3; }
      100% { opacity: 1; }
    }

    @media (max-width: 768px) {
      :host {
        padding: 1.5rem 1rem;
        gap: 1rem;
      }
    }
  `;

  @state() private prompts: Map<string, Prompt>;
  @state() private genreOrder: {promptId: string}[];

  @property({ type: String }) public playbackState: PlaybackState = 'stopped';
  @state() private isRecording = false;

  // Auto DJ State
  @state() private isAutoDjActive = false;
  @state() private isAutoDjLoading = false;
  @state() private rateLimitCooldownActive = false;
  @state() private autoDjPlaylist: { genres: string[] }[] = [];
  @state() private autoDjCurrentIndex = -1;
  @state() private currentModel: 'gemini-2.0-flash-lite' | 'gemma-3-27b-it' | 'gemma-3-12b-it' | 'gemma-3-4b-it' = 'gemini-2.0-flash-lite';
  private autoDjIntervalId: number | null = null;
  private rateLimitTimeoutId: number | null = null;

  @state()
  private filteredPrompts = new Set<string>();

  @state()
  private volume = 1;

  private gridElement: HTMLElement | null = null;
  private sortableGrid: Sortable | null = null;
  private ai: GoogleGenAI;

  constructor(
    initialPrompts: Map<string, Prompt>,
    genreOrder: {promptId: string}[],
    ai: GoogleGenAI,
  ) {
    super();
    this.prompts = initialPrompts;
    this.genreOrder = genreOrder;
    this.ai = ai;
    try {
      const savedVolume = localStorage.getItem('djVolume');
      if (savedVolume !== null) {
        this.volume = parseFloat(savedVolume);
      }
    } catch (e) {
      console.warn('Could not load volume from localStorage', e);
      this.volume = 1;
    }
  }

  override firstUpdated() {
    this.gridElement = this.shadowRoot?.getElementById('grid') ?? null;
    this.initSortable();
    // Dispatch initial volume so the helper can set it.
    this.dispatchEvent(new CustomEvent('volume-changed', {
      bubbles: true,
      composed: true,
      detail: this.volume
    }));
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.stopAutoDj();
    if (this.rateLimitTimeoutId) {
      clearTimeout(this.rateLimitTimeoutId);
      this.rateLimitTimeoutId = null;
    }
  }

  override updated(changedProperties: PropertyValues) {
    if (changedProperties.has('playbackState')) {
      // If playback is not active (paused, stopped, loading), turn off Auto DJ.
      if (this.playbackState !== 'playing' && this.isAutoDjActive) {
        this.stopAutoDj();
      }
    }
  }

  private initSortable() {
    if (!this.gridElement) return;

    this.sortableGrid?.destroy();

    this.sortableGrid = new Sortable(this.gridElement, {
        animation: 150,
        ghostClass: 'sortable-ghost-genre',
        chosenClass: 'sortable-chosen',
        onEnd: () => this.updateAndSaveArrangement(),
    });
  }

  private updateAndSaveArrangement() {
    if (!this.gridElement) return;

    const newGenreOrder: { promptId: string }[] = [];
    const buttonElements = this.gridElement.querySelectorAll<HTMLElement>('genre-button');

    buttonElements.forEach(buttonEl => {
        const promptId = buttonEl.getAttribute('promptid'); // Attributes are lowercase
        if (promptId) {
            newGenreOrder.push({ promptId });
        }
    });

    this.genreOrder = newGenreOrder;

    try {
        localStorage.setItem('genreOrder', JSON.stringify(this.genreOrder));
    } catch (e) {
        console.error('Failed to save genre arrangement to localStorage', e);
        this.dispatchEvent(new CustomEvent('error', {
            detail: 'Could not save your genre arrangement.',
            bubbles: true,
            composed: true,
        }));
    }
  }

  private saveActiveGenres() {
    const activeGenreTexts = [...this.prompts.values()]
      .filter((p) => p.weight > 0)
      .map((p) => p.text);
    try {
      localStorage.setItem('activeGenresPreset', JSON.stringify(activeGenreTexts));
    } catch (error) {
      console.error('Failed to save genres to localStorage:', error);
      this.dispatchEvent(new CustomEvent('error', {
          detail: 'Could not save your genre preset.',
          bubbles: true,
          composed: true
      }));
    }
  }

  private async fetchAutoDjPlaylist() {
    if (this.isAutoDjLoading) return;
    this.isAutoDjLoading = true;

    const availablePrompts = [...this.prompts.values()].filter(p => !this.filteredPrompts.has(p.text));
    if (availablePrompts.length < 3) {
        this.dispatchEvent(new CustomEvent('error', { detail: 'Not enough available genres for Auto DJ.' }));
        this.stopAutoDj();
        this.isAutoDjLoading = false;
        return;
    }

    const availableGenreNames = availablePrompts.map(p => p.text);
    const activeGenreNames = [...this.prompts.values()].filter(p => p.weight > 0).map(p => p.text);

    let promptText = `You are an expert DJ. The current mix is playing these genres: ${activeGenreNames.join(', ')}. Create a DJ setlist of 4 creative and harmonious genre combinations to transition to, one after the other. The setlist should flow well from the current genres and from one combination to the next. For each combination in the setlist, select 2 or 3 genres. Available genres: ${availableGenreNames.join(', ')}`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.currentModel,
        contents: promptText,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              setlist: {
                type: Type.ARRAY,
                description: 'A DJ setlist of 4 creative and harmonious genre combinations.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    genres: {
                      type: Type.ARRAY,
                      description: 'A combination of 2 or 3 genres for one part of the set.',
                      items: { type: Type.STRING }
                    }
                  }
                }
              }
            }
          }
        },
      });

      if (!this.isAutoDjActive) {
        this.isAutoDjLoading = false;
        return;
      }

      const jsonResponse = JSON.parse(response.text);
      const setlist = jsonResponse.setlist;

      if (!setlist || !Array.isArray(setlist) || setlist.length === 0 || !setlist[0].genres) {
        throw new Error("AI returned invalid or empty setlist data.");
      }

      this.autoDjPlaylist = setlist;
      this.autoDjCurrentIndex = 0;
      this.applyCurrentAutoDjTransition();

      // On success, reset to the primary model for the next fetch.
      this.currentModel = 'gemini-2.0-flash-lite';
      this.isAutoDjLoading = false;

    } catch (e) {
      console.error(`AI genre selection failed with model ${this.currentModel}.`, e);
      const message = e instanceof Error ? e.message : String(e);

      if (message.includes('RESOURCE_EXHAUSTED') || message.includes('429')) {
        // Model fallback logic
        if (this.currentModel === 'gemini-2.0-flash-lite') {
          // Primary failed, try first fallback
          this.currentModel = 'gemma-3-12b-it';
          this.dispatchEvent(new CustomEvent('error', { detail: 'Primary AI is busy. Trying alternate model...' }));
          this.isAutoDjLoading = false;
          this.fetchAutoDjPlaylist();
          return;

        } else if (this.currentModel === 'gemma-3-12b-it') {
          // First fallback failed, try second fallback
          this.currentModel = 'gemma-3-4b-it';
          this.dispatchEvent(new CustomEvent('error', { detail: 'Alternate AI is busy. Trying another model...' }));
          this.isAutoDjLoading = false;
          this.fetchAutoDjPlaylist();
          return;

        } else {
          // All models failed, so start a cooldown.
          this.rateLimitCooldownActive = true;
          const coolDownMinutes = 5;
          this.dispatchEvent(new CustomEvent('error', { detail: `All AI models are busy. Paused for ${coolDownMinutes} minutes. Using random genres.` }));

          if (this.rateLimitTimeoutId) clearTimeout(this.rateLimitTimeoutId);

          this.rateLimitTimeoutId = window.setTimeout(() => {
            this.rateLimitCooldownActive = false;
            this.currentModel = 'gemini-2.0-flash-lite'; // Reset to primary after cooldown
            this.rateLimitTimeoutId = null;
            if (this.isAutoDjActive) {
              this.dispatchEvent(new CustomEvent('error', { detail: 'Auto DJ is back online. Resuming AI suggestions.' }));
            }
          }, coolDownMinutes * 60 * 1000);

          this.changeGenresRandomly(); // Use random fallback during cooldown.
          this.isAutoDjLoading = false;
        }
      } else {
        // Handle other non-rate-limit errors.
        this.dispatchEvent(new CustomEvent('error', { detail: `Auto DJ AI Error: ${message}. Using random genres.` }));
        this.changeGenresRandomly();
        this.isAutoDjLoading = false;
      }
    }
  }

  private applyCurrentAutoDjTransition() {
    const transition = this.autoDjPlaylist[this.autoDjCurrentIndex];
    if (!transition || !transition.genres) return;

    const newPrompts = new Map(this.prompts);
    newPrompts.forEach(p => { p.weight = 0; });

    let activatedCount = 0;
    for (const genreName of transition.genres) {
      const promptToActivate = [...newPrompts.values()].find(p => p.text === genreName);
      if (promptToActivate) {
        promptToActivate.weight = 1;
        activatedCount++;
      }
    }

    if (activatedCount === 0) {
      this.changeGenresRandomly();
      return;
    }

    this.prompts = newPrompts;
    this.dispatchEvent(new CustomEvent('prompts-changed', { detail: this.prompts }));
    this.saveActiveGenres();
  }

  private advanceAutoDj() {
    if (this.rateLimitCooldownActive) {
      this.changeGenresRandomly();
      return;
    }

    this.autoDjCurrentIndex++;

    if (this.autoDjCurrentIndex >= this.autoDjPlaylist.length) {
      this.fetchAutoDjPlaylist();
    } else {
      this.applyCurrentAutoDjTransition();
    }
  }

  private changeGenresRandomly() {
    const availablePrompts = [...this.prompts.values()].filter(p => !this.filteredPrompts.has(p.text));
    if (availablePrompts.length === 0) return;

    const newPrompts = new Map(this.prompts);
    newPrompts.forEach((prompt) => { prompt.weight = 0; });

    const numToSelect = Math.min(Math.floor(Math.random() * 2) + 2, availablePrompts.length);
    const shuffled = [...availablePrompts].sort(() => 0.5 - Math.random());

    for (let i = 0; i < numToSelect; i++) {
      const promptToActivate = newPrompts.get(shuffled[i].promptId);
      if (promptToActivate) promptToActivate.weight = 1;
    }

    this.prompts = newPrompts;
    this.dispatchEvent(new CustomEvent('prompts-changed', { detail: this.prompts }));
    this.saveActiveGenres();
  }

  private startAutoDj() {
    this.isAutoDjActive = true;
    this.rateLimitCooldownActive = false; // Reset cooldown
    this.currentModel = 'gemini-2.0-flash-lite'; // Always start with the primary model

    if (this.rateLimitTimeoutId) {
        clearTimeout(this.rateLimitTimeoutId);
        this.rateLimitTimeoutId = null;
    }

    this.fetchAutoDjPlaylist();
    this.autoDjIntervalId = window.setInterval(() => this.advanceAutoDj(), 45000);
  }

  private stopAutoDj() {
    if (this.autoDjIntervalId) {
      clearInterval(this.autoDjIntervalId);
      this.autoDjIntervalId = null;
    }
    this.isAutoDjActive = false;
    this.isAutoDjLoading = false;
    this.autoDjPlaylist = [];
    this.autoDjCurrentIndex = -1;
    this.currentModel = 'gemini-2.0-flash-lite'; // Reset to primary
  }

  private handleAutoDjClick() {
    if (this.isAutoDjActive) {
      this.stopAutoDj();
    } else {
      this.startAutoDj();
    }
  }


  private handleGenreClick(e: CustomEvent<{promptId: string}>) {
    if (this.isAutoDjActive) {
      this.stopAutoDj();
    }
    const { promptId } = e.detail;
    const prompt = this.prompts.get(promptId);
    if (!prompt) return;

    // Toggle weight
    prompt.weight = prompt.weight > 0 ? 0 : 1;

    // Ensure at least one prompt is active
    const activePrompts = [...this.prompts.values()].filter(p => p.weight > 0);
    if (activePrompts.length === 0) {
      prompt.weight = 1;
    }

    const newPrompts = new Map(this.prompts);
    newPrompts.set(promptId, prompt);
    this.prompts = newPrompts;

    this.dispatchEvent(
      new CustomEvent('prompts-changed', { detail: this.prompts }),
    );
    this.saveActiveGenres();
  }

  private handlePlayClick() {
    this.dispatchEvent(new CustomEvent('play-pause'));
  }

  private handleRecClick() {
    this.isRecording = !this.isRecording;
    if (this.isRecording) {
      this.dispatchEvent(new CustomEvent('start-recording'));
    } else {
      this.dispatchEvent(new CustomEvent('stop-recording'));
    }
  }

  private handleVolumeChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const newVolume = parseFloat(target.value);
    this.volume = newVolume;
    this.dispatchEvent(
      new CustomEvent('volume-changed', {
        bubbles: true,
        composed: true,
        detail: newVolume,
      }),
    );
    try {
        localStorage.setItem('djVolume', String(newVolume));
    } catch(e) {
        console.error('Could not save volume to localStorage', e);
    }
  }

  public onRecordingFinished(details: {url: string, filename: string}) {
    const { url, filename } = details;
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    this.isRecording = false;
  }

  public addFilteredPrompt(promptText: string) {
    this.filteredPrompts = new Set([...this.filteredPrompts, promptText]);
    this.requestUpdate();
  }

  private renderVolumeIcon() {
    if (this.volume === 0) {
      return svg`<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`;
    } else if (this.volume < 0.5) {
      return svg`<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>`;
    } else {
      return svg`<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`;
    }
  }

  override render() {
    const autoDjButtonContent = this.isAutoDjLoading
      ? html`<span class="auto-dj-icon">
          <svg class="spinner" viewBox="30 30 80 80">
            <path shape-rendering="crispEdges" class="loader" d="M70,74.2L70,74.2c-10.7,0-19.5-8.7-19.5-19.5l0,0c0-10.7,8.7-19.5,19.5-19.5l0,0c10.7,0,19.5,8.7,19.5,19.5l0,0"/>
          </svg>
        </span>Thinking`
      : html`<span class="auto-dj-icon">✨</span>Auto`;

    return html`
      <div id="controls">
        <button
          class=${classMap({'control-button': true, 'rec': true, 'recording': this.isRecording})}
          @click=${this.handleRecClick}
          title=${this.isRecording ? 'Stop Recording' : 'Start Recording'}
          >
          <span class="rec-dot"></span>
          Rec
        </button>
        <button
          class=${classMap({'control-button': true, 'auto-dj': true, 'active': this.isAutoDjActive})}
          @click=${this.handleAutoDjClick}
          title=${this.isAutoDjActive ? 'Stop Auto DJ' : this.isAutoDjLoading ? 'AI is fetching a new setlist...' : 'Start Auto DJ'}
          ?disabled=${this.playbackState !== 'playing' && !this.isAutoDjActive}
        >
          ${autoDjButtonContent}
        </button>
        <play-pause-button
          .playbackState=${this.playbackState}
          @click=${this.handlePlayClick}>
        </play-pause-button>
        <div class="volume-control">
          ${this.renderVolumeIcon()}
          <input
            type="range"
            class="volume-slider"
            min="0"
            max="1"
            step="0.01"
            .value=${this.volume}
            @input=${this.handleVolumeChange}
            aria-label="Volume"
          >
        </div>
      </div>

      <div id="grid" @genre-click=${this.handleGenreClick}>
        ${this.genreOrder.map((p) => {
          const prompt = this.prompts.get(p.promptId);
          if (!prompt) return '';
          return html`
            <genre-button
              promptId=${prompt.promptId}
              text=${prompt.text}
              .weight=${prompt.weight}
              color=${prompt.color}
              ?filtered=${this.filteredPrompts.has(prompt.text)}>
            </genre-button>
          `;
        })}
      </div>
    `;
  }
}
