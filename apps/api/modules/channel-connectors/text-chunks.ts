export const CHANNEL_CONNECTOR_DEFAULT_TEXT_CHUNK_RUNES = 3800;

export function splitChannelConnectorTextChunks(
  content: string,
  maxRunes = CHANNEL_CONNECTOR_DEFAULT_TEXT_CHUNK_RUNES,
): string[] {
  const runes = Array.from(String(content || ""));
  if (maxRunes <= 0 || runes.length <= maxRunes) return [String(content || "")];
  const chunks: string[] = [];
  while (runes.length > 0) {
    if (runes.length <= maxRunes) {
      chunks.push(runes.splice(0).join(""));
      break;
    }
    let end = maxRunes;
    for (let index = end - 1; index > 0; index -= 1) {
      if (runes[index] !== "\n") continue;
      if (index >= Math.floor(end / 2)) {
        end = index + 1;
      }
      break;
    }
    chunks.push(runes.splice(0, end).join(""));
  }
  return chunks;
}
