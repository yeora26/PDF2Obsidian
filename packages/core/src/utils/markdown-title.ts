export function extractFirstHeading(markdown: string): string | undefined {
  const lines = markdown.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('# ')) {
      continue;
    }

    const heading = trimmed.slice(2).trim();
    if (heading) {
      return heading;
    }
  }

  return undefined;
}
