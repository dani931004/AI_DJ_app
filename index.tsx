/**
 * @fileoverview Control real time music with a MIDI controller
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PlaybackState, Prompt } from './types';
import { GoogleGenAI, LiveMusicFilteredPrompt } from '@google/genai';
import { PromptDjMidi } from './components/PromptDjMidi';
import { ToastMessage } from './components/ToastMessage';
import { LiveMusicHelper } from './utils/LiveMusicHelper';
import { AudioAnalyser } from './utils/AudioAnalyser';

declare global {
  interface Window {
    pdjMidi?: PromptDjMidi;
  }
}

// Get API key from Vite environment variables
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
if (!apiKey) {
    console.error('GEMINI_API_KEY is not set. Please check your environment variables.');
}

const ai = new GoogleGenAI({ apiKey, apiVersion: 'v1alpha' });
const model = 'lyria-realtime-exp';

function main() {
  const { prompts, genreOrder } = buildInitialPrompts();

  const pdjMidi = new PromptDjMidi(prompts, genreOrder, ai);
  document.body.appendChild(pdjMidi);

  const toastMessage = new ToastMessage();
  document.body.appendChild(toastMessage);

  // Make pdjMidi globally available for state access during reconnection
  (window as any).pdjMidi = pdjMidi;

  const liveMusicHelper = new LiveMusicHelper(ai, model, prompts);

  const audioAnalyser = new AudioAnalyser(liveMusicHelper.audioContext);
  liveMusicHelper.extraDestination = audioAnalyser.node;

  pdjMidi.addEventListener('prompts-changed', ((e: Event) => {
    const customEvent = e as CustomEvent<Map<string, Prompt>>;
    const prompts = customEvent.detail;
    liveMusicHelper.setWeightedPrompts(prompts);
  }));

  pdjMidi.addEventListener('volume-changed', ((e: Event) => {
    const customEvent = e as CustomEvent<number>;
    liveMusicHelper.setVolume(customEvent.detail);
  }));

  pdjMidi.addEventListener('play-pause', () => {
    // This is an async call, so we should handle potential errors
    // even if the underlying implementation is expected to catch them.
    (async () => {
      try {
        await liveMusicHelper.playPause();
      } catch (e) {
        // This is a safeguard. Errors should ideally be handled within LiveMusicHelper
        // and dispatched as custom 'error' events.
        const message = e instanceof Error ? e.message : 'An unknown error occurred during playback.';
        toastMessage.show(message);
        if (liveMusicHelper.playbackState !== 'stopped') {
           liveMusicHelper.stop();
        }
      }
    })();
  });

  pdjMidi.addEventListener('start-recording', () => {
    liveMusicHelper.startRecording();
  });

  pdjMidi.addEventListener('stop-recording', () => {
    liveMusicHelper.stopRecording();
  });

  liveMusicHelper.addEventListener('connection-restored', ((e: Event) => {
    const customEvent = e as CustomEvent<{wasAutoDjActive: boolean}>;
    if (customEvent.detail.wasAutoDjActive) {
      // Restart auto DJ if it was active before the connection was lost
      pdjMidi.startAutoDj();
    }
  }) as EventListener);

  liveMusicHelper.addEventListener('recording-finished', ((e: Event) => {
    const customEvent = e as CustomEvent<{url: string, filename: string}>;
    pdjMidi.onRecordingFinished(customEvent.detail);
  }));

  liveMusicHelper.addEventListener('playback-state-changed', ((e: Event) => {
    const customEvent = e as CustomEvent<PlaybackState>;
    const playbackState = customEvent.detail;
    pdjMidi.playbackState = playbackState;
    playbackState === 'playing' ? audioAnalyser.start() : audioAnalyser.stop();
  }));

  liveMusicHelper.addEventListener('filtered-prompt', ((e: Event) => {
    const customEvent = e as CustomEvent<LiveMusicFilteredPrompt>;
    const filteredPrompt = customEvent.detail;
    if (filteredPrompt.filteredReason) {
      toastMessage.show(String(filteredPrompt.filteredReason));
    }
    if (filteredPrompt.text) {
      pdjMidi.addFilteredPrompt(filteredPrompt.text);
    }
  }));

  const errorToast = ((e: Event) => {
    let message = 'An unknown error occurred.';
    if (e instanceof CustomEvent) {
      // The detail could be anything, so we convert it to a string.
      const detail = e.detail;
      if (typeof detail === 'string') {
        message = detail;
      } else if (detail) {
        message = String(detail);
      }
    } else if (e instanceof Error) {
      message = e.message;
    }
    toastMessage.show(message);
  });

  liveMusicHelper.addEventListener('error', errorToast);
  pdjMidi.addEventListener('error', errorToast);

  const infoToast = ((e: Event) => {
    if (e instanceof CustomEvent && e.detail) {
      toastMessage.show(String(e.detail));
    }
  });
  liveMusicHelper.addEventListener('info', infoToast);

}

function buildInitialPrompts() {
  const prompts = new Map<string, Prompt>();
  let promptCounter = 0;

  // Create all prompts and map them by their text for easy lookup.
  const promptsByText = new Map<string, Prompt>();
  for (const row of GENRE_DATA) {
    for (const genre of row) {
      const promptId = `prompt-${promptCounter}`;
      const prompt: Prompt = {
        promptId,
        text: genre.text,
        weight: 0, // Will be set later
        cc: promptCounter,
        color: genre.color,
      };
      prompts.set(promptId, prompt);
      promptsByText.set(genre.text, prompt);
      promptCounter++;
    }
  }

  // Load which genres were active from a previous session.
  let activeGenreTexts: string[] | null = null;
  try {
    const savedGenres = localStorage.getItem('activeGenresPreset');
    if (savedGenres) {
      const parsed = JSON.parse(savedGenres);
      if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
        activeGenreTexts = parsed;
      }
    }
  } catch (e) {
    console.error('Could not load genre preset from localStorage.', e);
    localStorage.removeItem('activeGenresPreset');
  }

  // Set the weight for each prompt based on the loaded active genres.
  if (activeGenreTexts) {
    prompts.forEach(p => {
      if (activeGenreTexts!.includes(p.text)) {
        p.weight = 1;
      }
    });
  } else {
    // Default to 'House' if no preset is found.
    const housePrompt = promptsByText.get('House');
    if (housePrompt) housePrompt.weight = 1;
  }

  // Fallback: Ensure at least one prompt is active.
  const hasActivePrompt = [...prompts.values()].some(p => p.weight > 0);
  if (!hasActivePrompt) {
    const housePrompt = promptsByText.get('House');
    if (housePrompt) housePrompt.weight = 1;
  }

  // Try to load the user's saved genre arrangement.
  let genreOrder: {promptId: string}[] = [];
  let loadedFromStorage = false;
  try {
    const savedArrangementJSON = localStorage.getItem('genreOrder');
    if (savedArrangementJSON) {
      const savedArrangement = JSON.parse(savedArrangementJSON);

      // Validate that the saved arrangement contains the exact same prompts as the current app version.
      const allCurrentPromptIds = new Set(prompts.keys());
      const allSavedPromptIds = new Set(savedArrangement.map((p: {promptId: string}) => p.promptId));

      const isSameSize = allCurrentPromptIds.size === allSavedPromptIds.size;
      const allSavedExistInCurrent = [...allSavedPromptIds].every(id => typeof id === 'string' && allCurrentPromptIds.has(id));

      if (isSameSize && allSavedExistInCurrent && Array.isArray(savedArrangement)) {
        // The saved arrangement is valid, use it.
        genreOrder = savedArrangement;
        loadedFromStorage = true;
      } else {
        // Invalidate stored arrangement if it's out of sync with GENRE_DATA
        localStorage.removeItem('genreOrder');
      }
    }
  } catch (e) {
    console.warn('Could not load or parse genre arrangement, using default.', e);
  }

  // If no valid arrangement was loaded, create the default layout from GENRE_DATA.
  if (!loadedFromStorage) {
    genreOrder = GENRE_DATA.flat().map(genre => ({ promptId: promptsByText.get(genre.text)!.promptId }));
  }

  return { prompts, genreOrder };
}

const GENRE_DATA = [
  // HOUSE STYLES
  [
    { text: 'House', color: '#ff4b4b' },
    { text: 'Deep House', color: '#9135ff' },
    { text: 'Chill House', color: '#be4bff' },
    { text: 'Tech House', color: '#4bffff' },
    { text: 'Prog House', color: '#4bff89' },
    { text: 'Bass House', color: '#ffde4b' },
    { text: 'Afro House', color: '#4bb3ff' },
    { text: 'Organic House', color: '#4bffb3' },
    { text: 'Tropical House', color: '#33ffa1' },
    { text: 'Future House', color: '#33ffd7' }
  ],
  // TECHNO STYLES
  [
    { text: 'Techno', color: '#9135ff' },
    { text: 'Melodic Techno', color: '#be4bff' },
    { text: 'Minimal Techno', color: '#4bb3ff' },
    { text: 'Acid Techno', color: '#ffde4b' },
    { text: 'Dub Techno', color: '#4bff89' },
    { text: 'Hard Techno', color: '#ff4b4b' },
    { text: 'Industrial Techno', color: '#ff924b' },
    { text: 'Hypno Techno', color: '#4bffff' },
    { text: 'Schranz', color: '#33ffd7' }
  ],
  // TRANCE
  [
    { text: 'Trance', color: '#4bffff' },
    { text: 'Psytrance', color: '#ff4ba5' },
    { text: 'Progressive Trance', color: '#ffde4b' },
    { text: 'Hard Trance', color: '#ff924b' },
    { text: 'Dark Trance', color: '#ff4b4b' },
    { text: 'Tech Trance', color: '#4bff89' },
    { text: 'Goa Trance', color: '#33ffa1' },
    { text: 'Uplifting Trance', color: '#be4bff' }
  ],
  // BASS MUSIC & CLUB
  [
    { text: 'Dubstep', color: '#4bb3ff' },
    { text: 'Trap', color: '#ff4b4b' },
    { text: 'Future Bass', color: '#9135ff' },
    { text: 'Drum and Bass', color: '#ffde4b' },
    { text: 'Jungle', color: '#ff924b' },
    { text: 'Footwork', color: '#33ffd7' },
    { text: 'Juke', color: '#4bff89' },
    { text: 'Breakbeat', color: '#4bffff' },
    { text: 'Grime', color: '#ff4ba5' },
    { text: 'UK Garage', color: '#be4bff' }
  ],
  // GLOBAL & LATIN
  [
    { text: 'Reggaeton', color: '#ff4ba5' },
    { text: 'Moombahton', color: '#9135ff' },
    { text: 'Baile Funk', color: '#ff924b' },
    { text: 'Kuduro', color: '#ffde4b' },
    { text: 'Gqom', color: '#4bff89' },
    { text: 'Amapiano', color: '#33ffa1' },
    { text: 'Soca', color: '#33d1ff' },
    { text: 'Dancehall', color: '#ff9933' },
    { text: 'Afrobeats', color: '#ff4b4b' }
  ],
  // RETRO & SYNTH
  [
    { text: 'Synthwave', color: '#be4bff' },
    { text: 'Chillwave', color: '#4bffff' },
    { text: 'Vaporwave', color: '#4bb3ff' },
    { text: 'Dream Pop', color: '#ff4ba5' },
    { text: 'Shoegaze', color: '#33ffd7' },
    { text: 'Italo Disco', color: '#ffde4b' },
    { text: 'Eurodance', color: '#ff924b' },
    { text: 'Hardstyle', color: '#ff4b4b' }
  ],
  // AMBIENT & EXPERIMENTAL
  [
    { text: 'Ambient', color: '#33ffe3' },
    { text: 'Drone', color: '#ff33e3' },
    { text: 'Noise', color: '#33e3ff' },
    { text: 'Musique Concrète', color: '#e3ff33' },
    { text: 'Glitch', color: '#4bffff' },
    { text: 'IDM', color: '#4bff89' },
    { text: 'Breakcore', color: '#ffde4b' },
    { text: 'Witch House', color: '#be4bff' }
  ],
  // HIP HOP & R&B
  [
    { text: 'Hip Hop', color: '#ff5733' },
    { text: 'Boom Bap', color: '#33ff57' },
    { text: 'G-Funk', color: '#5733ff' },
    { text: 'Drill', color: '#6eff33' },
    { text: 'R&B', color: '#33ff77' },
    { text: 'Soul', color: '#a34cff' },
    { text: 'Jazz Rap', color: '#a8ff33' }
  ],
  // FUNK & DISCO
  [
    { text: 'Funk', color: '#ff7733' },
    { text: 'Disco', color: '#ff33a1' },
    { text: 'Nu Disco', color: '#ff33d1' },
    { text: 'Boogie', color: '#ffd133' },
    { text: 'Electro Funk', color: '#33a1ff' },
    { text: 'Gospel', color: '#ff3333' },
    { text: 'Ska', color: '#aaff33' },
    { text: 'Reggae', color: '#ff9933' }
  ],
  // ROCK & ALTERNATIVE
  [
    { text: 'Rocksteady', color: '#33ffaa' },
    { text: 'Post Rock', color: '#33d1ff' },
    { text: 'Shoegaze', color: '#ff4ba5' },
    { text: 'Punk', color: '#ff3333' },
    { text: 'Indie Rock', color: '#33ffa1' },
    { text: 'Alternative', color: '#4bff89' }
  ]
];


main();