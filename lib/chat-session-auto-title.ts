import type { ChatMessageItem, ChatSessionRow } from '../types/chat.js';
import { normalizeChatHistoryText } from './chat-history-normalization.js';

const AUTO_TITLE_MAX_LEN = 40;
const AUTO_TITLE_MAX_USER_MESSAGES = 3;

const WEAK_TITLE_PATTERNS = [
  /^(?:hi|hello|hey|yo|sup|ok|okay|thanks?|thank you|test)$/iu,
  /^(?:你好|您好|嗨|哈喽|在吗|在不在|空闲|继续|继续吧|继续？|开始|测试|收到|好的|行|嗯)$/u,
  /^say hi~?$/iu,
];

const LEADING_REQUEST_PREFIXES = [
  /^(?:please\s+)?(?:help me(?:\s+with)?|can you|could you|would you|please|i need(?: you)? to|i want(?: you)? to|let'?s|need to)\s+/iu,
  /^(?:请帮我|可以帮我|麻烦你?|请你?|帮我|能不能|可否|我想(?:让你)?|我需要(?:你)?|需要你|想让你)\s*/u,
  /^(?:分析下|分析一下|看下|看一下|帮我看下|帮我分析下|请分析|请帮我分析下|分析|梳理|总结|检查|排查)\s*/u,
];

function trimToWordBoundary(text: string, maxLen: number): string {
  if (text.length <= maxLen) {
    return text;
  }
  const cut = text.slice(0, maxLen - 1).trimEnd();
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > maxLen * 0.55) {
    return `${cut.slice(0, lastSpace).trimEnd()}…`;
  }
  return `${cut}…`;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function stripRequestPrefixes(text: string): string {
  let next = text;
  for (const pattern of LEADING_REQUEST_PREFIXES) {
    const stripped = next.replace(pattern, '').trim();
    if (stripped && stripped.length >= 4) {
      next = stripped;
    }
  }
  return next;
}

function pickTitleFragment(text: string): string {
  const sentenceSeparators = ['\n', '。', '！', '？', '!', '?'];
  let best = text;

  for (const separator of sentenceSeparators) {
    const index = text.indexOf(separator);
    if (index >= 4) {
      best = text.slice(0, index).trim();
      break;
    }
  }

  if (best !== text) {
    return best;
  }

  const clauseSeparators = ['，', ',', '：', ':', '；', ';'];
  for (const separator of clauseSeparators) {
    const index = text.indexOf(separator);
    if (index >= 4 && index <= 28) {
      return text.slice(0, index).trim();
    }
  }

  return text;
}

function isWeakTitleCandidate(text: string): boolean {
  const normalized = normalizeWhitespace(text)
    .replace(/^[`"'“”‘’]+|[`"'“”‘’]+$/g, '')
    .replace(/[~!,.?。！，、；;:：]+$/g, '')
    .trim();

  if (!normalized) {
    return true;
  }
  if (normalized.length <= 1) {
    return true;
  }
  if (/^\p{P}+$/u.test(normalized)) {
    return true;
  }
  return WEAK_TITLE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function normalizeUserMessageForTitle(text: string): string | null {
  const normalized = normalizeChatHistoryText(text, 'user');
  if (!normalized) {
    return null;
  }

  let next = normalizeWhitespace(
    normalized
      .replace(/^[-*+]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/`{1,3}/g, '')
      .trim(),
  );

  next = stripRequestPrefixes(next);
  next = pickTitleFragment(next);
  next = normalizeWhitespace(next.replace(/^[,:：，。\-–—\s]+/, ''));

  if (!next) {
    return null;
  }

  return trimToWordBoundary(next, AUTO_TITLE_MAX_LEN);
}

function titleCandidateScore(text: string): number {
  let score = Math.min(text.length, AUTO_TITLE_MAX_LEN);
  if (!isWeakTitleCandidate(text)) {
    score += 12;
  }
  if (/\p{Letter}|\p{Number}/u.test(text)) {
    score += 4;
  }
  if (/[A-Za-z]/.test(text) && /[\u4e00-\u9fff]/u.test(text)) {
    score += 2;
  }
  return score;
}

export function deriveAutoSessionLabelFromMessages(
  messages: ReadonlyArray<Pick<ChatMessageItem, 'role' | 'text'>>,
  currentAutoLabel?: string | null,
): string | null {
  const existing = normalizeWhitespace(String(currentAutoLabel || ''));
  if (existing) {
    return existing;
  }

  let assistantCount = 0;
  const userCandidates: string[] = [];

  for (const message of messages) {
    const role = String(message.role || '').trim().toLowerCase();
    if (role === 'assistant') {
      assistantCount += 1;
      continue;
    }
    if (role !== 'user') {
      continue;
    }
    const candidate = normalizeUserMessageForTitle(String(message.text || ''));
    if (candidate) {
      userCandidates.push(candidate);
      if (userCandidates.length >= AUTO_TITLE_MAX_USER_MESSAGES) {
        break;
      }
    }
  }

  if (assistantCount < 1 || userCandidates.length === 0) {
    return null;
  }

  const strongCandidate = userCandidates.find((candidate) => !isWeakTitleCandidate(candidate));
  if (strongCandidate) {
    return strongCandidate;
  }

  const fallback = userCandidates
    .slice()
    .sort((left, right) => titleCandidateScore(right) - titleCandidateScore(left))[0];

  return fallback && titleCandidateScore(fallback) >= 10 ? fallback : null;
}

export function applyDerivedAutoLabelToSessionRow<T extends Pick<ChatSessionRow, 'kind' | 'presentation'>>(
  session: T,
  messages: ReadonlyArray<Pick<ChatMessageItem, 'role' | 'text'>>,
): T {
  if (session.kind !== 'tracevane_managed') {
    return session;
  }
  if (String(session.presentation.customLabel || '').trim()) {
    return session;
  }

  const nextAutoLabel = deriveAutoSessionLabelFromMessages(messages, session.presentation.autoLabel);
  const currentAutoLabel = normalizeWhitespace(String(session.presentation.autoLabel || '')) || null;

  if ((nextAutoLabel || null) === currentAutoLabel) {
    return session;
  }

  return {
    ...session,
    presentation: {
      ...session.presentation,
      autoLabel: nextAutoLabel,
    },
  };
}

export function resolveSessionEditableLabel(
  session: Pick<ChatSessionRow, 'label' | 'presentation'>,
): string {
  return normalizeWhitespace(
    String(
      session.presentation.customLabel
      || session.presentation.autoLabel
      || session.label
      || '',
    ),
  );
}
