import { buildSystemPrompt, defaultFenceLanguage, type AssetKind } from './prompts.js';

export interface GenerateRequest {
  tab: AssetKind | string;
  prompt: string;
  imageDataUrl?: string;
  context?: string;
  existingCode?: string;
}

export interface GenerateResult {
  raw: string;
  code: string;
  language: string;
}

export interface CopilotStatus {
  connected: boolean;
  authenticated: boolean;
  login?: string;
  message?: string;
}

let clientPromise: Promise<any> | null = null;

export async function getClient(): Promise<any> {
  if (!clientPromise) {
    clientPromise = (async () => {
      let mod: any;
      try {
        mod = await import('@github/copilot-sdk');
      } catch (err: any) {
        if (err?.code === 'ERR_MODULE_NOT_FOUND' || err?.message?.includes('Cannot find package')) {
          throw new Error(
            'Optional dependency "@github/copilot-sdk" is not installed. Install it with: npm install -D @github/copilot-sdk'
          );
        }
        throw err;
      }
      return new mod.CopilotClient();
    })();
  }
  return clientPromise;
}

export function parseImageAttachment(imageDataUrl: string): { type: 'blob'; data: string; mimeType: string } {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(imageDataUrl);
  if (!match) {
    throw new Error('imageDataUrl must be a base64 data URL (data:<mime>;base64,<data>)');
  }
  const [, mimeType, data] = match;
  return { type: 'blob', data, mimeType };
}

export function extractCodeBlock(raw: string, fallbackLanguage: string): { code: string; language: string } {
  const match = /```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/.exec(raw);
  if (!match) {
    return { code: raw.trim(), language: fallbackLanguage };
  }
  const [, language, code] = match;
  return { code: code.trim(), language: language || fallbackLanguage };
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
  } catch (err: any) {
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
    systemMessage: { mode: 'append', content: buildSystemPrompt(req.tab as AssetKind) },
    availableTools: [],
  });

  try {
    const attachments = req.imageDataUrl ? [parseImageAttachment(req.imageDataUrl)] : undefined;
    const parts = [req.context, req.prompt];
    if (req.existingCode) {
      const fence = defaultFenceLanguage(req.tab as AssetKind);
      parts.push(
        `Here is the CURRENT implementation. Revise it according to the request above. ` +
          `Keep the same exported name(s) and overall shape unless the request says otherwise. ` +
          `Return the full revised file, not a diff.\n\n\`\`\`${fence}\n${req.existingCode}\n\`\`\``
      );
    }
    const userPrompt = parts.filter(Boolean).join('\n\n');
    const response = await session.sendAndWait({ prompt: userPrompt, attachments }, 180_000);
    const raw: string = response?.data?.content ?? '';
    const { code, language } = extractCodeBlock(raw, defaultFenceLanguage(req.tab as AssetKind));
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
