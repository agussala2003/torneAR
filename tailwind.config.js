/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#53E076",
          "primary-container": "#1DB954",
          "primary-fixed": "#72FE8F",
          "inverse-primary": "#006E2D",
        },
        surface: {
          lowest: "#0E0E0E",
          base: "#131313",
          low: "#1C1B1B",
          container: "#201F1F",
          high: "#2A2A2A",
          variant: "#353534",
          bright: "#3A3939",
        },
        neutral: {
          "on-surface": "#E5E2E1",
          "on-surface-variant": "#BCCBB9",
          outline: "#869585",
          "outline-variant": "#3D4A3D",
          "inverse-surface": "#E5E2E1",
          "inverse-on-surface": "#313030",
        },
        info: {
          secondary: "#8CCDFF",
          "secondary-fixed": "#CAE6FF",
          "secondary-container": "#2899D8",
          "on-secondary": "#00344E",
          "on-secondary-container": "#002D44",
          "on-secondary-fixed": "#001E2F",
          "on-secondary-fixed-variant": "#004B6F",
        },
        warning: {
          tertiary: "#FABD32",
          "tertiary-fixed": "#FFDEA4",
          "tertiary-container": "#CF9800",
          "on-tertiary": "#412D00",
          "on-tertiary-container": "#4A3400",
          "on-tertiary-fixed": "#261900",
          "on-tertiary-fixed-variant": "#5D4200",
        },
        danger: {
          error: "#FFB4AB",
          "error-container": "#93000A",
          "on-error": "#690005",
          "on-error-container": "#FFDAD6",
          "alert-orange": "#E8821A",
        },
      },
      boxShadow: {
        "ambient-sm": "0 4px 20px rgba(0,0,0,0.4)",
        "ambient-lg": "0 20px 40px rgba(0,0,0,0.4)",
        "glow-primary": "0 0 20px rgba(83,224,118,0.3)",
      },
    },
  },
  plugins: [],
};
