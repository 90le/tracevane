import type http from 'node:http';
import { sendJson } from './http.js';
import type { StudioApiContext } from './context.js';

export interface RouteParams {
  [key: string]: string;
}

export type RouteHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: StudioApiContext,
  params: RouteParams
) => Promise<void> | void;

interface RouteDefinition {
  method: string;
  path: string;
  handler: RouteHandler;
}

function normalizePath(inputPath: string): string {
  if (!inputPath) return '/';
  if (inputPath === '/') return '/';
  return inputPath.endsWith('/') ? inputPath.slice(0, -1) : inputPath;
}

function matchRoute(pattern: string, pathname: string): RouteParams | null {
  const patternPath = normalizePath(pattern);
  const requestPath = normalizePath(pathname);
  const patternSegments = patternPath.split('/').filter(Boolean);
  const requestSegments = requestPath.split('/').filter(Boolean);

  if (patternSegments.length !== requestSegments.length) return null;

  const params: RouteParams = {};
  for (let index = 0; index < patternSegments.length; index += 1) {
    const patternSegment = patternSegments[index];
    const requestSegment = requestSegments[index];
    if (patternSegment.startsWith(':')) {
      params[patternSegment.slice(1)] = decodeURIComponent(requestSegment);
      continue;
    }
    if (patternSegment !== requestSegment) return null;
  }

  return params;
}

export class StudioRouter {
  private readonly routes: RouteDefinition[] = [];

  add(method: string, path: string, handler: RouteHandler): void {
    this.routes.push({
      method: method.toUpperCase(),
      path,
      handler,
    });
  }

  get(path: string, handler: RouteHandler): void {
    this.add('GET', path, handler);
  }

  post(path: string, handler: RouteHandler): void {
    this.add('POST', path, handler);
  }

  put(path: string, handler: RouteHandler): void {
    this.add('PUT', path, handler);
  }

  patch(path: string, handler: RouteHandler): void {
    this.add('PATCH', path, handler);
  }

  delete(path: string, handler: RouteHandler): void {
    this.add('DELETE', path, handler);
  }

  async handle(req: http.IncomingMessage, res: http.ServerResponse, ctx: StudioApiContext): Promise<boolean> {
    const method = (req.method || 'GET').toUpperCase();
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = requestUrl.pathname;

    for (const route of this.routes) {
      if (route.method !== method) continue;
      const params = matchRoute(route.path, pathname);
      if (!params) continue;

      try {
        await route.handler(req, res, ctx, params);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected route failure';
        ctx.logger.error(`studio: route failed for ${method} ${pathname}`, error);
        sendJson(res, 500, { error: 'internal_error', message });
      }
      return true;
    }

    return false;
  }
}
