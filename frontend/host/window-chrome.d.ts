export function mountWindowChrome(
  document: Document,
  chrome: {
    height: number;
    menus: { id: string; label: string }[];
    popupMenu(id: string, x: number, y: number): Promise<unknown>;
    setCaptionTheme(theme: 'light' | 'dark'): Promise<unknown>;
  },
  storage: Pick<Storage, 'getItem'>,
): void;
