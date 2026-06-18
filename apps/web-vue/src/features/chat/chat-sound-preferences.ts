const CHAT_SOUND_CUES_ENABLED_KEY = 'tracevane.chat.sound-cues-enabled';
const DEFAULT_CHAT_SOUND_CUES_ENABLED = true;

type CueKind = 'sent' | 'received';
type AudioContextCtor = typeof AudioContext;

let sharedAudioContext: AudioContext | null = null;
const lastCueAtByKind: Record<CueKind, number> = {
  sent: 0,
  received: 0,
};

function resolveAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const audioWindow = window as Window & typeof globalThis & { webkitAudioContext?: AudioContextCtor };
  const candidate = audioWindow.AudioContext
    || audioWindow.webkitAudioContext
    || null;
  return candidate;
}

function readStorageValue(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage.getItem(CHAT_SOUND_CUES_ENABLED_KEY);
  } catch {
    return null;
  }
}

function getSharedAudioContext(): AudioContext | null {
  if (sharedAudioContext && sharedAudioContext.state !== 'closed') {
    return sharedAudioContext;
  }
  const AudioContextRef = resolveAudioContextCtor();
  if (!AudioContextRef) {
    return null;
  }
  try {
    sharedAudioContext = new AudioContextRef();
  } catch {
    sharedAudioContext = null;
  }
  return sharedAudioContext;
}

function cueSettings(kind: CueKind): {
  duration: number;
  startFrequency: number;
  endFrequency: number;
  peakGain: number;
  type: OscillatorType;
} {
  if (kind === 'sent') {
    return {
      duration: 0.1,
      startFrequency: 720,
      endFrequency: 620,
      peakGain: 0.16,
      type: 'triangle',
    };
  }
  return {
    duration: 0.18,
    startFrequency: 540,
    endFrequency: 820,
    peakGain: 0.22,
    type: 'sine',
  };
}

export function readChatSoundCuesEnabled(): boolean {
  const raw = readStorageValue();
  if (raw === '0') {
    return false;
  }
  if (raw === '1') {
    return true;
  }
  return DEFAULT_CHAT_SOUND_CUES_ENABLED;
}

export function writeChatSoundCuesEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(CHAT_SOUND_CUES_ENABLED_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage failures and keep the in-memory toggle working.
  }
}

export async function playChatCue(kind: 'sent' | 'received'): Promise<void> {
  const now = Date.now();
  if (now - lastCueAtByKind[kind] < 120) {
    return;
  }
  lastCueAtByKind[kind] = now;

  const audioContext = getSharedAudioContext();
  if (!audioContext) {
    return;
  }

  if (audioContext.state === 'suspended') {
    try {
      await audioContext.resume();
    } catch {
      return;
    }
  }

  const settings = cueSettings(kind);
  const startAt = audioContext.currentTime;
  const stopAt = startAt + settings.duration;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = settings.type;
  oscillator.frequency.setValueAtTime(settings.startFrequency, startAt);
  oscillator.frequency.exponentialRampToValueAtTime(settings.endFrequency, stopAt);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(settings.peakGain, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(startAt);
  oscillator.stop(stopAt + 0.02);
}
