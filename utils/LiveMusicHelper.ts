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
  private readonly retryDelay = 1000; // 1 second, then exponential backoff

  private filteredPrompts = new Set<string>();
  private nextStartTime = 0;
  private bufferTime = 2;

  public readonly audioContext: AudioContext;
  public extraDestination: AudioNode | null = null;

  private outputNode: GainNode;
  private _playbackState: PlaybackState = 'stopped';
  private volume = 1;

  private prompts: Map<string, Prompt>;

  // Recording properties
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
            this.retryCount = 0; // Reset on successful connection
            this.dispatchEvent(new CustomEvent('info', { detail: 'Connection successful. Preparing audio...' }));
          }
          if (e.filteredPrompt) {
            this.filteredPrompts = new Set([...this.filteredPrompts, e.filteredPrompt.text!])
            this.dispatchEvent(new CustomEvent<LiveMusicFilteredPrompt>('filtered-prompt', { detail: e.filteredPrompt }));
          }
          if (e.serverContent?.audioChunks) {
            await this.processAudioChunks(e.serverContent.audioChunks);
          }
        },
        onerror: (e: ErrorEvent) => {
          console.error('LiveMusicHelper.onerror', e);
          const wasPlayingOrLoading = this._playbackState === 'playing' || this._playbackState === 'loading';
          this.stop(); // sets state to stopped, session to null

          if (wasPlayingOrLoading) {
            if (this.retryCount < this.maxRetries) {
              this.retryCount++;
              const delay = this.retryDelay * Math.pow(2, this.retryCount - 1); // Exponential backoff
              const originalErrorMessage = e.error?.message || e.message || 'Unknown error';
              const detail = `Connection error (${originalErrorMessage}). Retrying in ${delay / 1000}s... (Attempt ${this.retryCount}/${this.maxRetries})`;
              this.dispatchEvent(new CustomEvent('error', { detail }));
              // setTimeout(() => this.play(), delay);
            } else {
              const message = e.error?.message || e.message;
              const detail = `Connection error: ${message}. Giving up after ${this.maxRetries} retries.`;
              this.dispatchEvent(new CustomEvent('error', { detail }));
              this.retryCount = 0; // Reset for next manual play
            }
          }
        },
        onclose: (event?: CloseEvent) => {
          const wasPlayingOrLoading = this._playbackState === 'playing' || this._playbackState === 'loading';

          this.stop(); // sets state to stopped, session to null

          if (wasPlayingOrLoading) {
            if (this.retryCount < this.maxRetries) {
              this.retryCount++;
              const delay = this.retryDelay * Math.pow(2, this.retryCount - 1); // Exponential backoff
              const reason = event ? `code ${event.code}` : 'no reason given';
              const detail = `Connection closed (${reason}). Retrying in ${delay / 1000}s... (Attempt ${this.retryCount}/${this.maxRetries})`;
              this.dispatchEvent(new CustomEvent('error', { detail }));
              setTimeout(() => this.play(), delay);
            } else {
              const reason = event ? `Code: ${event.code}, Reason: ${event.reason || 'No reason provided'}` : 'No reason provided';
              const detail = `Connection closed unexpectedly. ${reason}. Giving up after ${this.maxRetries} retries. Please try playing again.`;
              this.dispatchEvent(new CustomEvent('error', { detail }));
              this.retryCount = 0; // Reset for next manual play
            }
          }
        },
      },
    });
  }

  private setPlaybackState(state: PlaybackState) {
    this._playbackState = state;
    this.dispatchEvent(new CustomEvent('playback-state-changed', { detail: state }));
  }

  private async processAudioChunks(audioChunks: AudioChunk[]) {
    if (this._playbackState === 'paused' || this._playbackState === 'stopped') return;
    const audioBuffer = await decodeAudioData(
      decode(audioChunks[0].data!),
      this.audioContext,
      48000,
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
    return Array.from(this.prompts.values())
      .filter((p) => {
        return !this.filteredPrompts.has(p.text) && p.weight !== 0;
      })
  }

  public readonly setWeightedPrompts = throttle(async (prompts: Map<string, Prompt>) => {
    this.prompts = prompts;

    if (this.activePrompts.length === 0) {
      this.dispatchEvent(new CustomEvent('error', { detail: 'There needs to be one active prompt to play.' }));
      this.pause();
      return;
    }

    if (!this.session) return;

    const weightedPrompts = this.activePrompts.map(({ text, weight }) => ({ text, weight }));

    try {
      await this.session.setWeightedPrompts({
        weightedPrompts,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const detail = `Failed to update prompts: ${message}`;
      this.dispatchEvent(new CustomEvent('error', { detail }));
      this.pause();
    }
  }, 200);

  public setVolume(level: number) {
    if (level < 0 || level > 1) return;
    this.volume = level;
    // only change the gain if audio is currently supposed to be audible
    if (this._playbackState === 'playing' || this._playbackState === 'loading') {
        // use setTargetAtTime for a smooth change to avoid clicks.
        this.outputNode.gain.setTargetAtTime(this.volume, this.audioContext.currentTime, 0.02);
    }
  }

  public play = async () => {
    this.setPlaybackState('loading');
    try {
      if (!this.session) {
        const initialPrompts = this.activePrompts.map(({ text, weight }) => ({ text, weight }));
        if (initialPrompts.length === 0) {
          this.dispatchEvent(new CustomEvent('error', { detail: 'There needs to be one active prompt to play.' }));
          this.stop();
          return;
        }
        this.dispatchEvent(new CustomEvent('info', { detail: `Connecting to model: ${this.model}` }));
        this.session = await this.connect();
        try {
          await this.session.setWeightedPrompts({
            weightedPrompts: initialPrompts
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          const detail = `Failed to set initial prompts: ${message}`;
          this.dispatchEvent(new CustomEvent('error', { detail }));
          this.stop();
          return;
        }
      }

      this.audioContext.resume();
      this.session!.play();
      this.outputNode.connect(this.audioContext.destination);
      this.outputNode.connect(this.streamDestination); // Connect for recording
      if (this.extraDestination) this.outputNode.connect(this.extraDestination);
      this.outputNode.gain.cancelScheduledValues(this.audioContext.currentTime);
      this.outputNode.gain.linearRampToValueAtTime(this.volume, this.audioContext.currentTime + 0.1);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const detail = `Playback failed: ${message}. This could be an issue with your API key, network, or browser.`;
      this.dispatchEvent(new CustomEvent('error', { detail }));
      this.stop();
    }
  }

  public pause = () => {
    if (this.session) this.session.pause();
    this.setPlaybackState('paused');
    this.outputNode.gain.cancelScheduledValues(this.audioContext.currentTime);
    this.outputNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.1);
    this.nextStartTime = 0;
  }

  public stop = () => {
    if (this.session) this.session.stop();
    this.setPlaybackState('stopped');
    this.outputNode.gain.cancelScheduledValues(this.audioContext.currentTime);
    this.outputNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.1);
    this.nextStartTime = 0;
    this.session = null;
  }

  public playPause = async () => {
    if (this._playbackState === 'paused' || this._playbackState === 'stopped') {
      // User is initiating a play action, so it's not a retry.
      this.retryCount = 0;
    }
    switch (this._playbackState) {
      case 'playing':
        return this.pause();
      case 'paused':
      case 'stopped':
        return this.play();
      case 'loading':
        return this.stop();
    }
  }

  public startRecording = () => {
    if (this.recorder?.state === 'recording') return;
    this.recordedChunks = [];
    const options = { mimeType: 'audio/webm; codecs=opus' };
    try {
      this.recorder = new MediaRecorder(this.streamDestination.stream, options);
    } catch(e) {
      const message = e instanceof Error ? e.message : String(e);
      this.dispatchEvent(new CustomEvent('error', { detail: `Recording failed: ${message}`}));
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
      const filename = `prompt-dj-recording-${new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')}.webm`;
      this.dispatchEvent(new CustomEvent('recording-finished', { detail: { url, filename } }));
    };

    this.recorder.start();
  }

  public stopRecording = () => {
    if (this.recorder?.state === 'recording') {
      this.recorder.stop();
    }
  }
}