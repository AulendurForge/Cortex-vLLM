import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2ff',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
        },
      },
      boxShadow: {
        glass: '0 10px 30px -10px rgba(0,0,0,0.4)',
      },
      backgroundImage: {
        'cortex-gradient':
          'radial-gradient(60% 60% at 20% 10%, rgba(99,102,241,0.18) 0%, rgba(99,102,241,0) 60%), radial-gradient(60% 60% at 80% 0%, rgba(34,197,94,0.12) 0%, rgba(34,197,94,0) 60%), radial-gradient(80% 60% at 50% 100%, rgba(14,165,233,0.16) 0%, rgba(14,165,233,0) 60%), linear-gradient(180deg, #0b1020 0%, #0a0f1a 100%)',
      },
      borderColor: {
        glass: 'rgba(255,255,255,0.08)',
      },
    },
  },
  plugins: [],
};

export default config;