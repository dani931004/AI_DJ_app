# AI DJ App

A real-time music generation application powered by Google's Gemini AI, designed to create and control music playback in a web browser.

## Features

- **Real-time music generation using Google's Gemini AI**
  - Uses Google's advanced AI model (`lyria-realtime-exp`) to generate high-quality music in real-time
  - Supports real-time text-to-music generation with AI filtering
  - Includes safety filtering for generated content
  - Maintains musical coherence through AI prompt management

- **Auto DJ mode**
  - Creates a DJ-style playlist that transitions between different music genres
  - Automatically generates a sequence of genre transitions every 30 seconds
  - Uses AI to create smooth transitions between musical styles
  - Maintains musical coherence while exploring different genres
  - Continuously refreshes the playlist to provide endless variety

- **Volume control**
  - Real-time volume adjustment during playback
  - Smooth transitions between volume levels
  - Maintains audio quality at all volume levels

- **Play/Pause functionality**
  - Toggle music playback with a dedicated button
  - Maintains playback state across interactions
  - Automatic error handling with user feedback
  - Supports recording while playing

- **Audio visualization**
  - Real-time audio waveform display
  - Visual feedback of music intensity and frequency
  - Helps monitor audio output quality
  - Automatic visualization during playback

- **Genre-based prompt management**
  - Interactive genre buttons for music style selection
  - Visual feedback for genre selection
  - Supports multiple genre combinations
  - AI-optimized genre transitions

## Project Structure

- `components/`: Contains React components
- `utils/`: Utility classes for audio analysis and music generation
- `types.ts`: TypeScript type definitions
- `index.tsx`: Main application entry point

## Setup and Running

**Prerequisites:**
- Node.js
- Google Gemini API key

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables:
   - Set the `GEMINI_API_KEY` in [.env](.env) to your Gemini API key: `GEMINI_API_KEY=your_api_key_here`

3. Run the development server:
   ```bash
   npm run dev
   ```

The app will be available at `http://localhost:5173`

## Technical Details

- Built with React and TypeScript
- Uses Google's Gemini AI model (`lyria-realtime-exp`)
- Implements real-time audio processing and analysis

## Development

The project uses Vite for build and development. The main entry point is `index.tsx` which sets up the audio context and AI integration.

## License

This project is licensed under the Apache-2.0 license. See [LICENSE](LICENSE) for details.
