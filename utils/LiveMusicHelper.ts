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
  private sessionPromise: Promise<LiveMusicSession> | null = null;
  private isConnected = false;
  private playPauseCallback: (() => void) | null = null;
  private retryCount = 0;

  private filteredPrompts = new Set<string>();
  private nextStartTime = 0;
  private bufferTime = 2;

  public readonly audioContext: AudioContext;
  public extraDestinations: AudioNode[] = [];

  private outputNode: GainNode;
  private playbackState: PlaybackState = 'stopped';

  private prompts: Map<string, Prompt>;

  constructor(ai: GoogleGenAI, model: string) {
    super();
    this.ai = ai;
    this.model = model;
    this.prompts = new Map();
    this.audioContext = new AudioContext({ sampleRate: 48000 });
    this.outputNode = this.audioContext.createGain();
  }

  private getSession(): Promise<LiveMusicSession> {
    if (!this.sessionPromise) this.sessionPromise = this.connect();
    return this.sessionPromise;
  }

  private async connect(): Promise<LiveMusicSession> {
    console.log('[AI] Starting connection to model:', this.model);
    try {
      console.log('[AI] Initializing connection (attempt', this.retryCount + 1, ')');
      
      const startTime = performance.now();
      this.sessionPromise = this.ai.live.music.connect({
        model: this.model,
        callbacks: {
          onmessage: async (e: LiveMusicServerMessage) => {
            if (e.setupComplete) {
              this.connectionError = false;
              this.retryCount = 0; // Reset retry count on successful connection
            }
            if (e.filteredPrompt) {
              this.filteredPrompts = new Set([...this.filteredPrompts, e.filteredPrompt.text!])
              this.dispatchEvent(new CustomEvent<LiveMusicFilteredPrompt>('filtered-prompt', { detail: e.filteredPrompt }));
            }
            if (e.serverContent?.audioChunks) {
              await this.processAudioChunks(e.serverContent.audioChunks);
            }
          },
          onchunk: (chunk: AudioChunk) => {
            this.isConnected = true;
            console.log('[AI] Received audio chunk');
            this.dispatchEvent(new CustomEvent('chunk', { detail: chunk }));
          },
          onerror: (error: Error) => {
            console.error('[AI] Connection Error:', error);
            this.isConnected = false;
            this.retryCount++;
            
            // Log additional error details if available
            const errorInfo: any = {};
            if ('status' in (error as any)) errorInfo.status = (error as any).status;
            if ('response' in (error as any)) errorInfo.response = (error as any).response;
            
            if (Object.keys(errorInfo).length > 0) {
              console.error('[AI] Error details:', errorInfo);
            }
            
            this.dispatchEvent(new CustomEvent('error', { detail: error }));
          },
          onclose: () => {
            console.log('[AI] Connection closed');
            this.isConnected = false;
            this.handleConnectionError();
          }
        },
      });
      
      const session = await this.sessionPromise;
      const connectTime = ((performance.now() - startTime) / 1000).toFixed(2);
      
      if (session) {
        this.isConnected = true;
        this.retryCount = 0; // Reset retry count on successful connection
        console.log(`[AI] Successfully connected in ${connectTime}s`);
        
        // Log basic session info (without accessing potentially private properties)
        try {
          console.log('[AI] Session ready');
        } catch (e) {
          console.log('[AI] Session established');
        }
      }
      
      return session;
    } catch (error) {
      this.handleConnectionError();
      throw error;
    }
  }

  private setPlaybackState(state: PlaybackState) {
    this.playbackState = state;
    this.dispatchEvent(new CustomEvent('playback-state-changed', { detail: state }));
  }

  private handleConnectionError() {
    this.connectionError = true;
    this.stop();
    
    // Dispatch error event
    this.dispatchEvent(new CustomEvent('error', { 
      detail: 'Connection error. Attempting to restart playback...' 
    }));
    
    // Simulate a click on the play button after a short delay
    setTimeout(() => {
      if (this.playPauseCallback) {
        this.playPauseCallback();
      }
    }, 1000);
  }

  private async processAudioChunks(audioChunks: AudioChunk[]) {
    if (this.playbackState === 'paused' || this.playbackState === 'stopped') return;
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
        this.setPlaybackState('playing');
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

    // store the prompts to set later if we haven't connected yet
    // there should be a user interaction before calling setWeightedPrompts
    if (!this.session) return;

    try {
      await this.session.setWeightedPrompts({
        weightedPrompts: this.activePrompts,
      });
    } catch (e: any) {
      this.dispatchEvent(new CustomEvent('error', { detail: e.message }));
      this.pause();
    }
  }, 200);

  public async play() {
    this.setPlaybackState('loading');
    this.session = await this.getSession();
    await this.setWeightedPrompts(this.prompts);
    this.audioContext.resume();
    this.session.play();
    this.outputNode.connect(this.audioContext.destination);
    for (const dest of this.extraDestinations) {
      this.outputNode.connect(dest);
    }
    this.outputNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    this.outputNode.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + 0.1);
  }

  public pause() {
    if (this.session) this.session.pause();
    this.setPlaybackState('paused');
    this.outputNode.gain.setValueAtTime(1, this.audioContext.currentTime);
    this.outputNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.1);
    this.nextStartTime = 0;
    this.outputNode = this.audioContext.createGain();
  }

  public stop() {
    if (this.session) this.session.stop();
    this.setPlaybackState('stopped');
    this.outputNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    this.outputNode.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + 0.1);
    this.nextStartTime = 0;
    this.session = null;
    this.sessionPromise = null;
  }

  public setPlayPauseCallback(callback: () => void) {
    this.playPauseCallback = callback;
  }

  public async playPause() {
    switch (this.playbackState) {
      case 'playing':
        return this.pause();
      case 'paused':
      case 'stopped':
        return this.play();
      case 'loading':
        return this.stop();
    }
  }

}