# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

## Run Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env.local` file in the project root with your API key:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```

## Running on Desktop

For development:
```bash
npm run dev
```

For production build:
```bash
npm run build
npm run preview
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
