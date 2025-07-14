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
import { AudioRecorder } from './utils/AudioRecorder';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, apiVersion: 'v1alpha' });
const model = 'lyria-realtime-exp';

function main() {
  const initialPrompts = buildInitialPrompts();
  const appRoot = document.getElementById('app');
  
  if (!appRoot) {
    console.error('Could not find app root element');
    return;
  }
  
  // Clear any existing content
  appRoot.innerHTML = '';
  
  const pdjMidi = new PromptDjMidi(initialPrompts);
  appRoot.appendChild(pdjMidi);

  const toastMessage = new ToastMessage();
  document.body.appendChild(toastMessage);

  const liveMusicHelper = new LiveMusicHelper(ai, model);
  liveMusicHelper.setWeightedPrompts(initialPrompts);
  
  // Set up the play/pause callback for automatic reconnection
  const handlePlayPause = () => {
    liveMusicHelper.playPause();
  };
  liveMusicHelper.setPlayPauseCallback(handlePlayPause);

  const audioAnalyser = new AudioAnalyser(liveMusicHelper.audioContext);
  liveMusicHelper.extraDestinations.push(audioAnalyser.node);

  const audioRecorder = new AudioRecorder(liveMusicHelper.audioContext);
  liveMusicHelper.extraDestinations.push(audioRecorder.destinationNode);
  pdjMidi.audioRecorder = audioRecorder;

  pdjMidi.addEventListener('prompts-changed', ((e: Event) => {
    const customEvent = e as CustomEvent<Map<string, Prompt>>;
    const prompts = customEvent.detail;
    liveMusicHelper.setWeightedPrompts(prompts);
  }));

  pdjMidi.addEventListener('play-pause', () => {
    liveMusicHelper.playPause();
  });

  liveMusicHelper.addEventListener('playback-state-changed', ((e: Event) => {
    const customEvent = e as CustomEvent<PlaybackState>;
    const playbackState = customEvent.detail;
    pdjMidi.playbackState = playbackState;
    if (playbackState === 'playing') {
      audioAnalyser.start();
    } else {
      audioAnalyser.stop();
      if (audioRecorder.isRecording) {
        audioRecorder.stop();
      }
    }
  }));

  liveMusicHelper.addEventListener('filtered-prompt', ((e: Event) => {
    const customEvent = e as CustomEvent<LiveMusicFilteredPrompt>;
    const filteredPrompt = customEvent.detail;
    toastMessage.show(filteredPrompt.filteredReason!)
    pdjMidi.addFilteredPrompt(filteredPrompt.text!);
  }));

  const errorToast = ((e: Event) => {
    const customEvent = e as CustomEvent<string>;
    const error = customEvent.detail;
    toastMessage.show(error);
  });

  liveMusicHelper.addEventListener('error', errorToast);
  pdjMidi.addEventListener('error', errorToast);
  audioRecorder.addEventListener('error', errorToast);

  audioAnalyser.addEventListener('audio-level-changed', ((e: Event) => {
    const customEvent = e as CustomEvent<number>;
    const level = customEvent.detail;
    pdjMidi.audioLevel = level;
  }));

  // Listen for save-prompts events
  pdjMidi.addEventListener('save-prompts', ((e: Event) => {
    const customEvent = e as CustomEvent<Map<string, Prompt>>;
    const prompts = customEvent.detail;
    savePromptsToStorage(prompts);
  }) as EventListener);

}

const STORAGE_KEY = 'promptdj_prompts';

function savePromptsToStorage(prompts: Map<string, Prompt>) {
  const promptsArray = Array.from(prompts.entries());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(promptsArray));
}

function loadPromptsFromStorage(): Map<string, Prompt> | null {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return null;
  
  try {
    const promptsArray = JSON.parse(saved);
    return new Map(promptsArray);
  } catch (e) {
    console.error('Failed to load prompts from storage:', e);
    return null;
  }
}

function buildInitialPrompts() {
  // Try to load from localStorage first
  const savedPrompts = loadPromptsFromStorage();
  if (savedPrompts) {
    return savedPrompts;
  }

  // If no saved prompts, create default ones
  const startOnTexts = ['House', 'Chill House'];
  const prompts = new Map<string, Prompt>();

  for (let i = 0; i < DEFAULT_PROMPTS.length; i++) {
    const promptId = `prompt-${i}`;
    const prompt = DEFAULT_PROMPTS[i];
    const { text, color } = prompt;
    prompts.set(promptId, {
      promptId,
      text,
      // Set weight to 1 if the prompt text is in our startOnTexts array, otherwise 0
      weight: startOnTexts.includes(text) ? 1 : 0,
      cc: i,
      color,
    });
  }

  // Save the default prompts to storage
  savePromptsToStorage(prompts);
  return prompts;
}

const DEFAULT_PROMPTS = [
  // House Genres
  { color: '#ff6600', text: 'House' },
  { color: '#5DADE2', text: 'Chill House' },
  { color: '#283747', text: 'Deep House' },
  { color: '#1ABC9C', text: 'Prog House' },
  { color: '#2af6de', text: 'Tech House' },
  { color: '#6c5ce7', text: 'Afro House' },
  { color: '#00b894', text: 'Organic House' },
  { color: '#e84393', text: 'Bass House' },
  { color: '#00cec9', text: 'Lo-Fi House' },
  { color: '#fd79a8', text: 'Slap House' },
  { color: '#6c5ce7', text: 'G-House' },
  { color: '#ff7675', text: 'Big Room' },
  { color: '#a29bfe', text: 'Future House' },
  { color: '#fd79a8', text: 'Tropical House' },
  { color: '#e84393', text: 'Jersey Club' },
  
  // Techno Genres
  { color: '#ff0000', text: 'Techno' },
  { color: '#ff6b6b', text: 'Melodic Techno' },
  { color: '#00b894', text: 'Minimal Techno' },
  { color: '#d63031', text: 'Hard Techno' },
  { color: '#e17055', text: 'Acid Techno' },
  { color: '#6c5ce7', text: 'Indust Techno' },
  { color: '#00b894', text: 'Dub Techno' },
  { color: '#fd79a8', text: 'Hypno Techno' },
  { color: '#a29bfe', text: 'Schranz' },
  { color: '#00cec9', text: 'Ambient Tech' },
  
  // Drum and Bass & Related
  { color: '#ff25f6', text: 'Drum and Bass' },
  { color: '#ff9f43', text: 'Jungle' },
  { color: '#5f27cd', text: 'Grime' },
  { color: '#00cec9', text: 'UK Garage' },
  { color: '#1dd1a1', text: 'Fut Garage' },
  
  // Bass Music
  { color: '#ffdd28', text: 'Dubstep' },
  { color: '#9900ff', text: 'Future Bass' },
  { color: '#ff9f43', text: 'Trap' },
  { color: '#e84393', text: 'Footwork' },
  { color: '#00cec9', text: 'Juke' },
  { color: '#ff9f43', text: 'Breakbeat' },
  
  // Melodic & Atmospheric
  { color: '#6c5ce7', text: 'Chillwave' },
  { color: '#00b894', text: 'Synthwave' },
  { color: '#fd79a8', text: 'Dream Pop' },
  { color: '#a29bfe', text: 'Shoegaze' },
  { color: '#ff9f43', text: 'New Age' },
  
  // Global & World Influences
  { color: '#e17055', text: 'Baile Funk' },
  { color: '#6c5ce7', text: 'Kuduro' },
  { color: '#00b894', text: 'Gqom' },
  { color: '#fd79a8', text: 'Amapiano' },
  { color: '#a29bfe', text: 'Afrobeat' },
  { color: '#00cec9', text: 'Cumbia' },
  { color: '#00cec9', text: 'E-Swing' },
  
  // Other Electronic
  { color: '#6c5ce7', text: 'Electro' },
  { color: '#ff9f43', text: 'Hyperpop' },
  { color: '#1dd1a1', text: 'Decon Club' },
  { color: '#5f27cd', text: 'Witch House' },
  { color: '#ff9f43', text: 'Vaporwave' },
  { color: '#e84393', text: 'Glitch' },
  { color: '#00cec9', text: 'IDM' },
  { color: '#6c5ce7', text: 'Breakcore' },
  { color: '#ff6b6b', text: 'Hardstyle' },
  { color: '#a29bfe', text: 'Eurodance' },
  { color: '#00b894', text: 'Trance' }
];

main();