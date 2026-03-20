/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const palette = {
  primary: '#53E076',
  primaryContainer: '#1DB954',
  primaryFixed: '#72FE8F',
  inversePrimary: '#006E2D',
  surfaceLowest: '#0E0E0E',
  surface: '#131313',
  surfaceLow: '#1C1B1B',
  surfaceContainer: '#201F1F',
  surfaceHigh: '#2A2A2A',
  surfaceVariant: '#353534',
  surfaceBright: '#3A3939',
  onSurface: '#E5E2E1',
  onSurfaceVariant: '#BCCBB9',
  outline: '#869585',
  outlineVariant: '#3D4A3D',
  secondary: '#8CCDFF',
  secondaryContainer: '#2899D8',
  tertiary: '#FABD32',
  tertiaryContainer: '#CF9800',
  error: '#FFB4AB',
  errorContainer: '#93000A',
};

export const Colors = {
  light: {
    text: '#101312',
    background: '#F4F7F3',
    tint: palette.primaryContainer,
    icon: '#3C4A42',
    tabIconDefault: '#6F7A74',
    tabIconSelected: palette.primaryContainer,
    card: '#FFFFFF',
    border: '#D7E0D8',
    success: palette.primary,
    warning: palette.tertiary,
    danger: palette.errorContainer,
    info: palette.secondaryContainer,
  },
  dark: {
    text: palette.onSurface,
    background: palette.surface,
    tint: palette.primary,
    icon: palette.onSurfaceVariant,
    tabIconDefault: '#8FA08D',
    tabIconSelected: palette.primary,
    card: palette.surfaceLow,
    border: palette.outlineVariant,
    success: palette.primary,
    warning: palette.tertiary,
    danger: palette.error,
    info: palette.secondary,
    primaryContainer: palette.primaryContainer,
    primaryFixed: palette.primaryFixed,
    surfaceContainer: palette.surfaceContainer,
    surfaceHigh: palette.surfaceHigh,
    surfaceVariant: palette.surfaceVariant,
    surfaceBright: palette.surfaceBright,
    surfaceLowest: palette.surfaceLowest,
    inversePrimary: palette.inversePrimary,
    outline: palette.outline,
    secondaryContainer: palette.secondaryContainer,
    tertiaryContainer: palette.tertiaryContainer,
    errorContainer: palette.errorContainer,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
