import { Extension } from '@tiptap/core';
import { FONT_FAMILY_OPTIONS } from '../documentTheme';
import { firstFontFamily, readStyleAttribute } from './styleAttribute';

export type FontFamilyOptions = {
  types: string[];
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontFamily: {
      setFontFamily: (fontFamily: string) => ReturnType;
      unsetFontFamily: () => ReturnType;
    };
    fontSize: {
      setFontSize: (fontSize: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

const ALLOWED_FONT_FAMILIES: string[] = FONT_FAMILY_OPTIONS.map(o => o.value).filter(
  v => v.length > 0,
);

export const FontFamily = Extension.create<FontFamilyOptions>({
  name: 'fontFamily',
  addOptions() {
    return { types: ['textStyle'] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: element => {
              const el = element as HTMLElement;
              return (
                firstFontFamily(readStyleAttribute(el, 'font-family')) ||
                firstFontFamily(el.style.fontFamily || null)
              );
            },
            renderHTML: attributes => {
              if (!attributes.fontFamily) return {};
              return { style: `font-family: ${attributes.fontFamily}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontFamily:
        (fontFamily: string) =>
        ({ chain }) => {
          const safe = ALLOWED_FONT_FAMILIES.includes(fontFamily) ? fontFamily : '';
          if (!safe) {
            return chain().setMark('textStyle', { fontFamily: null }).run();
          }
          return chain().setMark('textStyle', { fontFamily: safe }).run();
        },
      unsetFontFamily:
        () =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontFamily: null }).removeEmptyTextStyle().run(),
    };
  },
});

export const FontSize = Extension.create<{ types: string[] }>({
  name: 'fontSize',
  addOptions() {
    return { types: ['textStyle'] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: element => {
              const el = element as HTMLElement;
              const raw =
                readStyleAttribute(el, 'font-size') || el.style.fontSize || '';
              if (!raw.trim()) return null;
              return raw.trim();
            },
            renderHTML: attributes => {
              if (!attributes.fontSize) return {};
              const raw = String(attributes.fontSize).trim();
              const withUnit = /pt|px|em|rem|%/.test(raw) ? raw : `${raw}pt`;
              return { style: `font-size: ${withUnit}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }) => {
          const n = parseInt(fontSize, 10);
          if (!Number.isFinite(n) || n < 6 || n > 72) return false;
          return chain().setMark('textStyle', { fontSize: String(n) }).run();
        },
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});
