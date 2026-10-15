import type { ExpoConfig } from 'expo/config';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/v1';

const config: ExpoConfig = {
  name: 'Valorize',
  slug: 'valorize-finance',
  scheme: 'valorize',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  backgroundColor: '#07111c',
  icon: './assets/icon.png',
  splash: { image: './assets/splash.png', resizeMode: 'contain', backgroundColor: '#07111c' },
  ios: {
    bundleIdentifier: 'finance.valorize.app',
    supportsTablet: false,
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      NSLocationWhenInUseUsageDescription: 'Usamos tu ubicación para mostrarte las oficinas más cercanas.',
      NSCameraUsageDescription: 'Para fotografiar tu documento de identidad.',
      NSPhotoLibraryUsageDescription: 'Para adjuntar una foto de tu documento de identidad.',
    },
  },
  android: {
    package: 'finance.valorize.app',
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#07111c' },
    permissions: ['ACCESS_COARSE_LOCATION', 'POST_NOTIFICATIONS'],
    config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY } },
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    ['expo-notifications', { color: '#24cf8a' }],
    ['expo-location', { locationWhenInUsePermission: 'Usamos tu ubicación para mostrarte las oficinas más cercanas.' }],
  ],
  experiments: { typedRoutes: false },
  extra: { apiUrl: API_URL, eas: { projectId: process.env.EAS_PROJECT_ID } },
};

export default config;
