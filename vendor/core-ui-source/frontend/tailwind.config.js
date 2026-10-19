/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html","./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      maxWidth: {
        /** Header + main + right sidebar: centered on md+; smaller = wider side margins */
        'app-shell': '1600px',
        /** Editorial page content column — Feed, Track, Mission Control.
         *  1440 gives a wide but bounded measure with breathing room
         *  on either side at modern desktop widths. Per-page gutter
         *  padding (md:px-10) layers on top. */
        'page': '1440px',
        /** Dialog dimension tokens (FE layering ADR). Source of truth:
         *  `--dialog-w-*` CSS vars in index.css. Every modal picks from
         *  this set — new arbitrary widths are forbidden by lint. */
        'dialog-confirm': 'var(--dialog-w-confirm)',  /* 480px — confirm prompts */
        'dialog-form':    'var(--dialog-w-form)',     /* 720px — standard control modal */
        'dialog-wide':    'var(--dialog-w-wide)',     /* 1024px — media viewers */
        'dialog-workspace': 'var(--dialog-w-workspace)', /* ~1480 / 96vw — multi-pane builders */
        'dialog-workspace-max': 'var(--dialog-w-workspace-max)', /* ~1920 / 98vw — expanded builder */
      },
      zIndex: {
        /** Viewport-level stacking ladder. Source of truth: the `--z-*`
         *  CSS vars in index.css, which document what each tier is for
         *  and why the order is what it is. Fixed and portaled surfaces
         *  pick from this set instead of inventing `z-[1000]`.
         *  Component-local stacking keeps plain z-10/z-20 — see the
         *  var block for where the line falls. */
        'topbar':         'var(--z-topbar)',
        'rail':           'var(--z-rail)',
        'scrim':          'var(--z-scrim)',
        'drawer':         'var(--z-drawer)',
        'dock':           'var(--z-dock)',
        'overlay':        'var(--z-overlay)',
        'overlay-nested': 'var(--z-overlay-nested)',
        'popover':        'var(--z-popover)',
        'system-bar':     'var(--z-system-bar)',
        'palette':        'var(--z-palette)',
        'toast':          'var(--z-toast)',
        'max':            'var(--z-max)',
      },
      borderRadius: {
        /** Slightly softer than default lg (0.5rem); form fields use --radius-input via app-input */
        lg: '0.6875rem',
      },
      fontFamily: {
        // Inter throughout — purpose-designed for screen UI, supports
        // OpenType feature settings for tabular figures, alternate '1',
        // disambiguated '0', etc. Both display and body share the
        // family; weight + tracking carry the hierarchy.
        sans: ['"Inter var"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Inter var"', 'Inter', 'system-ui', 'sans-serif'],
      },
      // Compact UI scale with comfortable line spacing; metadata stays at 12px.
      fontSize: {
        xs:   ['0.8125rem', { lineHeight: '1.1875rem' }], // 13 / 19
        sm:   ['0.9375rem', { lineHeight: '1.375rem' }],  // 15 / 22
        base: ['1rem',      { lineHeight: '1.5rem' }],    // 16 / 24
        lg:   ['1.125rem',  { lineHeight: '1.625rem' }],  // 18 / 26
      },
      // Named motion tokens mirroring the --dur-*/--ease-* CSS vars in
      // index.css. Use these (`duration-fast`, `duration-base`, `ease-fast`)
      // instead of arbitrary `duration-[var(--dur-fast)]` — arbitrary
      // duration/ease values collide with tailwindcss-animate's animation-*
      // utilities and emit "ambiguous … matches multiple utilities" warnings;
      // named scale values resolve cleanly.
      transitionDuration: {
        fast: 'var(--dur-fast)',
        base: 'var(--dur-base)',
      },
      transitionTimingFunction: {
        fast: 'var(--ease-fast)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'agent-working': 'agentWorking 1.6s ease-in-out infinite',
        'status-reveal': 'statusReveal 0.4s ease-out both',
        'slide-up': 'slideUp 0.25s ease-out',
      },
      keyframes: {
        fadeIn: {'0%':{opacity:'0'},'100%':{opacity:'1'}},
        agentWorking: {
          '0%, 100%': { opacity: '0.25', transform: 'scale(0.86)' },
          '50%': { opacity: '1', transform: 'scale(1.08)' },
        },
        statusReveal: {
          '0%': { opacity: '0.1' },
          '100%': { opacity: '1' },
        },
        slideUp: {'0%':{transform:'translateY(8px)',opacity:'0'},'100%':{transform:'translateY(0)',opacity:'1'}},
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
}
