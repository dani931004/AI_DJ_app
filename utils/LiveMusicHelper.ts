/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import type { PlaybackState, Prompt } from '../types';
import type { AudioChunk, GoogleGenAI, LiveMusicFilteredPrompt, LiveMusicServerMessage, LiveMusicSession } from '@google/genai';
import { decode, decodeAudioData } from './audio';
import { throttle } from './throttle';

export class LiveMusicHelper extends EventTarget {
  private ai: GoogleGenAI;
  private model: string;

  private session: LiveMusicSession | null = null;

  private retryCount = 0;
  private readonly maxRetries = 5;
  private readonly retryDelay = 1000; // 1 second base for backoff

  private filteredPrompts = new Set<string>();
  private nextStartTime = 0;
  private readonly bufferTime = 4;

  public readonly audioContext: AudioContext;
  public extraDestination: AudioNode | null = null;

  private outputNode: GainNode;
  private _playbackState: PlaybackState = 'stopped';
  private volume = 1;

  private prompts: Map<string, Prompt>;

  private streamDestination: MediaStreamAudioDestinationNode;
  private recorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];

  constructor(ai: GoogleGenAI, model: string, initialPrompts: Map<string, Prompt>) {
    super();
    this.ai = ai;
    this.model = model;
    this.prompts = initialPrompts;
    this.audioContext = new AudioContext({ sampleRate: 48000 });
    this.outputNode = this.audioContext.createGain();
    this.streamDestination = this.audioContext.createMediaStreamDestination();
  }

  public get playbackState(): PlaybackState {
    return this._playbackState;
  }

  private connect(): Promise<LiveMusicSession> {
    return this.ai.live.music.connect({
      model: this.model,
      callbacks: {
        onmessage: async (e: LiveMusicServerMessage) => {
          if (e.setupComplete) {
            this.retryCount = 0;
          }
          if (e.filteredPrompt) {
            this.filteredPrompts.add(e.filteredPrompt.text!);
            this.dispatchEvent(new CustomEvent<LiveMusicFilteredPrompt>('filtered-prompt', { detail: e.filteredPrompt }));
          }
          if (e.serverContent?.audioChunks) {
            await this.processAudioChunks(e.serverContent.audioChunks);
          }
        },
        onerror: (e: ErrorEvent) => {
          console.error('LiveMusicHelper.onerror', e);
          this.handleConnectionError(e);
        },
        onclose: (event?: CloseEvent) => {
          this.handleConnectionClose(event);
        },
      },
    });
  }

  private handleConnectionError(e: ErrorEvent) {
    const wasActive = this.isActive();
    this.stop();
    if (wasActive && this.retryCount < this.maxRetries) {
      this.retryCount++;
      const delay = this.retryDelay * Math.pow(2, this.retryCount - 1);
      const message = e.error?.message || e.message || 'Unknown error';
      this.dispatchEvent(new CustomEvent('error', { detail: `Connection error (${message}). Retrying in ${delay / 1000}s... (Attempt ${this.retryCount}/${this.maxRetries})` }));
      // setTimeout(() => this.play(), delay);
    } else if (wasActive) {
      const message = e.error?.message || e.message;
      this.dispatchEvent(new CustomEvent('error', { detail: `Connection error: ${message}. Max retries reached.` }));
      this.retryCount = 0;
    }
  }

  private handleConnectionClose(event?: CloseEvent) {
    const wasActive = this.isActive();
    this.stop();
    if (wasActive && this.retryCount < this.maxRetries) {
      this.retryCount++;
      const delay = this.retryDelay * Math.pow(2, this.retryCount - 1);
      const reason = event ? `code ${event.code}` : 'no reason';
      this.dispatchEvent(new CustomEvent('error', { detail: `Connection closed (${reason}). Retrying in ${delay / 1000}s... (Attempt ${this.retryCount}/${this.maxRetries})` }));
      setTimeout(() => this.play(), delay);
    } else if (wasActive) {
      const reason = event ? `code ${event.code}, reason: ${event.reason || 'n/a'}` : 'no reason';
      this.dispatchEvent(new CustomEvent('error', { detail: `Connection closed. ${reason}. Max retries reached.` }));
      this.retryCount = 0;
    }
  }

  private isActive(): boolean {
    return this._playbackState === 'playing' || this._playbackState === 'loading';
  }

  private setPlaybackState(state: PlaybackState) {
    if (this._playbackState !== state) {
      this._playbackState = state;
      this.dispatchEvent(new CustomEvent('playback-state-changed', { detail: state }));
    }
  }

  private async processAudioChunks(audioChunks: AudioChunk[]) {
    if (this._playbackState === 'paused' || this._playbackState === 'stopped') return;

    const audioBuffer = await decodeAudioData(
      decode(audioChunks[0].data!),
      this.audioContext,
      45000,
      2,
    );

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.outputNode);

    if (this.nextStartTime === 0) {
      this.nextStartTime = this.audioContext.currentTime + this.bufferTime;
      setTimeout(() => {
        if (this._playbackState === 'loading') {
          this.setPlaybackState('playing');
        }
      }, this.bufferTime * 1000);
    }

    if (this.nextStartTime < this.audioContext.currentTime) {
      this.setPlaybackState('loading');
      this.nextStartTime = 0;
      return;
    }

    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;
  }

  public get activePrompts() {
    return [...this.prompts.values()].filter(
      (p) => !this.filteredPrompts.has(p.text) && p.weight !== 0
    );
  }

  public readonly setWeightedPrompts = throttle(async (prompts: Map<string, Prompt>) => {
    this.prompts = prompts;

    if (this.activePrompts.length === 0) {
      this.dispatchEvent(new CustomEvent('error', { detail: 'There needs to be at least one active prompt.' }));
      this.pause();
      return;
    }

    if (!this.session) return;

    const weightedPrompts = this.activePrompts.map(({ text, weight }) => ({ text, weight }));

    try {
      await this.session.setWeightedPrompts({ weightedPrompts });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.dispatchEvent(new CustomEvent('error', { detail: `Failed to update prompts: ${message}` }));
      this.pause();
    }
  }, 200);

  public setVolume(level: number) {
    if (level < 0 || level > 1) return;
    this.volume = level;
    if (this.isActive()) {
      this.outputNode.gain.setTargetAtTime(this.volume, this.audioContext.currentTime, 0.02);
    }
  }

  public play = async () => {
    if (this._playbackState === 'loading' || this._playbackState === 'playing') return;

    this.setPlaybackState('loading');
    try {
      if (!this.session) {
        const initialPrompts = this.activePrompts.map(({ text, weight }) => ({ text, weight }));
        if (initialPrompts.length === 0) {
          this.dispatchEvent(new CustomEvent('error', { detail: 'There needs to be at least one active prompt.' }));
          this.stop();
          return;
        }
        this.session = await this.connect();
        await this.session.setWeightedPrompts({ weightedPrompts: initialPrompts });
      }

      await this.audioContext.resume();
      this.session.play();

      this.outputNode.disconnect();
      this.outputNode.connect(this.audioContext.destination);
      this.outputNode.connect(this.streamDestination);
      if (this.extraDestination) {
        this.outputNode.connect(this.extraDestination);
      }

      this.outputNode.gain.cancelScheduledValues(this.audioContext.currentTime);
      this.outputNode.gain.linearRampToValueAtTime(this.volume, this.audioContext.currentTime + 0.1);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.dispatchEvent(new CustomEvent('error', { detail: `Playback failed: ${message}` }));
      this.stop();
    }
  };

  public pause = () => {
    if (this.session) this.session.pause();
    this.setPlaybackState('paused');
    this.outputNode.gain.cancelScheduledValues(this.audioContext.currentTime);
    this.outputNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.1);
    this.nextStartTime = 0;
  };

  public stop = () => {
    if (this.session) this.session.stop();
    this.setPlaybackState('stopped');
    this.outputNode.gain.cancelScheduledValues(this.audioContext.currentTime);
    this.outputNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.1);
    this.nextStartTime = 0;
    this.session = null;
  };

  public playPause = async () => {
    if (this._playbackState === 'paused' || this._playbackState === 'stopped') {
      this.retryCount = 0;
    }
    switch (this._playbackState) {
      case 'playing':
        this.pause();
        break;
      case 'paused':
      case 'stopped':
        await this.play();
        break;
      case 'loading':
        this.stop();
        break;
    }
  };

  public startRecording = () => {
    if (this.recorder?.state === 'recording') return;

    this.recordedChunks = [];
    const options = { mimeType: 'audio/webm; codecs=opus' };

    try {
      this.recorder = new MediaRecorder(this.streamDestination.stream, options);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.dispatchEvent(new CustomEvent('error', { detail: `Recording failed: ${message}` }));
      return;
    }

    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.recorder.onstop = () => {
      const blob = new Blob(this.recordedChunks, { type: options.mimeType });
      const url = URL.createObjectURL(blob);
      const filename = `prompt-dj-recording-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
      this.dispatchEvent(new CustomEvent('recording-finished', { detail: { url, filename } }));
    };

    this.recorder.start();
  };

  public stopRecording = () => {
    if (this.recorder?.state === 'recording') {
      this.recorder.stop();
    }
  };
}
