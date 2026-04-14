// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        chosun: ['Chosunilbo_myungjo', 'serif'], // 기존
        ridi: ['RIDIBatang', 'serif'],           // ✅ 추가
      },
    },
  },
  plugins: [],
}
