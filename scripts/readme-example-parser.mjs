export function extractTypeScriptExamples(markdown) {
  return [...markdown.matchAll(/```ts\r?\n([\s\S]*?)```/g)].map((match) => match[1]);
}
