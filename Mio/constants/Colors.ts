/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const tintColorLight = '#0a7ea4';
const tintColorDark = '#0a7ea4';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorDark,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorDark,
  },
};

export const COLORS = {
  // primary: '#FFCCE1',
  primary: '#b17a7d',
  // secondary: '#8174A0',
  secondary: '#6d1315',
  tertiary: '#F2F9FF',
  quaternary: '#FFF5D7',
  maroon: '#b17a7d',
  darkMaroon: '#924a4d',
  darkestMaroon: '#6d1315',
  white: '#FFFFFF',
  black: '#000000',
  error: '#a60c0c',
  success: '#28a745',
  warning: '#FFA500',
  gradient: {
    darkPink: '#f3d8df',
    lightPink: '#faebee',
    start: '#8B0000'
  },
  text: {
    primary: '#333333',
    secondary: '#666666',
    light: '#999999',
  },
};
