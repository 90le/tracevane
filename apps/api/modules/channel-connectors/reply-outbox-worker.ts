import {
  listDueChannelConnectorReplies,
  markChannelConnectorReplyDelivered,
  markChannelConnectorReplyFailed,
  markChannelConnectorReplySending,
  type ChannelConnectorReplyOutboxRecord,
} from "./reply-outbox-store.js";

export interface ChannelConnectorReplyReplayOutcome {
  ok: boolean;
  error?: string | null;
  statusCode?: number | null;
  platformMessageId?: string | null;
  retryable?: boolean;
}

export interface ChannelConnectorReplyReplaySummary {
  attempted: number;
  delivered: number;
  failed: number;
}

function replayError(value: unknown): string {
  if (value instanceof Error) return value.message || value.name;
  return String(value || "Reply replay failed.");
}

export async function replayDueChannelConnectorReplies(input: {
  filePath: string;
  deliver: (record: ChannelConnectorReplyOutboxRecord) => Promise<ChannelConnectorReplyReplayOutcome>;
  now?: Date;
  limit?: number;
}): Promise<ChannelConnectorReplyReplaySummary> {
  const limit = Math.max(1, Math.floor(input.limit || 20));
  const records = listDueChannelConnectorReplies(input.filePath, input.now).slice(0, limit);
  const summary: ChannelConnectorReplyReplaySummary = {
    attempted: 0,
    delivered: 0,
    failed: 0,
  };
  for (const record of records) {
    const sending = markChannelConnectorReplySending(input.filePath, record.id, input.now);
    if (!sending || sending.status !== "sending") continue;
    summary.attempted += 1;
    try {
      const outcome = await input.deliver(sending);
      if (outcome.ok) {
        markChannelConnectorReplyDelivered(
          input.filePath,
          sending.id,
          outcome.platformMessageId || null,
          input.now,
        );
        summary.delivered += 1;
        continue;
      }
      const statusCode = outcome.statusCode ?? null;
      const retryable = outcome.retryable
        ?? (statusCode === null || statusCode === 429 || statusCode >= 500);
      markChannelConnectorReplyFailed(
        input.filePath,
        sending.id,
        outcome.error || "Reply replay failed.",
        { retryable, now: input.now },
      );
      summary.failed += 1;
    } catch (error) {
      markChannelConnectorReplyFailed(
        input.filePath,
        sending.id,
        replayError(error),
        { retryable: true, now: input.now },
      );
      summary.failed += 1;
    }
  }
  return summary;
}
