# PromptDJ MIDI - Real-time AI Music Controller

An innovative music production application that leverages AI to transform MIDI controller inputs into real-time music generation. Built with Google's Gemini AI and modern web technologies, PromptDJ MIDI enables musicians and producers to create music interactively using MIDI controllers.

## Features

- Real-time music generation powered by Google's Gemini AI
- MIDI controller integration for dynamic music control
- Weighted prompt system for nuanced music generation
- Cross-platform support (Web, Android)
- Live audio analysis and feedback
- Customizable prompts and control mappings
- Audio recording capabilities

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm (v9 or higher)
- Android Studio (for Android builds)
- MIDI controller (optional)

### Installation
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env.local` file with your Google Gemini API key:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```

## Usage

### Desktop Development
Run the application in development mode:
```bash
npm run dev
```

Build for production:
```bash
npm run build
npm run preview
```

### Android Development
1. Build the web app:
   ```bash
   npm run build
   ```
2. Add Android platform (first time only):
   ```bash
   npx cap add android
   ```
3. Sync with Android:
   ```bash
   npm run android:sync
   ```
4. Open in Android Studio:
   ```bash
   npm run android:open
   ```

### One-Click Build and Run
To build and run on Android:
```bash
npm run android:run
```

## Running on Android

1. Make sure you have Android Studio installed with the Android SDK

2. Build the web app:
   ```bash
   npm run build
   ```

3. Add Android platform (first time only):
   ```bash
   npx cap add android
   ```

4. Sync the web app with Android:
   ```bash
   npm run android:sync
   ```

5. Open the project in Android Studio:
   ```bash
   npm run android:open
   ```

6. In Android Studio, you can:
   - Run the app on an emulator
   - Build a debug APK
   - Generate a signed APK for release

## One-Command Build and Run

To build the web app, sync with Android, and run on a connected device/emulator:

```bash
npm run android:run
```

## Building for Release

1. Create a keystore file (first time only):
   ```bash
   keytool -genkey -v -keystore release.keystore -alias release -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Set up environment variables for the keystore:
   ```bash
   export KEYSTORE_PASSWORD=your_keystore_password
   export KEY_PASSWORD=your_key_password
   ```

3. Build the release APK in Android Studio or run:
   ```bash
   cd android
   ./gradlew assembleRelease
   ```

The APK will be located at `android/app/build/outputs/apk/release/app-release.apk`

## GitHub Actions CI/CD

This project uses GitHub Actions for automated builds. The workflow:
1. Triggers on push to main branch
2. Runs tests and linting
3. Builds the web application
4. Creates Android APK
5. Automatically deploys to release channels

## Usage Guide

1. Connect your MIDI controller
2. Configure control mappings in the app
3. Create and customize prompts for different musical styles
4. Adjust weight sliders for each prompt
5. Start playing your MIDI controller to generate music
6. Use the audio level visualization for feedback
7. Record your sessions using the built-in recorder

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

Apache-2.0
