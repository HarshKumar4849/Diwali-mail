export function renderTemplate(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(.+?)\}\}/g, (_, key: string) => data[key.trim()] || `{{${key}}}`);
}
