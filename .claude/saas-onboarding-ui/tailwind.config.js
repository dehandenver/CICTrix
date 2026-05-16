module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#4F46E5', // Indigo
        secondary: '#FBBF24', // Amber
        accent: '#3B82F6', // Blue
        background: '#F9FAFB', // Gray
        text: {
          primary: '#111827', // Black
          secondary: '#6B7280', // Gray
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}