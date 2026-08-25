export { startEditorServer, type EditorServerOptions } from './server.js';
export {
  checkCopilotStatus,
  generate,
  type GenerateRequest,
  type GenerateResult,
  type CopilotStatus,
} from './copilot-session.js';
export {
  ASSET_KINDS,
  EDITOR_TABS,
  buildSystemPrompt,
  defaultFenceLanguage,
  modelPrompt,
  terrainPrompt,
  scenePrompt,
  levelPrompt,
  type AssetKind,
  type EditorTab,
} from './prompts.js';
export {
  generateAsset,
  scaffoldAsset,
  checkGenerationStatus,
  readImageAsDataUrl,
  type GenerateAssetOptions,
  type GenerateAssetResult,
  type ScaffoldResult,
} from './generation-service.js';
export {
  validateFactoryCode,
  validateSceneJSON,
  validateLevelJSON,
  type ValidationResult,
} from './validation.js';
export {
  resolveSafePath,
  checkFileExists,
  atomicWriteFile,
} from './file-safety.js';
export {
  scanProjectAssets,
  type ProjectAssets,
  type DiscoveredModelFile,
  type DiscoveredLevelFile,
  type DiscoveredFactory,
} from './project-assets.js';
