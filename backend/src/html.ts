import type { Response } from 'express';

export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function page(res: Response, status: number, title: string, body: string) {
  res
    .status(status)
    .type('html')
    .send(
      `<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
        `<body style="font-family:system-ui;max-width:40rem;margin:3rem auto;padding:0 1rem;line-height:1.5">` +
        `<h1>${escapeHtml(title)}</h1>${body}</body>`,
    );
}
