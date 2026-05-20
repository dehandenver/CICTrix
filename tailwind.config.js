/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        brand: {
          DEFAULT: '#363EE8',
          hover: '#2E35D4',
          soft: '#EEF2FF',
        },
        ink: {
          DEFAULT: '#050D65',
          secondary: '#6B7280',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          bg: '#F8FAFC',
          border: '#E5E7EB',
        },
      },
      borderRadius: {
        '2xl': '18px',
        '3xl': '24px',
      },
      boxShadow: {
        'soft-sm': '0 1px 3px 0 rgba(5, 13, 101, 0.04), 0 1px 2px -1px rgba(5, 13, 101, 0.04)',
        'soft-md': '0 4px 16px -2px rgba(5, 13, 101, 0.06), 0 2px 6px -2px rgba(5, 13, 101, 0.04)',
        'soft-lg': '0 10px 32px -4px rgba(5, 13, 101, 0.08), 0 4px 12px -4px rgba(5, 13, 101, 0.05)',
        'soft-xl': '0 20px 48px -8px rgba(5, 13, 101, 0.10), 0 8px 20px -8px rgba(5, 13, 101, 0.06)',
      },
    },
  },
  plugins: [],
};
