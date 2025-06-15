import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { analyticsController } from '@/controllers/analytics.controller';

export async function analyticsRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  // ============================================================================
  // Dashboard Routes
  // ============================================================================

  fastify.get('/dashboard', {
    schema: {
      description: 'Get dashboard analytics data',
      tags: ['Dashboard'],
      querystring: {
        type: 'object',
        properties: {
          timeframe: {
            type: 'string',
            enum: ['7d', '30d', '90d', '1y', 'all'],
            default: '30d',
            description: 'Time period for analytics data'
          },
          filters: {
            type: 'string',
            description: 'JSON string of filters to apply'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                metrics: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      metricType: { type: 'string' },
                      value: { type: 'number' },
                      previousValue: { type: 'number' },
                      changePercentage: { type: 'number' },
                      timeframe: { type: 'string' },
                      calculatedAt: { type: 'string', format: 'date-time' }
                    }
                  }
                },
                charts: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      title: { type: 'string' },
                      type: { type: 'string' },
                      data: { type: 'array' }
                    }
                  }
                },
                summary: {
                  type: 'object',
                  properties: {
                    totalUsers: { type: 'number' },
                    activeUsers: { type: 'number' },
                    totalCourses: { type: 'number' },
                    totalEnrollments: { type: 'number' },
                    overallCompletionRate: { type: 'number' }
                  }
                },
                lastUpdated: { type: 'string', format: 'date-time' }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, analyticsController.getDashboard.bind(analyticsController));

  // ============================================================================
  // User Analytics Routes
  // ============================================================================

  fastify.get('/users/:userId/analytics', {
    schema: {
      description: 'Get analytics data for a specific user',
      tags: ['User Analytics'],
      params: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: {
            type: 'string',
            format: 'uuid',
            description: 'User ID'
          }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          useCache: {
            type: 'string',
            enum: ['true', 'false'],
            default: 'true',
            description: 'Whether to use cached data'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                userId: { type: 'string' },
                totalCoursesEnrolled: { type: 'number' },
                totalCoursesCompleted: { type: 'number' },
                totalLearningHours: { type: 'number' },
                averageScore: { type: 'number' },
                completionRate: { type: 'number' },
                engagementScore: { type: 'number' },
                streakDays: { type: 'number' },
                lastActiveDate: { type: 'string', format: 'date-time', nullable: true }
              }
            }
          }
        }
      }
    }
  }, analyticsController.getUserAnalytics.bind(analyticsController));

  fastify.get('/analytics/top-performers', {
    schema: {
      description: 'Get top performing users',
      tags: ['User Analytics'],
      querystring: {
        type: 'object',
        properties: {
          limit: {
            type: 'string',
            pattern: '^[1-9][0-9]*$',
            description: 'Number of top performers to return (1-100)',
            default: '10'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  userId: { type: 'string' },
                  engagementScore: { type: 'number' },
                  completionRate: { type: 'number' },
                  averageScore: { type: 'number' },
                  totalCoursesCompleted: { type: 'number' }
                }
              }
            }
          }
        }
      }
    }
  }, analyticsController.getTopPerformers.bind(analyticsController));

  // ============================================================================
  // Course Analytics Routes
  // ============================================================================

  fastify.get('/courses/:courseId/analytics', {
    schema: {
      description: 'Get analytics data for a specific course',
      tags: ['Course Analytics'],
      params: {
        type: 'object',
        required: ['courseId'],
        properties: {
          courseId: {
            type: 'string',
            format: 'uuid',
            description: 'Course ID'
          }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          useCache: {
            type: 'string',
            enum: ['true', 'false'],
            default: 'true',
            description: 'Whether to use cached data'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                courseId: { type: 'string' },
                totalEnrollments: { type: 'number' },
                totalCompletions: { type: 'number' },
                completionRate: { type: 'number' },
                averageScore: { type: 'number' },
                averageTimeToComplete: { type: 'number' },
                popularityScore: { type: 'number' },
                difficultyRating: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, analyticsController.getCourseAnalytics.bind(analyticsController));

  fastify.get('/analytics/popular-courses', {
    schema: {
      description: 'Get most popular courses',
      tags: ['Course Analytics'],
      querystring: {
        type: 'object',
        properties: {
          limit: {
            type: 'string',
            pattern: '^[1-9][0-9]*$',
            description: 'Number of popular courses to return (1-100)',
            default: '10'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  courseId: { type: 'string' },
                  totalEnrollments: { type: 'number' },
                  completionRate: { type: 'number' },
                  popularityScore: { type: 'number' },
                  averageScore: { type: 'number' }
                }
              }
            }
          }
        }
      }
    }
  }, analyticsController.getPopularCourses.bind(analyticsController));

  // ============================================================================
  // Learning Progress Routes
  // ============================================================================

  fastify.get('/learning-progress', {
    schema: {
      description: 'Get learning progress data with optional filters',
      tags: ['Learning Progress'],
      querystring: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            format: 'uuid',
            description: 'Filter by user ID'
          },
          courseId: {
            type: 'string',
            format: 'uuid',
            description: 'Filter by course ID'
          },
          status: {
            type: 'string',
            enum: ['not_started', 'in_progress', 'completed', 'dropped'],
            description: 'Filter by progress status'
          },
          limit: {
            type: 'string',
            pattern: '^[1-9][0-9]*$',
            description: 'Number of records to return (1-1000)',
            default: '50'
          },
          offset: {
            type: 'string',
            pattern: '^[0-9]+$',
            description: 'Number of records to skip',
            default: '0'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  userId: { type: 'string' },
                  courseId: { type: 'string' },
                  moduleId: { type: 'string', nullable: true },
                  progressPercentage: { type: 'number' },
                  timeSpent: { type: 'number' },
                  status: { type: 'string' },
                  score: { type: 'number', nullable: true },
                  lastAccessDate: { type: 'string', format: 'date-time', nullable: true },
                  completionDate: { type: 'string', format: 'date-time', nullable: true }
                }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                limit: { type: 'number' },
                offset: { type: 'number' },
                hasMore: { type: 'boolean' }
              }
            }
          }
        }
      }
    }
  }, analyticsController.getLearningProgress.bind(analyticsController));

  // ============================================================================
  // Cache Management Routes
  // ============================================================================

  fastify.post('/analytics/cache/invalidate', {
    schema: {
      description: 'Invalidate analytics cache',
      tags: ['Cache Management'],
      body: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['dashboard', 'user', 'course', 'all'],
            default: 'all',
            description: 'Type of cache to invalidate'
          },
          keys: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific cache keys to invalidate'
          },
          timeframes: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['7d', '30d', '90d', '1y']
            },
            description: 'Dashboard timeframes to invalidate'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, analyticsController.invalidateCache.bind(analyticsController));

  fastify.post('/analytics/cache/warmup', {
    schema: {
      description: 'Warm up analytics cache',
      tags: ['Cache Management'],
      response: {
        202: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, analyticsController.warmupCache.bind(analyticsController));

  // ============================================================================
  // System Routes
  // ============================================================================

  fastify.get('/system/info', {
    schema: {
      description: 'Get system information',
      tags: ['System'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                service: { type: 'string' },
                version: { type: 'string' },
                environment: { type: 'string' },
                uptime: { type: 'number' },
                memory: {
                  type: 'object',
                  properties: {
                    rss: { type: 'number' },
                    heapTotal: { type: 'number' },
                    heapUsed: { type: 'number' },
                    external: { type: 'number' }
                  }
                },
                platform: { type: 'string' },
                nodeVersion: { type: 'string' },
                timestamp: { type: 'string', format: 'date-time' }
              }
            }
          }
        }
      }
    }
  }, analyticsController.getSystemInfo.bind(analyticsController));
}
