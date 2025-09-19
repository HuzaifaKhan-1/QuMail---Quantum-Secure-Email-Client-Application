import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        chart: {
          "1": "var(--chart-1)",
          "2": "var(--chart-2)",
          "3": "var(--chart-3)",
          "4": "var(--chart-4)",
          "5": "var(--chart-5)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar-background)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
        // Quantum security level colors
        quantum: {
          "level1": "hsl(159.7826, 100%, 36.0784%)", // Green for OTP
          "level2": "hsl(221.2, 83.2%, 53.3%)", // Blue for AES
          "level3": "hsl(271.5, 81.0%, 55.9%)", // Purple for PQC
          "level4": "hsl(210, 10%, 50%)", // Gray for plain
        }
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        "quantum-pulse": {
          "0%, 100%": {
            opacity: "1",
          },
          "50%": {
            opacity: "0.5",
          },
        },
        "quantum-shimmer": {
          "0%": {
            backgroundPosition: "200% 0",
          },
          "100%": {
            backgroundPosition: "-200% 0",
          },
        },
        "security-glow": {
          "0%, 100%": {
            boxShadow: "0 0 5px hsl(var(--accent))",
          },
          "50%": {
            boxShadow: "0 0 20px hsl(var(--accent)), 0 0 30px hsl(var(--accent))",
          },
        }
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "quantum-pulse": "quantum-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "quantum-shimmer": "quantum-shimmer 2s infinite",
        "security-glow": "security-glow 2s ease-in-out infinite",
      },
      backgroundImage: {
        "gradient-quantum": "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%)",
        "gradient-security": "linear-gradient(90deg, hsl(var(--quantum-level1)) 0%, hsl(var(--quantum-level2)) 50%, hsl(var(--quantum-level3)) 100%)",
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      },
      minHeight: {
        '0': '0',
        '1/4': '25%',
        '1/2': '50%',
        '3/4': '75%',
        'full': '100%',
      },
      maxWidth: {
        '8xl': '88rem',
        '9xl': '96rem',
      }
    },
  },
  plugins: [
    require("tailwindcss-animate"), 
    require("@tailwindcss/typography"),
    // Custom plugin for quantum security utilities
    function({ addUtilities }: { addUtilities: any }) {
      const newUtilities = {
        '.quantum-security-indicator': {
          position: 'relative',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            background: 'linear-gradient(90deg, transparent 0%, hsl(var(--accent)) 50%, transparent 100%)',
            animation: 'quantum-shimmer 2s infinite',
            zIndex: '-1',
          }
        },
        '.security-level-glow': {
          boxShadow: '0 0 10px hsl(var(--accent)), 0 0 20px hsl(var(--accent))',
        },
        '.quantum-card': {
          background: 'linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--muted)) 100%)',
          border: '1px solid hsl(var(--border))',
          borderRadius: 'var(--radius)',
        }
      }
      addUtilities(newUtilities)
    }
  ],
} satisfies Config;
