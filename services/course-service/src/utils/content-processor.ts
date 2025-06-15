import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { logger } from './logger';

// Initialize DOMPurify with JSDOM
const window = new JSDOM('').window;
const purify = DOMPurify(window as any);

// Configure marked options
marked.setOptions({
  gfm: true, // GitHub Flavored Markdown
  breaks: true, // Convert line breaks to <br>
  headerIds: true, // Add IDs to headers
  mangle: false, // Don't mangle autolinks
});

// Custom renderer for marked
const renderer = new marked.Renderer();

// Override link renderer to add security attributes
renderer.link = (href, title, text) => {
  const isExternal = href && (href.startsWith('http://') || href.startsWith('https://'));
  const titleAttr = title ? ` title="${title}"` : '';
  const targetAttr = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
  
  return `<a href="${href}"${titleAttr}${targetAttr}>${text}</a>`;
};

// Override image renderer to add responsive classes
renderer.image = (href, title, text) => {
  const titleAttr = title ? ` title="${title}"` : '';
  const altAttr = text ? ` alt="${text}"` : '';
  
  return `<img src="${href}"${altAttr}${titleAttr} class="img-responsive" loading="lazy">`;
};

// Override code renderer for syntax highlighting
renderer.code = (code, language) => {
  const validLanguage = language && /^[a-zA-Z0-9-_]+$/.test(language);
  const langClass = validLanguage ? ` class="language-${language}"` : '';
  
  return `<pre><code${langClass}>${code}</code></pre>`;
};

// Set custom renderer
marked.use({ renderer });

// Content processing interface
export interface ContentMetadata {
  wordCount: number;
  readingTime: number; // in minutes
  headings: Array<{
    level: number;
    text: string;
    id: string;
  }>;
  links: Array<{
    href: string;
    text: string;
    isExternal: boolean;
  }>;
  images: Array<{
    src: string;
    alt: string;
    title?: string;
  }>;
}

export interface ProcessedContent {
  html: string;
  metadata: ContentMetadata;
  tableOfContents: string;
}

// Content processor class
export class ContentProcessor {
  // Process markdown content to HTML
  static async processMarkdown(content: string): Promise<ProcessedContent> {
    try {
      if (!content || typeof content !== 'string') {
        return {
          html: '',
          metadata: this.getEmptyMetadata(),
          tableOfContents: '',
        };
      }

      // Convert markdown to HTML
      const rawHtml = await marked(content);
      
      // Sanitize HTML
      const sanitizedHtml = this.sanitizeHtml(rawHtml);
      
      // Extract metadata
      const metadata = this.extractMetadata(content, sanitizedHtml);
      
      // Generate table of contents
      const tableOfContents = this.generateTableOfContents(metadata.headings);

      return {
        html: sanitizedHtml,
        metadata,
        tableOfContents,
      };
    } catch (error) {
      logger.error('Error processing markdown content:', error);
      throw new Error('Failed to process markdown content');
    }
  }

  // Sanitize HTML content
  static sanitizeHtml(html: string): string {
    try {
      return purify.sanitize(html, {
        ALLOWED_TAGS: [
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'p', 'br', 'strong', 'em', 'u', 's', 'del', 'ins',
          'ul', 'ol', 'li',
          'blockquote', 'pre', 'code',
          'a', 'img',
          'table', 'thead', 'tbody', 'tr', 'th', 'td',
          'div', 'span',
          'hr',
        ],
        ALLOWED_ATTR: [
          'href', 'title', 'alt', 'src', 'class', 'id',
          'target', 'rel', 'loading',
          'colspan', 'rowspan',
        ],
        ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      });
    } catch (error) {
      logger.error('Error sanitizing HTML:', error);
      return '';
    }
  }

  // Extract content metadata
  static extractMetadata(markdown: string, html: string): ContentMetadata {
    try {
      const dom = new JSDOM(html);
      const document = dom.window.document;

      // Word count (from markdown to avoid HTML tags)
      const wordCount = this.countWords(markdown);
      
      // Reading time (average 200 words per minute)
      const readingTime = Math.ceil(wordCount / 200);

      // Extract headings
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map((heading) => ({
        level: parseInt(heading.tagName.charAt(1)),
        text: heading.textContent || '',
        id: heading.id || this.generateId(heading.textContent || ''),
      }));

      // Extract links
      const links = Array.from(document.querySelectorAll('a')).map((link) => ({
        href: link.getAttribute('href') || '',
        text: link.textContent || '',
        isExternal: this.isExternalLink(link.getAttribute('href') || ''),
      }));

      // Extract images
      const images = Array.from(document.querySelectorAll('img')).map((img) => ({
        src: img.getAttribute('src') || '',
        alt: img.getAttribute('alt') || '',
        title: img.getAttribute('title') || undefined,
      }));

      return {
        wordCount,
        readingTime,
        headings,
        links,
        images,
      };
    } catch (error) {
      logger.error('Error extracting content metadata:', error);
      return this.getEmptyMetadata();
    }
  }

  // Generate table of contents from headings
  static generateTableOfContents(headings: ContentMetadata['headings']): string {
    if (headings.length === 0) {
      return '';
    }

    try {
      let toc = '<div class="table-of-contents"><ul>';
      let currentLevel = 0;

      for (const heading of headings) {
        if (heading.level > currentLevel) {
          // Open new nested list
          for (let i = currentLevel; i < heading.level - 1; i++) {
            toc += '<li><ul>';
          }
          currentLevel = heading.level;
        } else if (heading.level < currentLevel) {
          // Close nested lists
          for (let i = currentLevel; i > heading.level; i--) {
            toc += '</ul></li>';
          }
          currentLevel = heading.level;
        }

        toc += `<li><a href="#${heading.id}">${heading.text}</a></li>`;
      }

      // Close remaining nested lists
      for (let i = currentLevel; i > 1; i--) {
        toc += '</ul></li>';
      }

      toc += '</ul></div>';
      return toc;
    } catch (error) {
      logger.error('Error generating table of contents:', error);
      return '';
    }
  }

  // Count words in text
  static countWords(text: string): number {
    if (!text) return 0;
    
    // Remove markdown syntax and count words
    const cleanText = text
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`[^`]*`/g, '') // Remove inline code
      .replace(/!\[.*?\]\(.*?\)/g, '') // Remove images
      .replace(/\[.*?\]\(.*?\)/g, '') // Remove links
      .replace(/[#*_~`]/g, '') // Remove markdown formatting
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    return cleanText ? cleanText.split(' ').length : 0;
  }

  // Check if link is external
  static isExternalLink(href: string): boolean {
    if (!href) return false;
    return href.startsWith('http://') || href.startsWith('https://');
  }

  // Generate ID from text
  static generateId(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }

  // Get empty metadata structure
  static getEmptyMetadata(): ContentMetadata {
    return {
      wordCount: 0,
      readingTime: 0,
      headings: [],
      links: [],
      images: [],
    };
  }

  // Validate content structure
  static validateContent(content: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      if (!content || typeof content !== 'string') {
        errors.push('Content must be a non-empty string');
        return { isValid: false, errors };
      }

      // Check content length
      if (content.length > 1000000) { // 1MB limit
        errors.push('Content exceeds maximum length limit');
      }

      // Check for potentially malicious content
      const suspiciousPatterns = [
        /<script/i,
        /javascript:/i,
        /vbscript:/i,
        /onload=/i,
        /onerror=/i,
        /onclick=/i,
      ];

      for (const pattern of suspiciousPatterns) {
        if (pattern.test(content)) {
          errors.push('Content contains potentially malicious code');
          break;
        }
      }

      // Validate markdown syntax (basic check)
      const unclosedCodeBlocks = (content.match(/```/g) || []).length % 2;
      if (unclosedCodeBlocks !== 0) {
        errors.push('Unclosed code blocks detected');
      }

      return {
        isValid: errors.length === 0,
        errors,
      };
    } catch (error) {
      logger.error('Error validating content:', error);
      return {
        isValid: false,
        errors: ['Content validation failed'],
      };
    }
  }

  // Extract plain text from HTML
  static extractPlainText(html: string): string {
    try {
      const dom = new JSDOM(html);
      return dom.window.document.body.textContent || '';
    } catch (error) {
      logger.error('Error extracting plain text:', error);
      return '';
    }
  }

  // Generate content summary
  static generateSummary(content: string, maxLength: number = 200): string {
    try {
      const plainText = this.extractPlainText(content);
      
      if (plainText.length <= maxLength) {
        return plainText;
      }

      // Find the last complete sentence within the limit
      const truncated = plainText.substring(0, maxLength);
      const lastSentenceEnd = Math.max(
        truncated.lastIndexOf('.'),
        truncated.lastIndexOf('!'),
        truncated.lastIndexOf('?')
      );

      if (lastSentenceEnd > maxLength * 0.7) {
        return truncated.substring(0, lastSentenceEnd + 1);
      }

      // If no good sentence break, truncate at word boundary
      const lastSpace = truncated.lastIndexOf(' ');
      return lastSpace > 0 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
    } catch (error) {
      logger.error('Error generating content summary:', error);
      return '';
    }
  }
}

export default ContentProcessor;
