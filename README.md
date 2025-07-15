# AI DJ App

A real-time music generation application powered by Google's Gemini AI, designed to create and control music playback in a web browser.

## Features

-   **Real-time Music Generation**:
    -   Harnesses Google's advanced `lyria-realtime-exp` AI model to generate high-fidelity music in real-time.
    -   Experience dynamic text-to-music generation with intelligent AI filtering for seamless musical coherence.
    -   Built-in safety filters ensure generated content remains appropriate.

-   **Interactive Genre Curation**:
    -   Explore a vast library of **78 genres**, from House and Techno to Synthwave and Ambient.
    -   Dynamically activate and deactivate genre tiles with a single click to influence the AI.
    -   The AI intelligently blends your selected genres, creating harmonious and unexpected fusions.
    -   Your custom genre selections and tile arrangements are **automatically saved** in your browser and reloaded for a personalized experience every time.

-   **Recording & Sharing**:
    -   Capture your AI-generated music at any moment with a single click.
    -   Recorded sessions are automatically prepared for download with descriptive filenames.
    -   Download your recordings as high-quality audio files to share your unique AI DJ sets with the world.

-   **Live Audio Visualization**:
    -   Immerse yourself in the sound with a dynamic, real-time audio waveform display.
    -   Visually monitor the music's intensity and frequency spectrum as it's being generated.

-   **Mobile Ready (Android)**:
    -   Built with Capacitor, allowing the web application to be seamlessly compiled and run as a native Android app.
    -   Includes scripts and a GitHub Actions workflow for building and verifying the Android APK.

-   **Playback Controls & Notifications**:
    -   Standard Play/Pause and Volume controls for easy management.
    -   Stay informed with non-intrusive toast notifications for playback status, recording updates, and other important alerts.

## Project Structure

-   `components/`: Contains the primary React components that build the user interface.
-   `utils/`: Houses utility classes for core functionalities like the `LiveMusicHelper` for AI interaction and the `AudioAnalyser` for visualization.
-   `proxy-server/`: Contains a simple Express proxy server (optional, for securely managing API keys in a deployed environment).
-   `scripts/`: Includes shell scripts for building and verifying the Android application.
-   `index.tsx`: The main application entry point that orchestrates the AI, audio context, and UI component setup.
-   `.github/workflows/`: Contains the CI/CD pipeline for automatically building the Android APK.

## Setup and Running (Web)

**Prerequisites:**

-   Node.js (v18.x or later)
-   A Google Gemini API key.

1.  **Install dependencies:**
    
