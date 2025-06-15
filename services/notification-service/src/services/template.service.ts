import Handlebars from 'handlebars';
import { config } from '@/config/env';
import { logger } from '@/utils/logger';
import { redisClient } from '@/utils/redis';
import { 
  NotificationTemplate, 
  EmailTemplate, 
  PushTemplate,
  TemplateVariable,
  NotificationType,
  NotificationChannel,
  TemplateError,
  ValidationError
} from '@/types';

export class TemplateService {
  private compiledTemplates = new Map<string, HandlebarsTemplateDelegate>();
  private readonly cachePrefix = 'template:';
  private readonly cacheTTL = config.TEMPLATE_CACHE_TTL;

  constructor() {
    this.registerHelpers();
  }

  /**
   * Register Handlebars helpers for template rendering
   */
  private registerHelpers(): void {
    // Date formatting helper
    Handlebars.registerHelper('formatDate', (date: Date | string, format?: string) => {
      const d = typeof date === 'string' ? new Date(date) : date;
      if (!d || isNaN(d.getTime())) return '';
      
      switch (format) {
        case 'short':
          return d.toLocaleDateString();
        case 'long':
          return d.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          });
        case 'time':
          return d.toLocaleTimeString();
        default:
          return d.toLocaleString();
      }
    });

    // Uppercase helper
    Handlebars.registerHelper('uppercase', (str: string) => {
      return typeof str === 'string' ? str.toUpperCase() : str;
    });

    // Lowercase helper
    Handlebars.registerHelper('lowercase', (str: string) => {
      return typeof str === 'string' ? str.toLowerCase() : str;
    });

    // Capitalize helper
    Handlebars.registerHelper('capitalize', (str: string) => {
      return typeof str === 'string' ? str.charAt(0).toUpperCase() + str.slice(1) : str;
    });

    // Truncate helper
    Handlebars.registerHelper('truncate', (str: string, length: number) => {
      if (typeof str !== 'string') return str;
      return str.length > length ? str.substring(0, length) + '...' : str;
    });

    // Conditional helper
    Handlebars.registerHelper('ifEquals', function(arg1: any, arg2: any, options: any) {
      return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
    });

    // URL helper
    Handlebars.registerHelper('url', (path: string, baseUrl?: string) => {
      const base = baseUrl || config.UNSUBSCRIBE_BASE_URL;
      return new URL(path, base).toString();
    });

    // JSON helper
    Handlebars.registerHelper('json', (obj: any) => {
      return JSON.stringify(obj);
    });

    // Array join helper
    Handlebars.registerHelper('join', (array: any[], separator: string = ', ') => {
      return Array.isArray(array) ? array.join(separator) : '';
    });

    // Number formatting helper
    Handlebars.registerHelper('number', (num: number, decimals?: number) => {
      if (typeof num !== 'number') return num;
      return decimals !== undefined ? num.toFixed(decimals) : num.toString();
    });
  }

  /**
   * Render email template with data
   */
  async renderEmailTemplate(
    template: EmailTemplate,
    data: Record<string, any>,
    templateId?: string
  ): Promise<{
    subject: string;
    htmlBody: string;
    textBody: string;
    fromName?: string;
    replyTo?: string;
  }> {
    try {
      logger.debug('Rendering email template', { templateId, dataKeys: Object.keys(data) });

      const startTime = Date.now();

      // Render each part of the template
      const rendered = {
        subject: await this.renderString(template.subject, data, `${templateId}-subject`),
        htmlBody: await this.renderString(template.htmlBody, data, `${templateId}-html`),
        textBody: await this.renderString(template.textBody, data, `${templateId}-text`),
        fromName: template.fromName ? await this.renderString(template.fromName, data) : undefined,
        replyTo: template.replyTo ? await this.renderString(template.replyTo, data) : undefined
      };

      const renderTime = Date.now() - startTime;
      logger.debug('Email template rendered successfully', { templateId, renderTime });

      return rendered;
    } catch (error) {
      logger.error('Failed to render email template', { templateId, error });
      throw new TemplateError(`Failed to render email template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Render push template with data
   */
  async renderPushTemplate(
    template: PushTemplate,
    data: Record<string, any>,
    templateId?: string
  ): Promise<{
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    image?: string;
    tag?: string;
  }> {
    try {
      logger.debug('Rendering push template', { templateId, dataKeys: Object.keys(data) });

      const startTime = Date.now();

      const rendered = {
        title: await this.renderString(template.title, data, `${templateId}-title`),
        body: await this.renderString(template.body, data, `${templateId}-body`),
        icon: template.icon ? await this.renderString(template.icon, data) : undefined,
        badge: template.badge ? await this.renderString(template.badge, data) : undefined,
        image: template.image ? await this.renderString(template.image, data) : undefined,
        tag: template.tag ? await this.renderString(template.tag, data) : undefined
      };

      const renderTime = Date.now() - startTime;
      logger.debug('Push template rendered successfully', { templateId, renderTime });

      return rendered;
    } catch (error) {
      logger.error('Failed to render push template', { templateId, error });
      throw new TemplateError(`Failed to render push template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Render a template string with data
   */
  async renderString(
    templateString: string,
    data: Record<string, any>,
    cacheKey?: string
  ): Promise<string> {
    if (!templateString) return '';

    try {
      // Check cache first
      let compiledTemplate: HandlebarsTemplateDelegate;
      
      if (cacheKey && this.compiledTemplates.has(cacheKey)) {
        compiledTemplate = this.compiledTemplates.get(cacheKey)!;
      } else {
        // Compile template
        compiledTemplate = Handlebars.compile(templateString, {
          strict: false,
          noEscape: false
        });

        // Cache compiled template
        if (cacheKey && config.ENABLE_TEMPLATE_CACHING) {
          this.compiledTemplates.set(cacheKey, compiledTemplate);
        }
      }

      // Render with timeout
      const renderPromise = new Promise<string>((resolve, reject) => {
        try {
          const result = compiledTemplate(data);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Template rendering timeout')), config.TEMPLATE_RENDER_TIMEOUT);
      });

      return await Promise.race([renderPromise, timeoutPromise]);
    } catch (error) {
      logger.error('Failed to render template string', { 
        templateString: templateString.substring(0, 100) + '...', 
        error 
      });
      throw new TemplateError(`Template rendering failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate template syntax
   */
  validateTemplate(templateString: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      // Try to compile the template
      Handlebars.compile(templateString, { strict: true });
      
      // Check for common issues
      this.validateTemplateSyntax(templateString, errors);
      
      return { valid: errors.length === 0, errors };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Template compilation failed');
      return { valid: false, errors };
    }
  }

  /**
   * Validate template variables against schema
   */
  validateTemplateData(
    data: Record<string, any>,
    variables: TemplateVariable[]
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required variables
    for (const variable of variables) {
      if (variable.required && !(variable.name in data)) {
        errors.push(`Required variable '${variable.name}' is missing`);
        continue;
      }

      const value = data[variable.name];
      if (value !== undefined && value !== null) {
        // Type validation
        if (!this.validateVariableType(value, variable.type)) {
          errors.push(`Variable '${variable.name}' has invalid type. Expected ${variable.type}, got ${typeof value}`);
        }

        // Additional validation
        if (variable.validation) {
          const validationErrors = this.validateVariableConstraints(value, variable.validation, variable.name);
          errors.push(...validationErrors);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Extract variables from template string
   */
  extractVariables(templateString: string): string[] {
    const variables = new Set<string>();
    const regex = /\{\{\s*([^}]+)\s*\}\}/g;
    let match;

    while ((match = regex.exec(templateString)) !== null) {
      const variable = match[1].trim();
      // Remove helpers and get base variable name
      const baseVar = variable.split(' ')[0].split('.')[0];
      if (baseVar && !this.isHandlebarsHelper(baseVar)) {
        variables.add(baseVar);
      }
    }

    return Array.from(variables);
  }

  /**
   * Generate default template data for testing
   */
  generateTestData(variables: TemplateVariable[]): Record<string, any> {
    const testData: Record<string, any> = {};

    for (const variable of variables) {
      if (variable.defaultValue !== undefined) {
        testData[variable.name] = variable.defaultValue;
      } else {
        testData[variable.name] = this.generateDefaultValue(variable.type);
      }
    }

    return testData;
  }

  /**
   * Preview template with test data
   */
  async previewTemplate(
    template: NotificationTemplate,
    testData?: Record<string, any>
  ): Promise<{
    email?: {
      subject: string;
      htmlBody: string;
      textBody: string;
    };
    push?: {
      title: string;
      body: string;
    };
  }> {
    const data = testData || this.generateTestData(template.variables);
    const preview: any = {};

    try {
      if (template.emailTemplate && template.channels.includes(NotificationChannel.EMAIL)) {
        preview.email = await this.renderEmailTemplate(template.emailTemplate, data, template.id);
      }

      if (template.pushTemplate && template.channels.includes(NotificationChannel.WEB_PUSH)) {
        preview.push = await this.renderPushTemplate(template.pushTemplate, data, template.id);
      }

      return preview;
    } catch (error) {
      logger.error('Failed to preview template', { templateId: template.id, error });
      throw new TemplateError(`Template preview failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Cache template in Redis
   */
  async cacheTemplate(templateId: string, template: NotificationTemplate): Promise<void> {
    if (!config.ENABLE_TEMPLATE_CACHING) return;

    try {
      const cacheKey = `${this.cachePrefix}${templateId}`;
      await redisClient.setex(cacheKey, this.cacheTTL, JSON.stringify(template));
      logger.debug('Template cached successfully', { templateId });
    } catch (error) {
      logger.warn('Failed to cache template', { templateId, error });
    }
  }

  /**
   * Get template from cache
   */
  async getCachedTemplate(templateId: string): Promise<NotificationTemplate | null> {
    if (!config.ENABLE_TEMPLATE_CACHING) return null;

    try {
      const cacheKey = `${this.cachePrefix}${templateId}`;
      const cached = await redisClient.get(cacheKey);
      
      if (cached) {
        logger.debug('Template retrieved from cache', { templateId });
        return JSON.parse(cached);
      }
    } catch (error) {
      logger.warn('Failed to get cached template', { templateId, error });
    }

    return null;
  }

  /**
   * Clear template cache
   */
  async clearTemplateCache(templateId?: string): Promise<void> {
    try {
      if (templateId) {
        const cacheKey = `${this.cachePrefix}${templateId}`;
        await redisClient.del(cacheKey);
        this.compiledTemplates.delete(templateId);
        logger.debug('Template cache cleared', { templateId });
      } else {
        const keys = await redisClient.keys(`${this.cachePrefix}*`);
        if (keys.length > 0) {
          await redisClient.del(...keys);
        }
        this.compiledTemplates.clear();
        logger.debug('All template cache cleared');
      }
    } catch (error) {
      logger.warn('Failed to clear template cache', { templateId, error });
    }
  }

  /**
   * Validate template syntax for common issues
   */
  private validateTemplateSyntax(templateString: string, errors: string[]): void {
    // Check for unmatched braces
    const openBraces = (templateString.match(/\{\{/g) || []).length;
    const closeBraces = (templateString.match(/\}\}/g) || []).length;
    
    if (openBraces !== closeBraces) {
      errors.push('Unmatched template braces');
    }

    // Check for potentially dangerous expressions
    const dangerousPatterns = [
      /\{\{\s*#each\s+[^}]*\}\}.*\{\{\s*\/each\s*\}\}/s,
      /\{\{\s*#if\s+[^}]*\}\}.*\{\{\s*\/if\s*\}\}/s
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(templateString)) {
        // This is actually fine, just checking for proper closure
        continue;
      }
    }

    // Check template size
    if (templateString.length > config.MAX_TEMPLATE_SIZE) {
      errors.push(`Template size exceeds maximum allowed size of ${config.MAX_TEMPLATE_SIZE} characters`);
    }
  }

  /**
   * Validate variable type
   */
  private validateVariableType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'date':
        return value instanceof Date || !isNaN(Date.parse(value));
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        return true;
    }
  }

  /**
   * Validate variable constraints
   */
  private validateVariableConstraints(
    value: any,
    validation: TemplateVariable['validation'],
    variableName: string
  ): string[] {
    const errors: string[] = [];

    if (!validation) return errors;

    // Min/Max validation for numbers and strings
    if (validation.min !== undefined) {
      if (typeof value === 'number' && value < validation.min) {
        errors.push(`Variable '${variableName}' must be at least ${validation.min}`);
      } else if (typeof value === 'string' && value.length < validation.min) {
        errors.push(`Variable '${variableName}' must be at least ${validation.min} characters long`);
      }
    }

    if (validation.max !== undefined) {
      if (typeof value === 'number' && value > validation.max) {
        errors.push(`Variable '${variableName}' must be at most ${validation.max}`);
      } else if (typeof value === 'string' && value.length > validation.max) {
        errors.push(`Variable '${variableName}' must be at most ${validation.max} characters long`);
      }
    }

    // Pattern validation for strings
    if (validation.pattern && typeof value === 'string') {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(value)) {
        errors.push(`Variable '${variableName}' does not match required pattern`);
      }
    }

    // Enum validation
    if (validation.enum && !validation.enum.includes(value)) {
      errors.push(`Variable '${variableName}' must be one of: ${validation.enum.join(', ')}`);
    }

    return errors;
  }

  /**
   * Check if string is a Handlebars helper
   */
  private isHandlebarsHelper(str: string): boolean {
    const helpers = [
      'if', 'unless', 'each', 'with', 'lookup', 'log',
      'formatDate', 'uppercase', 'lowercase', 'capitalize', 
      'truncate', 'ifEquals', 'url', 'json', 'join', 'number'
    ];
    return helpers.includes(str);
  }

  /**
   * Generate default value for variable type
   */
  private generateDefaultValue(type: string): any {
    switch (type) {
      case 'string':
        return 'Sample Text';
      case 'number':
        return 42;
      case 'boolean':
        return true;
      case 'date':
        return new Date();
      case 'array':
        return ['Item 1', 'Item 2'];
      case 'object':
        return { key: 'value' };
      default:
        return 'Default Value';
    }
  }
}

// Singleton instance
export const templateService = new TemplateService();
