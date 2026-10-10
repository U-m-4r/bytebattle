/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        void: '#08090B',
        surface: '#111318',
        elevated: '#1A1D24',
        border: {
          DEFAULT: '#252830',
          hi: '#353A45',
        },
        tx: {
          primary: '#F0F2F5',
          body: '#9BA3AF',
          muted: '#5C6370',
        },
        violet: {
          DEFAULT: '#7C3AED',
          hi: '#8B5CF6',
          lo: '#3B1E73',
          dim: '#2D1A5E',
        },
        lime: {
          DEFAULT: '#84CC16',
          hi: '#A3E635',
          dim: '#1A2E05',
        },
        amber: {
          DEFAULT: '#F59E0B',
          dim: '#2D1F02',
        },
        crimson: {
          DEFAULT: '#EF4444',
          dim: '#2D0A0A',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
