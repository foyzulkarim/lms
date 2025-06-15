import { Octokit } from '@octokit/rest';
import { v4 as uuidv4 } from 'uuid';
import { config } from '@/config/environment';
import { contentLogger } from '@/utils/logger';
import { 
  ContentItem, 
  ContentSourceType, 
  ProcessingStatus, 
  GitHubIngestionRequest,
  ExtractionError 
} from '@/types';

interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir';
  downloadUrl?: string;
  content?: string;
}

interface GitHubRepository {
  owner: string;
  repo: string;
  fullName: string;
  description?: string;
  language?: string;
  stars: number;
  forks: number;
  updatedAt: string;
}

export class GitHubAdapter {
  private octokit: Octokit;
  private isConfigured: boolean;

  constructor() {
    this.isConfigured = !!config.GITHUB_TOKEN;
    
    this.octokit = new Octokit({
      auth: config.GITHUB_TOKEN,
      userAgent: 'content-ingestion-service/1.0.0',
      timeZone: 'UTC',
      request: {
        timeout: 30000,
      },
    });
  }

  /**
   * Ingest GitHub repository content
   */
  async ingestRepository(request: GitHubIngestionRequest): Promise<ContentItem[]> {
    if (!this.isConfigured) {
      throw new ExtractionError('GitHub token not configured');
    }

    const startTime = Date.now();
    
    try {
      contentLogger.info('Starting GitHub repository ingestion', {
        repository: request.repository,
        branch: request.branch,
        paths: request.paths,
        includeCode: request.includeCode,
      });

      const [owner, repo] = request.repository.split('/');
      if (!owner || !repo) {
        throw new ExtractionError('Invalid repository format. Use "owner/repo"');
      }

      // Get repository metadata
      const repoInfo = await this.getRepositoryInfo(owner, repo);
      
      // Get files to process
      const filesToProcess = await this.getFilesToProcess(
        owner, 
        repo, 
        request.branch || 'main',
        request.paths || ['/'],
        request.includeCode || false
      );

      // Process each file
      const contentItems: ContentItem[] = [];
      
      for (const file of filesToProcess) {
        try {
          const contentItem = await this.processFile(
            owner,
            repo,
            file,
            request,
            repoInfo
          );
          
          if (contentItem) {
            contentItems.push(contentItem);
          }
        } catch (error) {
          contentLogger.warn('Failed to process GitHub file', {
            repository: request.repository,
            filePath: file.path,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          // Continue processing other files
        }
      }

      const duration = Date.now() - startTime;
      contentLogger.info('GitHub repository ingestion completed', {
        repository: request.repository,
        filesProcessed: contentItems.length,
        duration,
      });

      return contentItems;
    } catch (error) {
      const duration = Date.now() - startTime;
      contentLogger.error('GitHub repository ingestion failed', error as Error, {
        repository: request.repository,
        duration,
      });

      throw new ExtractionError(
        `Failed to ingest GitHub repository: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { repository: request.repository }
      );
    }
  }

  /**
   * Get repository information
   */
  private async getRepositoryInfo(owner: string, repo: string): Promise<GitHubRepository> {
    try {
      const response = await this.octokit.rest.repos.get({
        owner,
        repo,
      });

      const repoData = response.data;
      
      return {
        owner,
        repo,
        fullName: repoData.full_name,
        description: repoData.description || undefined,
        language: repoData.language || undefined,
        stars: repoData.stargazers_count,
        forks: repoData.forks_count,
        updatedAt: repoData.updated_at,
      };
    } catch (error: any) {
      if (error.status === 404) {
        throw new ExtractionError('Repository not found or not accessible');
      } else if (error.status === 403) {
        throw new ExtractionError('GitHub API rate limit exceeded or insufficient permissions');
      }
      
      throw new ExtractionError(`Failed to get repository info: ${error.message}`);
    }
  }

  /**
   * Get files to process from repository
   */
  private async getFilesToProcess(
    owner: string,
    repo: string,
    branch: string,
    paths: string[],
    includeCode: boolean
  ): Promise<GitHubFile[]> {
    const allFiles: GitHubFile[] = [];

    for (const path of paths) {
      const files = await this.getFilesFromPath(owner, repo, branch, path, includeCode);
      allFiles.push(...files);
    }

    return allFiles;
  }

  /**
   * Get files from a specific path
   */
  private async getFilesFromPath(
    owner: string,
    repo: string,
    branch: string,
    path: string,
    includeCode: boolean
  ): Promise<GitHubFile[]> {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path: path === '/' ? '' : path,
        ref: branch,
      });

      const files: GitHubFile[] = [];
      const contents = Array.isArray(response.data) ? response.data : [response.data];

      for (const item of contents) {
        if (item.type === 'file') {
          // Check if file should be processed
          if (this.shouldProcessFile(item.name, includeCode)) {
            files.push({
              name: item.name,
              path: item.path,
              sha: item.sha,
              size: item.size || 0,
              type: 'file',
              downloadUrl: item.download_url || undefined,
            });
          }
        } else if (item.type === 'dir') {
          // Recursively get files from subdirectory
          const subFiles = await this.getFilesFromPath(
            owner,
            repo,
            branch,
            item.path,
            includeCode
          );
          files.push(...subFiles);
        }
      }

      return files;
    } catch (error: any) {
      if (error.status === 404) {
        contentLogger.warn('Path not found in repository', {
          owner,
          repo,
          branch,
          path,
        });
        return [];
      }
      
      throw error;
    }
  }

  /**
   * Process a single file
   */
  private async processFile(
    owner: string,
    repo: string,
    file: GitHubFile,
    request: GitHubIngestionRequest,
    repoInfo: GitHubRepository
  ): Promise<ContentItem | null> {
    try {
      // Get file content
      const content = await this.getFileContent(owner, repo, file.path);
      
      if (!content || content.length === 0) {
        return null;
      }

      // Determine content type
      const contentType = this.getContentType(file.name);
      
      // Create content item
      const contentItem: ContentItem = {
        id: uuidv4(),
        sourceId: `${request.repository}:${file.path}`,
        sourceType: ContentSourceType.GITHUB,
        sourceMetadata: {
          repository: request.repository,
          path: file.path,
          branch: request.branch || 'main',
          sha: file.sha,
          size: file.size,
          downloadUrl: file.downloadUrl,
          repoInfo: {
            description: repoInfo.description,
            language: repoInfo.language,
            stars: repoInfo.stars,
            forks: repoInfo.forks,
          },
        },
        title: this.generateTitle(file.name, file.path, repoInfo.fullName),
        description: this.generateDescription(file, repoInfo),
        content,
        contentType,
        language: 'en', // TODO: Add language detection
        processingStatus: ProcessingStatus.PROCESSING,
        tags: [...(request.tags || []), 'github', repoInfo.language || 'unknown'].filter(Boolean),
        categories: request.categories || ['documentation'],
        courseId: request.courseId,
        moduleId: request.moduleId,
        version: 1,
        isLatest: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      return contentItem;
    } catch (error) {
      contentLogger.error('Failed to process GitHub file', error as Error, {
        repository: request.repository,
        filePath: file.path,
      });
      return null;
    }
  }

  /**
   * Get file content from GitHub
   */
  private async getFileContent(owner: string, repo: string, path: string): Promise<string> {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
      });

      const fileData = response.data as any;
      
      if (fileData.type !== 'file' || !fileData.content) {
        throw new Error('Invalid file data');
      }

      // Decode base64 content
      const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
      
      // Check file size limit (1MB)
      if (content.length > 1024 * 1024) {
        contentLogger.warn('File too large, truncating', {
          path,
          originalSize: content.length,
          truncatedSize: 1024 * 1024,
        });
        return content.substring(0, 1024 * 1024) + '\n\n[Content truncated due to size limit]';
      }

      return content;
    } catch (error: any) {
      if (error.status === 404) {
        throw new Error('File not found');
      }
      throw error;
    }
  }

  /**
   * Check if file should be processed
   */
  private shouldProcessFile(fileName: string, includeCode: boolean): boolean {
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    
    // Always include documentation files
    const docExtensions = ['md', 'txt', 'rst', 'adoc', 'wiki'];
    if (docExtensions.includes(extension)) {
      return true;
    }

    // Include code files if requested
    if (includeCode) {
      const codeExtensions = [
        'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'php',
        'rb', 'go', 'rs', 'swift', 'kt', 'scala', 'clj', 'hs', 'ml', 'r',
        'sql', 'html', 'css', 'scss', 'less', 'json', 'xml', 'yaml', 'yml',
        'toml', 'ini', 'cfg', 'conf'
      ];
      return codeExtensions.includes(extension);
    }

    // Include specific important files
    const importantFiles = [
      'readme', 'license', 'changelog', 'contributing', 'code_of_conduct',
      'security', 'support', 'authors', 'contributors', 'maintainers'
    ];
    
    const fileNameLower = fileName.toLowerCase().replace(/\.[^.]*$/, '');
    return importantFiles.includes(fileNameLower);
  }

  /**
   * Get content type based on file extension
   */
  private getContentType(fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    
    const typeMap: Record<string, string> = {
      'md': 'text/markdown',
      'txt': 'text/plain',
      'rst': 'text/x-rst',
      'adoc': 'text/asciidoc',
      'html': 'text/html',
      'xml': 'text/xml',
      'json': 'application/json',
      'yaml': 'text/yaml',
      'yml': 'text/yaml',
      'js': 'text/javascript',
      'ts': 'text/typescript',
      'py': 'text/x-python',
      'java': 'text/x-java',
      'cpp': 'text/x-c++',
      'c': 'text/x-c',
      'cs': 'text/x-csharp',
      'php': 'text/x-php',
      'rb': 'text/x-ruby',
      'go': 'text/x-go',
      'rs': 'text/x-rust',
      'sql': 'text/x-sql',
    };

    return typeMap[extension] || 'text/plain';
  }

  /**
   * Generate title for content item
   */
  private generateTitle(fileName: string, filePath: string, repoName: string): string {
    // Remove extension for title
    const nameWithoutExt = fileName.replace(/\.[^.]*$/, '');
    
    // If it's a README file, use the directory name
    if (nameWithoutExt.toLowerCase() === 'readme') {
      const pathParts = filePath.split('/');
      const dirName = pathParts[pathParts.length - 2] || repoName.split('/')[1];
      return `${dirName} - README`;
    }

    // For other files, use filename and path context
    const pathParts = filePath.split('/');
    if (pathParts.length > 1) {
      const dirName = pathParts[pathParts.length - 2];
      return `${nameWithoutExt} (${dirName})`;
    }

    return nameWithoutExt;
  }

  /**
   * Generate description for content item
   */
  private generateDescription(file: GitHubFile, repoInfo: GitHubRepository): string {
    const parts = [
      `File from GitHub repository ${repoInfo.fullName}`,
    ];

    if (repoInfo.description) {
      parts.push(`Repository: ${repoInfo.description}`);
    }

    if (repoInfo.language) {
      parts.push(`Primary language: ${repoInfo.language}`);
    }

    parts.push(`File path: ${file.path}`);
    parts.push(`File size: ${this.formatFileSize(file.size)}`);

    return parts.join('. ');
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Validate repository format
   */
  isValidRepository(repository: string): boolean {
    const repoRegex = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
    return repoRegex.test(repository);
  }

  /**
   * Check if GitHub API is available
   */
  async healthCheck(): Promise<boolean> {
    if (!this.isConfigured) {
      contentLogger.warn('GitHub token not configured');
      return false;
    }

    try {
      // Test with a simple API call
      await this.octokit.rest.users.getAuthenticated();
      return true;
    } catch (error) {
      contentLogger.error('GitHub API health check failed', error as Error);
      return false;
    }
  }

  /**
   * Get rate limit information
   */
  async getRateLimit(): Promise<any> {
    if (!this.isConfigured) {
      return null;
    }

    try {
      const response = await this.octokit.rest.rateLimit.get();
      return response.data;
    } catch (error) {
      contentLogger.error('Failed to get GitHub rate limit', error as Error);
      return null;
    }
  }

  /**
   * Get adapter statistics
   */
  getStats(): any {
    return {
      configured: this.isConfigured,
      userAgent: 'content-ingestion-service/1.0.0',
    };
  }
}

// Export singleton instance
export const gitHubAdapter = new GitHubAdapter();
