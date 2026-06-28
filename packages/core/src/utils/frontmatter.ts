import YAML from 'yaml';

export function createFrontmatter(metadata: Record<string, unknown>, body: string): string {
  return `---\n${YAML.stringify(metadata)}---\n\n${body.trim()}\n`;
}
