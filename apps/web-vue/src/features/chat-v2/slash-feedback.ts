import type { ChatRuntimeState } from '../../../../../types/chat';
import type { Locale } from '../../shared/locale';

export type StudioSlashExecutionPhase = 'accepted' | 'running' | 'completed' | 'aborted' | 'error';
export type StudioSlashExecutionTone = 'info' | 'success' | 'warning' | 'error';

export interface StudioSlashExecutionFeedback {
  sessionKey: string;
  commandName: string;
  args: string;
  mode: 'local' | 'send';
  phase: StudioSlashExecutionPhase;
  startedAt: string;
  updatedAt: string;
  runId: string | null;
  requestId?: string | null;
  detail: string | null;
}

export interface StudioSlashExecutionFeedbackDescriptor {
  tone: StudioSlashExecutionTone;
  title: string;
  detail: string;
  commandText: string;
}

export function isStudioSlashExecutionFeedbackTerminal(phase: StudioSlashExecutionPhase): boolean {
  return phase === 'completed' || phase === 'aborted' || phase === 'error';
}

function trimArgs(args: string): string {
  return typeof args === 'string' ? args.trim() : '';
}

function commandTextFromFeedback(feedback: Pick<StudioSlashExecutionFeedback, 'commandName' | 'args'>): string {
  const args = trimArgs(feedback.args);
  return args ? `/${feedback.commandName} ${args}` : `/${feedback.commandName}`;
}

function resolveUpdatedAt(
  feedback: StudioSlashExecutionFeedback,
  runtime: ChatRuntimeState,
): string {
  return runtime.lastEventAt || runtime.lastAckAt || feedback.updatedAt;
}

function describeCompactFeedback(
  feedback: StudioSlashExecutionFeedback,
  locale: Locale,
): StudioSlashExecutionFeedbackDescriptor {
  const commandText = commandTextFromFeedback(feedback);
  if (feedback.phase === 'accepted') {
    return locale === 'zh'
      ? {
        tone: 'info',
        title: '已发送 /compact',
        detail: feedback.detail || 'Studio 已收到命令，等待宿主开始执行上下文压缩。',
        commandText,
      }
      : {
        tone: 'info',
        title: 'Sent /compact',
        detail: feedback.detail || 'Studio accepted the command and is waiting for the host to begin compaction.',
        commandText,
      };
  }

  if (feedback.phase === 'running') {
    return locale === 'zh'
      ? {
        tone: 'info',
        title: '正在压缩当前上下文',
        detail: feedback.detail || '宿主正在整理当前会话上下文，完成后会继续回到当前线程。',
        commandText,
      }
      : {
        tone: 'info',
        title: 'Compacting session context',
        detail: feedback.detail || 'The host is compacting the current session context and will return here when it settles.',
        commandText,
      };
  }

  if (feedback.phase === 'completed') {
    return locale === 'zh'
      ? {
        tone: 'success',
        title: '上下文压缩已完成',
        detail: feedback.detail || '当前会话已经结束这次压缩流程，可以继续对话。',
        commandText,
      }
      : {
        tone: 'success',
        title: 'Context compaction finished',
        detail: feedback.detail || 'The compaction cycle is complete and the session is ready for the next turn.',
        commandText,
      };
  }

  if (feedback.phase === 'aborted') {
    return locale === 'zh'
      ? {
        tone: 'warning',
        title: '上下文压缩已停止',
        detail: feedback.detail || '这次压缩流程已被手动停止。',
        commandText,
      }
      : {
        tone: 'warning',
        title: 'Context compaction stopped',
        detail: feedback.detail || 'The compaction flow was stopped before it finished.',
        commandText,
      };
  }

  return locale === 'zh'
    ? {
      tone: 'error',
      title: '上下文压缩失败',
      detail: feedback.detail || '宿主返回了错误，当前压缩流程未完成。',
      commandText,
    }
    : {
      tone: 'error',
      title: 'Context compaction failed',
      detail: feedback.detail || 'The host returned an error before compaction could finish.',
      commandText,
    };
}

function describeSteerFeedback(
  feedback: StudioSlashExecutionFeedback,
  locale: Locale,
): StudioSlashExecutionFeedbackDescriptor {
  const commandText = commandTextFromFeedback(feedback);
  if (feedback.phase === 'accepted') {
    return locale === 'zh'
      ? {
        tone: 'info',
        title: '已发送 /steer',
        detail: feedback.detail || 'Studio 已把引导消息发给当前运行，等待宿主继续执行。',
        commandText,
      }
      : {
        tone: 'info',
        title: 'Sent /steer',
        detail: feedback.detail || 'Studio sent the steer message and is waiting for the host to continue the current run.',
        commandText,
      };
  }

  if (feedback.phase === 'running') {
    return locale === 'zh'
      ? {
        tone: 'info',
        title: '正在处理 /steer',
        detail: feedback.detail || '宿主已经接管这次引导，当前运行还在继续。',
        commandText,
      }
      : {
        tone: 'info',
        title: 'Running /steer',
        detail: feedback.detail || 'The host accepted the steer and the current run is still in progress.',
        commandText,
      };
  }

  if (feedback.phase === 'completed') {
    return locale === 'zh'
      ? {
        tone: 'success',
        title: '/steer 已完成',
        detail: feedback.detail || '宿主已经完成这次引导处理。',
        commandText,
      }
      : {
        tone: 'success',
        title: '/steer completed',
        detail: feedback.detail || 'The host finished processing the steer request.',
        commandText,
      };
  }

  if (feedback.phase === 'aborted') {
    return locale === 'zh'
      ? {
        tone: 'warning',
        title: '/steer 已停止',
        detail: feedback.detail || '当前引导流程已被停止。',
        commandText,
      }
      : {
        tone: 'warning',
        title: '/steer stopped',
        detail: feedback.detail || 'The steer flow was stopped before it finished.',
        commandText,
      };
  }

  return locale === 'zh'
    ? {
      tone: 'error',
      title: '/steer 执行失败',
      detail: feedback.detail || '宿主处理引导消息时返回了错误。',
      commandText,
    }
    : {
      tone: 'error',
      title: '/steer failed',
      detail: feedback.detail || 'The host returned an error while processing the steer request.',
      commandText,
    };
}

function describeRedirectFeedback(
  feedback: StudioSlashExecutionFeedback,
  locale: Locale,
): StudioSlashExecutionFeedbackDescriptor {
  const commandText = commandTextFromFeedback(feedback);
  if (feedback.phase === 'accepted') {
    return locale === 'zh'
      ? {
        tone: 'info',
        title: '已发送 /redirect',
        detail: feedback.detail || 'Studio 已请求宿主中止当前运行并开始新的执行。',
        commandText,
      }
      : {
        tone: 'info',
        title: 'Sent /redirect',
        detail: feedback.detail || 'Studio asked the host to stop the current run and start a new one.',
        commandText,
      };
  }

  if (feedback.phase === 'running') {
    return locale === 'zh'
      ? {
        tone: 'info',
        title: '正在重定向当前运行',
        detail: feedback.detail || '宿主正在切断旧运行并启动新的执行流程。',
        commandText,
      }
      : {
        tone: 'info',
        title: 'Redirecting current run',
        detail: feedback.detail || 'The host is interrupting the old run and starting a new execution flow.',
        commandText,
      };
  }

  if (feedback.phase === 'completed') {
    return locale === 'zh'
      ? {
        tone: 'success',
        title: '重定向已完成',
        detail: feedback.detail || '新的执行流程已经稳定接管当前会话。',
        commandText,
      }
      : {
        tone: 'success',
        title: 'Redirect completed',
        detail: feedback.detail || 'The new execution flow has taken over the current session.',
        commandText,
      };
  }

  if (feedback.phase === 'aborted') {
    return locale === 'zh'
      ? {
        tone: 'warning',
        title: '重定向已停止',
        detail: feedback.detail || '这次重定向在完成前被停止了。',
        commandText,
      }
      : {
        tone: 'warning',
        title: 'Redirect stopped',
        detail: feedback.detail || 'The redirect flow was stopped before it finished.',
        commandText,
      };
  }

  return locale === 'zh'
    ? {
      tone: 'error',
      title: '重定向失败',
      detail: feedback.detail || '宿主在重定向当前运行时返回了错误。',
      commandText,
    }
    : {
      tone: 'error',
      title: 'Redirect failed',
      detail: feedback.detail || 'The host returned an error while redirecting the current run.',
      commandText,
    };
}

function describeBtwFeedback(
  feedback: StudioSlashExecutionFeedback,
  locale: Locale,
): StudioSlashExecutionFeedbackDescriptor {
  const commandText = commandTextFromFeedback(feedback);
  if (feedback.phase === 'accepted') {
    return locale === 'zh'
      ? {
        tone: 'info',
        title: '已发送 /btw',
        detail: feedback.detail || 'Studio 已收到侧问，等待宿主给出不进入未来上下文的临时回答。',
        commandText,
      }
      : {
        tone: 'info',
        title: 'Sent /btw',
        detail: feedback.detail || 'Studio accepted the side question and is waiting for the host to answer it without affecting future context.',
        commandText,
      };
  }

  if (feedback.phase === 'running') {
    return locale === 'zh'
      ? {
        tone: 'info',
        title: '正在回答 /btw',
        detail: feedback.detail || '宿主正在处理这条侧问，结果不会写入未来上下文。',
        commandText,
      }
      : {
        tone: 'info',
        title: 'Answering /btw',
        detail: feedback.detail || 'The host is answering this side question without writing it into future context.',
        commandText,
      };
  }

  if (feedback.phase === 'completed') {
    return locale === 'zh'
      ? {
        tone: 'success',
        title: '/btw 已返回',
        detail: feedback.detail || '侧问答结果已返回。',
        commandText,
      }
      : {
        tone: 'success',
        title: '/btw answered',
        detail: feedback.detail || 'The side-question result is ready.',
        commandText,
      };
  }

  if (feedback.phase === 'aborted') {
    return locale === 'zh'
      ? {
        tone: 'warning',
        title: '/btw 已停止',
        detail: feedback.detail || '这条侧问在返回结果前已被停止。',
        commandText,
      }
      : {
        tone: 'warning',
        title: '/btw stopped',
        detail: feedback.detail || 'The side question was stopped before a result was returned.',
        commandText,
      };
  }

  return locale === 'zh'
    ? {
      tone: 'error',
      title: '/btw 失败',
      detail: feedback.detail || '宿主在处理这条侧问时返回了错误。',
      commandText,
    }
    : {
      tone: 'error',
      title: '/btw failed',
      detail: feedback.detail || 'The host returned an error while answering the side question.',
      commandText,
    };
}

export function createStudioSlashExecutionFeedback(
  input: StudioSlashExecutionFeedback,
): StudioSlashExecutionFeedback {
  return {
    ...input,
    args: trimArgs(input.args),
    runId: input.runId || null,
    requestId: input.requestId || null,
    detail: input.detail || null,
  };
}

export function applyRuntimeToStudioSlashExecutionFeedback(
  feedback: StudioSlashExecutionFeedback,
  runtime: ChatRuntimeState,
  options: {
    runId?: string | null;
  } = {},
): StudioSlashExecutionFeedback {
  const nextRunId = options.runId ?? feedback.runId ?? runtime.activeRunId ?? null;
  let nextPhase = feedback.phase;

  if (runtime.state === 'error') {
    nextPhase = 'error';
  } else if (runtime.state === 'aborted') {
    nextPhase = 'aborted';
  } else if (runtime.state === 'completed') {
    nextPhase = 'completed';
  } else if (
    runtime.state === 'running'
    || runtime.state === 'streaming'
    || Boolean(nextRunId && runtime.activeRunId === nextRunId)
  ) {
    nextPhase = 'running';
  }

  return {
    ...feedback,
    phase: nextPhase,
    runId: nextRunId,
    updatedAt: resolveUpdatedAt(feedback, runtime),
    detail: nextPhase === 'error'
      ? (runtime.lastErrorMessage || feedback.detail || null)
      : feedback.detail,
  };
}

export function describeStudioSlashExecutionFeedback(
  feedback: StudioSlashExecutionFeedback,
  locale: Locale,
): StudioSlashExecutionFeedbackDescriptor {
  if (feedback.commandName === 'compact') {
    return describeCompactFeedback(feedback, locale);
  }
  if (feedback.commandName === 'steer') {
    return describeSteerFeedback(feedback, locale);
  }
  if (feedback.commandName === 'redirect') {
    return describeRedirectFeedback(feedback, locale);
  }
  if (feedback.commandName === 'btw') {
    return describeBtwFeedback(feedback, locale);
  }

  const commandName = `/${feedback.commandName}`;
  const commandText = commandTextFromFeedback(feedback);
  if (feedback.phase === 'accepted') {
    return locale === 'zh'
      ? {
        tone: 'info',
        title: `已发送 ${commandName}`,
        detail: feedback.detail || 'Studio 已收到命令，等待宿主开始执行。',
        commandText,
      }
      : {
        tone: 'info',
        title: `Sent ${commandName}`,
        detail: feedback.detail || 'Studio accepted the command and is waiting for the host to start it.',
        commandText,
      };
  }

  if (feedback.phase === 'running') {
    return locale === 'zh'
      ? {
        tone: 'info',
        title: `正在执行 ${commandName}`,
        detail: feedback.detail || '命令已经开始执行，等待宿主返回结果。',
        commandText,
      }
      : {
        tone: 'info',
        title: `Running ${commandName}`,
        detail: feedback.detail || 'The command is running and Studio is waiting for the host result.',
        commandText,
      };
  }

  if (feedback.phase === 'completed') {
    return locale === 'zh'
      ? {
        tone: 'success',
        title: `${commandName} 已完成`,
        detail: feedback.detail || '命令已经执行完成。',
        commandText,
      }
      : {
        tone: 'success',
        title: `${commandName} completed`,
        detail: feedback.detail || 'The command finished successfully.',
        commandText,
      };
  }

  if (feedback.phase === 'aborted') {
    return locale === 'zh'
      ? {
        tone: 'warning',
        title: `${commandName} 已停止`,
        detail: feedback.detail || '命令执行已被中止。',
        commandText,
      }
      : {
        tone: 'warning',
        title: `${commandName} stopped`,
        detail: feedback.detail || 'The command was stopped before completion.',
        commandText,
      };
  }

  return locale === 'zh'
    ? {
      tone: 'error',
      title: `${commandName} 执行失败`,
      detail: feedback.detail || '宿主返回了错误。',
      commandText,
    }
    : {
      tone: 'error',
      title: `${commandName} failed`,
      detail: feedback.detail || 'The host returned an error.',
      commandText,
    };
}
