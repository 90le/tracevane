import { copyTextToClipboard as copyTextToClipboardCompat } from '../../shared/clipboard';

export const COPIED_FOR_MS = 1500;
export const ERROR_FOR_MS = 2000;

export async function copyTextToClipboard(text: string): Promise<boolean> {
  return await copyTextToClipboardCompat(text);
}
