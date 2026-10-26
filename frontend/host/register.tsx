import { mountWindowChrome } from './window-chrome';

type WindowChromeMenu = { id: string; label: string };
type WindowChromeBridge = {
  height: number;
  menus: WindowChromeMenu[];
  popupMenu(id: string, x: number, y: number): Promise<unknown>;
  setCaptionTheme(theme: 'light' | 'dark'): Promise<unknown>;
};

const chrome = (window as Window & {
  integralDesktop?: { windowChrome?: WindowChromeBridge };
}).integralDesktop?.windowChrome;

if (chrome) mountWindowChrome(document, chrome, localStorage);
