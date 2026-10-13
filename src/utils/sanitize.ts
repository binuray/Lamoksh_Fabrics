import sanitizeHtml from 'sanitize-html';

/**
 * Sanitizes rich HTML blog content to prevent XSS attacks while preserving
 * standard blog formatting (headings, lists, images, tables, embeds, styles, etc.).
 */
export function sanitizeBlogContent(htmlContent: string): string {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return '';
  }

  return sanitizeHtml(htmlContent, {
    allowedTags: [
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'blockquote',
      'p',
      'a',
      'ul',
      'ol',
      'nl',
      'li',
      'b',
      'i',
      'strong',
      'em',
      'strike',
      'code',
      'hr',
      'br',
      'div',
      'table',
      'thead',
      'caption',
      'tbody',
      'tfoot',
      'tr',
      'th',
      'td',
      'pre',
      'iframe',
      'img',
      'figure',
      'figcaption',
      'span',
      'u',
      's',
      'sub',
      'sup',
      'video',
      'source',
      'audio',
      'mark',
    ],
    allowedAttributes: {
      a: ['href', 'name', 'target', 'rel', 'title'],
      img: ['src', 'srcset', 'alt', 'title', 'width', 'height', 'loading', 'class', 'style'],
      iframe: ['src', 'width', 'height', 'frameborder', 'allowfullscreen', 'title'],
      video: ['src', 'controls', 'width', 'height', 'poster', 'autoplay', 'muted', 'loop'],
      audio: ['src', 'controls', 'autoplay', 'loop'],
      source: ['src', 'type'],
      table: ['class', 'style', 'border', 'cellpadding', 'cellspacing', 'width'],
      th: ['colspan', 'rowspan', 'scope', 'style', 'class', 'align', 'valign'],
      td: ['colspan', 'rowspan', 'style', 'class', 'align', 'valign'],
      '*': ['class', 'id', 'style', 'dir', 'lang'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'data'],
    allowedSchemesByTag: {
      img: ['http', 'https', 'data'],
      a: ['http', 'https', 'mailto'],
    },
    allowedIframeHostnames: [
      'www.youtube.com',
      'youtube.com',
      'player.vimeo.com',
      'open.spotify.com',
      'w.soundcloud.com',
    ],
    transformTags: {
      a: (tagName, attribs) => {
        // Enforce rel="noopener noreferrer" for external new-tab links
        if (attribs.target === '_blank') {
          return {
            tagName,
            attribs: {
              ...attribs,
              rel: attribs.rel ? `${attribs.rel} noopener noreferrer` : 'noopener noreferrer',
            },
          };
        }
        return { tagName, attribs };
      },
    },
  });
}
