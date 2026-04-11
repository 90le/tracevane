import type { OpenClawPluginToolContext } from 'openclaw/plugin-sdk';
import {
  isStudioManagedWebchatSession,
  normalizeStudioDeliveryInputDetailed,
  type StudioDeliveryResult,
} from './studio-delivery.js';

type StudioDeliveryToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  details: StudioDeliveryResult;
};

export function createStudioDeliveryTool() {
  return {
    name: 'studio_delivery',
    description: [
      'Fallback Studio-only final delivery tool for the current Studio WebChat session.',
      'Prefer assistant Markdown rich replies first for ordinary Studio returns, using explicit refs like workspace:, uploads:, or studio-file: plus studio: display hints.',
      'Raw HTML rich replies are also supported for ordinary Studio returns when you need mixed HTML layout, details/summary, inline SVG, or HTML-based resource composition without structured fallback blocks.',
      'When Markdown is awkward, prefer direct assistant raw HTML with explicit refs in <img>, <video>, <source>, <a>, or similar tags, using title="studio:break-image" or data-studio-display="break-image" style hints so Studio upgrades the HTML into its rich media/card rendering.',
      'Use studio_delivery only when assistant Markdown cannot express the final reply reliably enough.',
      'Do not use message for current-session Studio delivery.',
      'Pure text replies may still answer directly as assistant text.',
      'Do not output file paths, local paths, raw MEDIA text, or fallback attachment syntax in assistant messages.',
      'Primary Markdown examples: [Diagram](workspace:diagram.png "studio:break-image"), [Demo](uploads:demo.mp4 "studio:break-video"), [Package](studio-file:./report.pdf "studio:card"), [Attachment](studio-file:./report.pdf "studio:inline-chip").',
      'Primary raw HTML examples: <img src="workspace:diagram.png" title="studio:break-image" alt="Diagram">, <video src="uploads:demo.mp4" title="studio:break-video"></video>, <a href="studio-file:./report.pdf" title="studio:card">Package</a>, <img src="workspace:thumb.png" data-studio-display="inline-image" alt="Thumb">.',
      'Raw HTML rich replies may also place explicit Markdown-style Studio refs inside HTML containers such as <details>...</details> when that mixed format is clearer.',
      'Use version 1 only for legacy ordered text/resource cards. Prefer version 2 for paragraph segments, break-image, break-video, break-chip, inline-image, inline-video, inline-chip, and card blocks when you need the fallback path.',
      'Default Studio rich replies should prefer break-image, break-video, and break-chip so media/files appear on their own lines inside the paragraph flow.',
      'Use inline-image, inline-video, and inline-chip only when you explicitly need sentence-level inline references.',
      'Fallback worked example 1 (default rich message with line breaks): version=2, blocks=[{type:"paragraph",segments:[{type:"text",text:"Here is the summary."},{type:"resource",resourceId:"img-1",display:"break-image"},{type:"text",text:"Download the package below."},{type:"resource",resourceId:"file-1",display:"break-chip"},{type:"text",text:"Watch the demo after that."},{type:"resource",resourceId:"video-1",display:"break-video"}]}], resources=[{id:"img-1",kind:"image",fileName:"diagram.png",filePath:"./diagram.png"},{id:"file-1",kind:"file",fileName:"report.pdf",filePath:"./report.pdf"},{id:"video-1",kind:"video",fileName:"demo.mp4",filePath:"./demo.mp4"}].',
      'Fallback worked example 2 (true inline reference): version=2, blocks=[{type:"paragraph",segments:[{type:"text",text:"Compare "},{type:"resource",resourceId:"img-1",display:"inline-image"},{type:"text",text:" with "},{type:"resource",resourceId:"file-1",display:"inline-chip"},{type:"text",text:" in the same sentence."}]}], resources=[{id:"img-1",kind:"image",fileName:"diagram.png",filePath:"./diagram.png"},{id:"file-1",kind:"file",fileName:"report.pdf",filePath:"./report.pdf"}].',
      'Fallback worked example 3 (top-level card still allowed): version=2, blocks=[{type:"paragraph",segments:[{type:"text",text:"Here is the report."}]},{type:"resource",resourceId:"file-1",display:"card"}], resources=[{id:"file-1",kind:"file",fileName:"report.pdf",filePath:"./report.pdf"}].',
    ].join(' '),
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        version: {
          enum: [1, 2],
          description: 'Optional protocol version. Omit for auto-detection. Prefer version 2 whenever you need paragraph segments, break rich media, inline references, or card resources.',
        },
        blocks: {
          type: 'array',
          description: 'Ordered Studio message blocks for the current Studio chat. Version 1 accepts legacy text/resource cards. Version 2 accepts paragraph blocks with ordered text/resource segments plus card resources. Default rich replies should prefer break-image/break-video/break-chip; use inline-* only for true sentence-level inline references.',
          items: {
            oneOf: [
              {
                type: 'object',
                additionalProperties: false,
                properties: {
                  type: { enum: ['text', 'markdown'] },
                  text: { type: 'string' },
                  content: { type: 'string' },
                  message: { type: 'string' },
                },
                anyOf: [
                  { required: ['type', 'text'] },
                  { required: ['type', 'content'] },
                  { required: ['type', 'message'] },
                ],
              },
              {
                type: 'object',
                additionalProperties: false,
                properties: {
                  type: { const: 'resource' },
                  resourceId: { type: 'string' },
                  display: { enum: ['card'] },
                },
                required: ['type', 'resourceId'],
              },
              {
                type: 'object',
                additionalProperties: false,
                properties: {
                  type: { const: 'paragraph' },
                  segments: {
                    type: 'array',
                    minItems: 1,
                    items: {
                      oneOf: [
                        {
                          type: 'object',
                          additionalProperties: false,
                          properties: {
                            type: { enum: ['text', 'markdown'] },
                            text: { type: 'string' },
                            content: { type: 'string' },
                            message: { type: 'string' },
                          },
                          anyOf: [
                            { required: ['type', 'text'] },
                            { required: ['type', 'content'] },
                            { required: ['type', 'message'] },
                          ],
                        },
                        {
                          type: 'object',
                          additionalProperties: false,
                          properties: {
                            type: { const: 'resource' },
                            resourceId: { type: 'string' },
                            display: { enum: ['inline-image', 'inline-video', 'inline-chip', 'break-image', 'break-video', 'break-chip'] },
                          },
                          required: ['type', 'resourceId', 'display'],
                        },
                      ],
                    },
                  },
                },
                required: ['type', 'segments'],
              },
            ],
          },
        },
        resources: {
          type: 'array',
          description: 'Resources referenced by blocks[].resourceId and paragraph.segments[].resourceId. Use these structured resource fields instead of message text or raw file paths when returning files/media into the current Studio chat.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string' },
              kind: { enum: ['image', 'video', 'file'] },
              fileName: { type: 'string' },
              mimeType: { type: ['string', 'null'] },
              path: { type: 'string' },
              filePath: { type: 'string' },
              media: { type: 'string' },
              buffer: { type: 'string' },
              contentType: { type: ['string', 'null'] },
              caption: { type: 'string' },
            },
            required: ['id', 'kind', 'fileName'],
          },
        },
      },
      required: ['blocks', 'resources'],
    },
    async execute(_id: string, params: unknown): Promise<StudioDeliveryToolResult> {
      const normalized = normalizeStudioDeliveryInputDetailed(params);
      if (!normalized.payload) {
        throw new Error(normalized.error || 'studio_delivery requires valid blocks/resources.');
      }
      const payload = normalized.payload;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(payload, null, 2),
          },
        ],
        details: payload,
      };
    },
  };
}

export function resolveStudioDeliveryTool(
  ctx: Pick<OpenClawPluginToolContext, 'sessionKey' | 'messageChannel'>,
) {
  if (!isStudioManagedWebchatSession(ctx)) {
    return null;
  }
  return createStudioDeliveryTool();
}
