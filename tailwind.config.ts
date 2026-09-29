import type { Config } from 'tailwindcss';

/**
 * Tokens Campagnes — source unique de vérité côté Tailwind.
 * Miroir exact de `app/globals.css` (variables CSS).
 *
 * RÈGLE : un seul dégradé dans tout le produit (`brand-gradient`).
 * Aucun autre dégradé ne doit être créé.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#000000',
        purple: '#7B61FF',
        coral: '#FF6B6B',
        yellow: '#FFD93D',
        gray: {
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          400: '#9CA3AF',
          500: '#6B7280',
          700: '#374151',
          900: '#111827',
        },
        success: '#22C55E',
        warning: '#FFD93D',
        error: '#EF4444',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', '-apple-system', 'sans-serif'],
        script: ['var(--font-satisfy)', 'cursive'],
      },
      backgroundImage: {
        'brand-gradient': 'var(--gradient-brand)',
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
        pill: '999px',
      },
      boxShadow: {
        sm: '0 2px 8px rgba(0,0,0,.06)',
        md: '0 8px 24px rgba(0,0,0,.08)',
        lg: '0 16px 48px rgba(0,0,0,.12)',
      },
      maxWidth: {
        shell: '1200px',
      },
      spacing: {
        18: '4.5rem',
      },
      transitionTimingFunction: {
        brand: 'cubic-bezier(.2,.8,.2,1)',
      },
      keyframes: {
        'gradient-drift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        // Sert uniquement à l'aperçu « Cadre vidéo » du sélecteur de type :
        // montrer qu'un élément du cadre bouge, sans lire une vraie vidéo.
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-7%)' },
        },
      },
      animation: {
        'gradient-drift': 'gradient-drift 12s ease-in-out infinite',
        'fade-up': 'fade-up 250ms cubic-bezier(.2,.8,.2,1) both',
        float: 'float 2.6s cubic-bezier(.2,.8,.2,1) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
