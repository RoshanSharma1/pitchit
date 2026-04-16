const IS_DEV = process.env.APP_VARIANT === 'development';

export default {
  name: IS_DEV ? 'PitchIt (Dev)' : 'PitchIt',
  slug: 'pitchit',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.pitchit.app',
    infoPlist: {
      NSMicrophoneUsageDescription:
        'PitchIt needs microphone access to record your voice memos and ideas.',
      NSSpeechRecognitionUsageDescription:
        'PitchIt uses speech recognition to transcribe your recordings.',
    },
  },
  plugins: [
    'expo-router',
    [
      'expo-av',
      {
        microphonePermission:
          'PitchIt needs microphone access to record your voice memos and ideas.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    geminiApiKey: process.env.GEMINI_API_KEY ?? '',
    eas: {
      projectId: '',
    },
  },
  scheme: 'pitchit',
};
