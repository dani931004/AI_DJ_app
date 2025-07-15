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

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, apiVersion: 'v1alpha' });
const model = 'lyria-realtime-exp';

function main() {
  const { prompts, genreOrder } = buildInitialPrompts();

  const pdjMidi = new PromptDjMidi(prompts, genreOrder, ai);
  document.body.appendChild(pdjMidi);

  const toastMessage = new ToastMessage();
  document.body.appendChild(toastMessage);

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
  [{ text: 'House', color: '#ff4b4b' }, { text: 'Chill House', color: '#be4bff' }, { text: 'Deep House', color: '#9135ff' }, { text: 'Prog House', color: '#4bff89' }, { text: 'Tech House', color: '#4bffff' }, { text: 'Afro House', color: '#4bb3ff' }, { text: 'Organic House', color: '#4bffb3' }, { text: 'Bass House', color: '#ffde4b' }],
  [{ text: 'Lo-Fi House', color: '#ff924b' }, { text: 'Slap House', color: '#ff4ba5' }, { text: 'G-House', color: '#ff4b4b' }, { text: 'Big Room', color: '#ffde4b' }, { text: 'Future House', color: '#be4bff' }, { text: 'Tropical House', color: '#4bff89' }, { text: 'Jersey Club', color: '#4bb3ff' }, { text: 'Techno', color: '#9135ff' }],
  [{ text: 'Melodic Techno', color: '#be4bff' }, { text: 'Minimal Techno', color: '#9135ff' }, { text: 'Hard Techno', color: '#ff4b4b' }, { text: 'Acid Techno', color: '#ffde4b' }, { text: 'Indust Techno', color: '#ff924b' }, { text: 'Dub Techno', color: '#4bff89' }, { text: 'Hypno Techno', color: '#4bffff' }],
  [{ text: 'Schranz', color: '#4bb3ff' }, { text: 'Ambient Tech', color: '#4bffb3' }, { text: 'Drum and Bass', color: '#ffde4b' }, { text: 'Jungle', color: '#ff924b' }, { text: 'Grime', color: '#ff4ba5' }, { text: 'UK Garage', color: '#be4bff' }, { text: 'Fut Garage', color: '#9135ff' }, { text: 'Dubstep', color: '#ff4b4b' }],
  [{ text: 'Future Bass', color: '#9135ff' }, { text: 'Trap', color: '#ff4b4b' }, { text: 'Footwork', color: '#ff924b' }, { text: 'Juke', color: '#ffde4b' }, { text: 'Breakbeat', color: '#4bff89' }, { text: 'Chillwave', color: '#4bffff' }, { text: 'Synthwave', color: '#be4bff' }, { text: 'Dream Pop', color: '#ff4ba5' }, { text: 'Shoegaze', color: '#4bb3ff' }],
  [{ text: 'New Age', color: '#4bffb3' }, { text: 'Baile Funk', color: '#4bff89' }, { text: 'Kuduro', color: '#ffde4b' }, { text: 'Gqom', color: '#ff924b' }, { text: 'Amapiano', color: '#ff4ba5' }, { text: 'Altobeat', color: '#ff4b4b' }, { text: 'Cumbia', color: '#be4bff' }, { text: 'E-Swing', color: '#9135ff' }, { text: 'Electro', color: '#4bb3ff' }],
  [{ text: 'Hyperpop', color: '#ff4ba5' }, { text: 'Decon Club', color: '#9135ff' }, { text: 'Witch House', color: '#be4bff' }, { text: 'Vaporwave', color: '#4bb3ff' }, { text: 'Glitch', color: '#4bffff' }, { text: 'IDM', color: '#4bff89' }, { text: 'Breakcore', color: '#ffde4b' }, { text: 'Hardstyle', color: '#ff924b' }, { text: 'Eurodance', color: '#ff4b4b' }],
  [{ text: 'Trance', color: '#4bffff' }]
];


main();