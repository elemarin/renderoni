/**
 * Thin wrapper around `@github/copilot-sdk`. Isolated in its own module so
 * the SDK is only ever imported lazily (dynamic `import()`), keeping it out
 * of the engine's default dependency graph for consumers who never run
 * `renderoni editor`.
 */

import { buildSystemPrompt, defaultFenceLanguage, type EditorTab } from './prompts.js';

export interface GenerateRequest {
  tab: EditorTab;
  /** User's natural-language prompt. */
  prompt: string;
  /** Optional data URL (`data:<mime>;base64,<data>`) reference image. */
  imageDataUrl?: string;
  /** Optional extra context, e.g. available factory keys for the level tab. */
  context?: string;
  /**
   * Existing file contents to revise in place, for the "iterate on an
   * existing asset" flow. When set, the prompt asks Copilot to edit this
   * source rather than create something new.
   */
  existingCode?: string;
}

export interface GenerateResult {
  /** Full assistant response text. */
  raw: string;
  /** Extracted code/JSON from the first fenced block. */
  code: string;
  /** Fence language tag, e.g. "ts" or "json". */
  language: string;
}

// The SDK type is intentionally `any` here — it is only resolved at runtime
// via dynamic import so this module has zero static dependency on the SDK.
let clientPromise: Promise<any> | null = null;

async function getClient(): Promise<any> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const { CopilotClient } = await import('@github/copilot-sdk');
      return new CopilotClient();
    })();
  }
  return clientPromise;
}

function parseImageAttachment(imageDataUrl: string): { type: 'blob'; data: string; mimeType: string } {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(imageDataUrl);
  if (!match) {
    throw new Error('imageDataUrl must be a base64 data URL (data:<mime>;base64,<data>)');
  }
  const [, mimeType, data] = match;
  return { type: 'blob', data, mimeType };
}

function extractCodeBlock(raw: string, fallbackLanguage: string): { code: string; language: string } {
  const match = /```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/.exec(raw);
  if (!match) {
    return { code: raw.trim(), language: fallbackLanguage };
  }
  const [, language, code] = match;
  return { code: code.trim(), language: language || fallbackLanguage };
}

export interface CopilotStatus {
  connected: boolean;
  authenticated: boolean;
  login?: string;
  message?: string;
}

export async function checkCopilotStatus(): Promise<CopilotStatus> {
  try {
    const client = await getClient();
    await client.start();
    await client.getStatus();
    const auth = await client.getAuthStatus();
    return {
      connected: true,
      authenticated: auth.isAuthenticated,
      login: auth.login,
      message: auth.statusMessage,
    };
  } catch (err) {
    return {
      connected: false,
      authenticated: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function generate(req: GenerateRequest): Promise<GenerateResult> {
  const client = await getClient();
  const session = await client.createSession({
    model: 'auto',
    clientName: 'renderoni-editor',
    systemMessage: { mode: 'append', content: buildSystemPrompt(req.tab) },
    // Disable tool calls — the editor only wants a single text turn back,
    // never file edits or shell commands run on the operator's behalf.
    availableTools: [],
  });

  try {
    const attachments = req.imageDataUrl ? [parseImageAttachment(req.imageDataUrl)] : undefined;
    const parts = [req.context, req.prompt];
    if (req.existingCode) {
      const fence = defaultFenceLanguage(req.tab);
      parts.push(
        `Here is the CURRENT implementation. Revise it according to the request above. ` +
          `Keep the same exported name(s) and overall shape unless the request says otherwise. ` +
          `Return the full revised file, not a diff.\n\n\`\`\`${fence}\n${req.existingCode}\n\`\`\``
      );
    }
    const userPrompt = parts.filter(Boolean).join('\n\n');
    const response = await session.sendAndWait({ prompt: userPrompt, attachments }, 180_000);
    const raw: string = response?.data?.content ?? '';
    const { code, language } = extractCodeBlock(raw, defaultFenceLanguage(req.tab));
    return { raw, code, language };
  } finally {
    await session.disconnect();
  }
}

export async function stopEditorCopilotClient(): Promise<void> {
  if (!clientPromise) return;
  const client = await clientPromise;
  clientPromise = null;
  await client.stop();
}
