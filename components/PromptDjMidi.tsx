import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { PlaybackState, Prompt } from '../types';
import { GoogleGenAI } from '@google/genai';
import './PromptDjMidi.css';

interface PromptDjMidiProps {
  prompts: Map<string, Prompt>;
  genreOrder: Array<{ promptId: string }>;
  ai: GoogleGenAI;
}

export const PromptDjMidi: React.FC<PromptDjMidiProps> = ({ prompts, genreOrder, ai }) => {
  const [selectedPrompt, setSelectedPrompt] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [error, setError] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string>('');
  const sortableRef = useRef<HTMLDivElement>(null);

  const handlePromptsChanged = useCallback((newPrompts: Map<string, Prompt>) => {
    // Dispatch custom event for parent component
    const event = new CustomEvent('prompts-changed', {
      detail: newPrompts,
      bubbles: true,
      composed: true,
    });
    document.dispatchEvent(event);
  }, []);

  const handleVolumeChanged = useCallback((newVolume: number) => {
    setVolume(newVolume);
    const event = new CustomEvent('volume-changed', {
      detail: newVolume,
      bubbles: true,
      composed: true,
    });
    document.dispatchEvent(event);
  }, []);

  const handlePlayPause = useCallback(() => {
    setIsPlaying(!isPlaying);
    const event = new CustomEvent('play-pause', {
      bubbles: true,
      composed: true,
    });
    document.dispatchEvent(event);
  }, [isPlaying]);

  const handleError = useCallback((err: Error) => {
    setError(err.message);
    const event = new CustomEvent('error', {
      detail: err,
      bubbles: true,
      composed: true,
    });
    document.dispatchEvent(event);
  }, []);

  const handleToast = useCallback((message: string) => {
    setToastMessage(message);
    const event = new CustomEvent('toast', {
      detail: message,
      bubbles: true,
      composed: true,
    });
    document.dispatchEvent(event);
  }, []);

  useEffect(() => {
    if (sortableRef.current) {
      new Sortable(sortableRef.current, {
        animation: 150,
        onEnd: (evt) => {
          // Handle sorting logic here
        },
      });
    }
  }, []);

  return (
    <div className="prompt-dj-midi">
      <div className="controls">
        <button onClick={handlePlayPause}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={(e) => handleVolumeChanged(parseFloat(e.target.value))}
        />
      </div>
      <div ref={sortableRef} className="prompt-grid">
        {genreOrder.map((genre) => (
          <div key={genre.promptId} className="prompt-item">
            <button
              onClick={() => setSelectedPrompt(genre.promptId)}
              className={selectedPrompt === genre.promptId ? 'selected' : ''}
            >
              {prompts.get(genre.promptId)?.text}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
