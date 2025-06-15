-- Analytics Service Database Schema
-- Version: 1.0.0
-- Description: Initial schema for learning analytics, reporting, and business intelligence

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- ============================================================================
-- User Analytics Table
-- ============================================================================
CREATE TABLE user_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE,
    total_courses_enrolled INTEGER DEFAULT 0 CHECK (total_courses_enrolled >= 0),
    total_courses_completed INTEGER DEFAULT 0 CHECK (total_courses_completed >= 0),
    total_learning_hours DECIMAL(10,2) DEFAULT 0 CHECK (total_learning_hours >= 0),
    average_score DECIMAL(5,2) DEFAULT 0 CHECK (average_score >= 0 AND average_score <= 100),
    last_active_date TIMESTAMP WITH TIME ZONE,
    streak_days INTEGER DEFAULT 0 CHECK (streak_days >= 0),
    learning_path JSONB DEFAULT '[]'::jsonb,
    skills_acquired JSONB DEFAULT '[]'::jsonb,
    engagement_score DECIMAL(5,2) DEFAULT 0 CHECK (engagement_score >= 0 AND engagement_score <= 100),
    completion_rate DECIMAL(5,2) DEFAULT 0 CHECK (completion_rate >= 0 AND completion_rate <= 100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for user_analytics
CREATE INDEX idx_user_analytics_user_id ON user_analytics(user_id);
CREATE INDEX idx_user_analytics_last_active ON user_analytics(last_active_date DESC);
CREATE INDEX idx_user_analytics_engagement ON user_analytics(engagement_score DESC);
CREATE INDEX idx_user_analytics_completion_rate ON user_analytics(completion_rate DESC);
CREATE INDEX idx_user_analytics_updated_at ON user_analytics(updated_at DESC);

-- ============================================================================
-- Course Analytics Table
-- ============================================================================
CREATE TABLE course_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL UNIQUE,
    total_enrollments INTEGER DEFAULT 0 CHECK (total_enrollments >= 0),
    total_completions INTEGER DEFAULT 0 CHECK (total_completions >= 0),
    completion_rate DECIMAL(5,2) DEFAULT 0 CHECK (completion_rate >= 0 AND completion_rate <= 100),
    average_score DECIMAL(5,2) DEFAULT 0 CHECK (average_score >= 0 AND average_score <= 100),
    average_time_to_complete DECIMAL(10,2) DEFAULT 0 CHECK (average_time_to_complete >= 0),
    enrollment_trend JSONB DEFAULT '[]'::jsonb,
    module_analytics JSONB DEFAULT '[]'::jsonb,
    dropoff_points JSONB DEFAULT '[]'::jsonb,
    popularity_score DECIMAL(5,2) DEFAULT 0 CHECK (popularity_score >= 0 AND popularity_score <= 100),
    difficulty_rating DECIMAL(3,2) DEFAULT 0 CHECK (difficulty_rating >= 1 AND difficulty_rating <= 5),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for course_analytics
CREATE INDEX idx_course_analytics_course_id ON course_analytics(course_id);
CREATE INDEX idx_course_analytics_completion_rate ON course_analytics(completion_rate DESC);
CREATE INDEX idx_course_analytics_popularity ON course_analytics(popularity_score DESC);
CREATE INDEX idx_course_analytics_enrollments ON course_analytics(total_enrollments DESC);
CREATE INDEX idx_course_analytics_updated_at ON course_analytics(updated_at DESC);

-- ============================================================================
-- Assessment Analytics Table
-- ============================================================================
CREATE TABLE assessment_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id UUID NOT NULL UNIQUE,
    course_id UUID NOT NULL,
    total_attempts INTEGER DEFAULT 0 CHECK (total_attempts >= 0),
    average_score DECIMAL(5,2) DEFAULT 0 CHECK (average_score >= 0 AND average_score <= 100),
    pass_rate DECIMAL(5,2) DEFAULT 0 CHECK (pass_rate >= 0 AND pass_rate <= 100),
    average_time_spent DECIMAL(10,2) DEFAULT 0 CHECK (average_time_spent >= 0),
    question_analytics JSONB DEFAULT '[]'::jsonb,
    difficulty_rating DECIMAL(3,2) DEFAULT 0 CHECK (difficulty_rating >= 1 AND difficulty_rating <= 5),
    retake_rate DECIMAL(5,2) DEFAULT 0 CHECK (retake_rate >= 0 AND retake_rate <= 100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for assessment_analytics
CREATE INDEX idx_assessment_analytics_assessment_id ON assessment_analytics(assessment_id);
CREATE INDEX idx_assessment_analytics_course_id ON assessment_analytics(course_id);
CREATE INDEX idx_assessment_analytics_pass_rate ON assessment_analytics(pass_rate DESC);
CREATE INDEX idx_assessment_analytics_difficulty ON assessment_analytics(difficulty_rating DESC);
CREATE INDEX idx_assessment_analytics_updated_at ON assessment_analytics(updated_at DESC);

-- ============================================================================
-- Dashboard Metrics Table
-- ============================================================================
CREATE TABLE dashboard_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_type VARCHAR(50) NOT NULL,
    value DECIMAL(15,2) NOT NULL,
    previous_value DECIMAL(15,2) DEFAULT 0,
    change_percentage DECIMAL(5,2) DEFAULT 0,
    timeframe VARCHAR(10) NOT NULL,
    filters JSONB DEFAULT '{}'::jsonb,
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for dashboard_metrics
CREATE INDEX idx_dashboard_metrics_type_timeframe ON dashboard_metrics(metric_type, timeframe);
CREATE INDEX idx_dashboard_metrics_calculated_at ON dashboard_metrics(calculated_at DESC);
CREATE INDEX idx_dashboard_metrics_type ON dashboard_metrics(metric_type);

-- ============================================================================
-- Learning Progress Table
-- ============================================================================
CREATE TABLE learning_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    course_id UUID NOT NULL,
    module_id UUID,
    progress_percentage DECIMAL(5,2) DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    time_spent INTEGER DEFAULT 0 CHECK (time_spent >= 0), -- in minutes
    last_access_date TIMESTAMP WITH TIME ZONE,
    completion_date TIMESTAMP WITH TIME ZONE,
    score DECIMAL(5,2) CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
    status VARCHAR(20) DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'dropped')),
    milestones JSONB DEFAULT '[]'::jsonb,
    engagement_level VARCHAR(10) DEFAULT 'medium' CHECK (engagement_level IN ('low', 'medium', 'high')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, course_id, module_id)
);

-- Indexes for learning_progress
CREATE INDEX idx_learning_progress_user_id ON learning_progress(user_id);
CREATE INDEX idx_learning_progress_course_id ON learning_progress(course_id);
CREATE INDEX idx_learning_progress_status ON learning_progress(status);
CREATE INDEX idx_learning_progress_completion_date ON learning_progress(completion_date DESC);
CREATE INDEX idx_learning_progress_last_access ON learning_progress(last_access_date DESC);
CREATE INDEX idx_learning_progress_engagement ON learning_progress(engagement_level);
CREATE INDEX idx_learning_progress_updated_at ON learning_progress(updated_at DESC);

-- ============================================================================
-- Report Jobs Table
-- ============================================================================
CREATE TABLE report_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id VARCHAR(100) NOT NULL,
    report_type VARCHAR(50) NOT NULL,
    requested_by UUID NOT NULL,
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    file_path VARCHAR(500),
    file_size BIGINT CHECK (file_size IS NULL OR file_size >= 0),
    record_count INTEGER CHECK (record_count IS NULL OR record_count >= 0),
    error_message TEXT,
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    estimated_completion TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for report_jobs
CREATE INDEX idx_report_jobs_status ON report_jobs(status);
CREATE INDEX idx_report_jobs_requested_by ON report_jobs(requested_by);
CREATE INDEX idx_report_jobs_report_type ON report_jobs(report_type);
CREATE INDEX idx_report_jobs_created_at ON report_jobs(created_at DESC);
CREATE INDEX idx_report_jobs_completed_at ON report_jobs(completed_at DESC);

-- ============================================================================
-- Event Log Table (for audit and debugging)
-- ============================================================================
CREATE TABLE event_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    user_id UUID,
    course_id UUID,
    assessment_id UUID,
    module_id UUID,
    session_id UUID,
    event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processing_duration INTEGER, -- in milliseconds
    status VARCHAR(20) DEFAULT 'processed' CHECK (status IN ('processed', 'failed', 'retrying')),
    error_message TEXT,
    retry_count INTEGER DEFAULT 0 CHECK (retry_count >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for event_log
CREATE INDEX idx_event_log_event_type ON event_log(event_type);
CREATE INDEX idx_event_log_user_id ON event_log(user_id);
CREATE INDEX idx_event_log_course_id ON event_log(course_id);
CREATE INDEX idx_event_log_status ON event_log(status);
CREATE INDEX idx_event_log_processed_at ON event_log(processed_at DESC);
CREATE INDEX idx_event_log_created_at ON event_log(created_at DESC);

-- ============================================================================
-- Aggregation Jobs Table (for batch processing)
-- ============================================================================
CREATE TABLE aggregation_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_type VARCHAR(50) NOT NULL,
    job_name VARCHAR(100) NOT NULL,
    parameters JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration INTEGER, -- in milliseconds
    records_processed INTEGER DEFAULT 0 CHECK (records_processed >= 0),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for aggregation_jobs
CREATE INDEX idx_aggregation_jobs_status ON aggregation_jobs(status);
CREATE INDEX idx_aggregation_jobs_type ON aggregation_jobs(job_type);
CREATE INDEX idx_aggregation_jobs_scheduled ON aggregation_jobs(scheduled_for);
CREATE INDEX idx_aggregation_jobs_created_at ON aggregation_jobs(created_at DESC);

-- ============================================================================
-- Materialized Views for Performance
-- ============================================================================

-- Daily user activity summary
CREATE MATERIALIZED VIEW daily_user_activity AS
SELECT 
    DATE(last_access_date) as activity_date,
    COUNT(DISTINCT user_id) as active_users,
    AVG(time_spent) as avg_time_spent,
    SUM(time_spent) as total_time_spent
FROM learning_progress 
WHERE last_access_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY DATE(last_access_date)
ORDER BY activity_date DESC;

CREATE UNIQUE INDEX idx_daily_user_activity_date ON daily_user_activity(activity_date);

-- Course popularity ranking
CREATE MATERIALIZED VIEW course_popularity_ranking AS
SELECT 
    ca.course_id,
    ca.total_enrollments,
    ca.completion_rate,
    ca.average_score,
    ca.popularity_score,
    RANK() OVER (ORDER BY ca.popularity_score DESC) as popularity_rank,
    RANK() OVER (ORDER BY ca.completion_rate DESC) as completion_rank,
    RANK() OVER (ORDER BY ca.total_enrollments DESC) as enrollment_rank
FROM course_analytics ca
ORDER BY ca.popularity_score DESC;

CREATE UNIQUE INDEX idx_course_popularity_course_id ON course_popularity_ranking(course_id);

-- User performance summary
CREATE MATERIALIZED VIEW user_performance_summary AS
SELECT 
    ua.user_id,
    ua.total_courses_enrolled,
    ua.total_courses_completed,
    ua.completion_rate,
    ua.average_score,
    ua.engagement_score,
    ua.streak_days,
    CASE 
        WHEN ua.completion_rate >= 80 AND ua.average_score >= 85 THEN 'high'
        WHEN ua.completion_rate >= 60 AND ua.average_score >= 70 THEN 'medium'
        ELSE 'low'
    END as performance_tier
FROM user_analytics ua
ORDER BY ua.engagement_score DESC;

CREATE UNIQUE INDEX idx_user_performance_user_id ON user_performance_summary(user_id);
CREATE INDEX idx_user_performance_tier ON user_performance_summary(performance_tier);

-- ============================================================================
-- Functions and Triggers
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_user_analytics_updated_at 
    BEFORE UPDATE ON user_analytics 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_course_analytics_updated_at 
    BEFORE UPDATE ON course_analytics 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assessment_analytics_updated_at 
    BEFORE UPDATE ON assessment_analytics 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_learning_progress_updated_at 
    BEFORE UPDATE ON learning_progress 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate completion rate
CREATE OR REPLACE FUNCTION calculate_completion_rate(completed INTEGER, enrolled INTEGER)
RETURNS DECIMAL(5,2) AS $$
BEGIN
    IF enrolled = 0 THEN
        RETURN 0;
    END IF;
    RETURN ROUND((completed::DECIMAL / enrolled::DECIMAL) * 100, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_analytics_views()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY daily_user_activity;
    REFRESH MATERIALIZED VIEW CONCURRENTLY course_popularity_ranking;
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_performance_summary;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Partitioning for Event Log (by month)
-- ============================================================================

-- Create partitioned table for event_log
CREATE TABLE event_log_partitioned (
    LIKE event_log INCLUDING ALL
) PARTITION BY RANGE (created_at);

-- Create initial partitions (current month and next 3 months)
CREATE TABLE event_log_y2024m06 PARTITION OF event_log_partitioned
    FOR VALUES FROM ('2024-06-01') TO ('2024-07-01');

CREATE TABLE event_log_y2024m07 PARTITION OF event_log_partitioned
    FOR VALUES FROM ('2024-07-01') TO ('2024-08-01');

CREATE TABLE event_log_y2024m08 PARTITION OF event_log_partitioned
    FOR VALUES FROM ('2024-08-01') TO ('2024-09-01');

CREATE TABLE event_log_y2024m09 PARTITION OF event_log_partitioned
    FOR VALUES FROM ('2024-09-01') TO ('2024-10-01');

-- ============================================================================
-- Data Retention Policies
-- ============================================================================

-- Function to clean up old data
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS VOID AS $$
BEGIN
    -- Delete old event logs (older than 90 days)
    DELETE FROM event_log 
    WHERE created_at < CURRENT_DATE - INTERVAL '90 days';
    
    -- Delete old dashboard metrics (older than 1 year)
    DELETE FROM dashboard_metrics 
    WHERE calculated_at < CURRENT_DATE - INTERVAL '1 year';
    
    -- Delete completed report jobs (older than 30 days)
    DELETE FROM report_jobs 
    WHERE status = 'completed' 
    AND completed_at < CURRENT_DATE - INTERVAL '30 days';
    
    -- Delete failed aggregation jobs (older than 7 days)
    DELETE FROM aggregation_jobs 
    WHERE status = 'failed' 
    AND created_at < CURRENT_DATE - INTERVAL '7 days';
    
    -- Vacuum tables after cleanup
    VACUUM ANALYZE event_log;
    VACUUM ANALYZE dashboard_metrics;
    VACUUM ANALYZE report_jobs;
    VACUUM ANALYZE aggregation_jobs;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Initial Data and Configuration
-- ============================================================================

-- Insert default dashboard metric types
INSERT INTO dashboard_metrics (metric_type, value, timeframe) VALUES
('total_users', 0, '30d'),
('active_users', 0, '30d'),
('total_courses', 0, '30d'),
('total_enrollments', 0, '30d'),
('completion_rate', 0, '30d'),
('average_score', 0, '30d'),
('learning_hours', 0, '30d'),
('engagement_rate', 0, '30d');

-- ============================================================================
-- Comments and Documentation
-- ============================================================================

COMMENT ON TABLE user_analytics IS 'Aggregated analytics data for individual users including learning progress, scores, and engagement metrics';
COMMENT ON TABLE course_analytics IS 'Aggregated analytics data for courses including enrollment trends, completion rates, and module performance';
COMMENT ON TABLE assessment_analytics IS 'Analytics data for assessments including attempt rates, scores, and question-level analysis';
COMMENT ON TABLE dashboard_metrics IS 'Pre-calculated metrics for dashboard display with historical comparison data';
COMMENT ON TABLE learning_progress IS 'Detailed learning progress tracking for users across courses and modules';
COMMENT ON TABLE report_jobs IS 'Asynchronous report generation job tracking with status and file information';
COMMENT ON TABLE event_log IS 'Audit log of all processed events for debugging and data lineage tracking';
COMMENT ON TABLE aggregation_jobs IS 'Batch processing job tracking for data aggregation and analytics calculations';

COMMENT ON MATERIALIZED VIEW daily_user_activity IS 'Daily aggregated user activity metrics for trend analysis';
COMMENT ON MATERIALIZED VIEW course_popularity_ranking IS 'Course ranking by popularity, completion rate, and enrollment metrics';
COMMENT ON MATERIALIZED VIEW user_performance_summary IS 'User performance categorization and ranking for personalization';

-- ============================================================================
-- Grants and Permissions
-- ============================================================================

-- Create analytics service user if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'analytics_service') THEN
        CREATE ROLE analytics_service WITH LOGIN PASSWORD 'analytics_password';
    END IF;
END
$$;

-- Grant necessary permissions
GRANT CONNECT ON DATABASE lms_analytics TO analytics_service;
GRANT USAGE ON SCHEMA public TO analytics_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO analytics_service;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO analytics_service;
GRANT SELECT ON ALL MATERIALIZED VIEWS IN SCHEMA public TO analytics_service;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO analytics_service;

-- Grant permissions for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO analytics_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO analytics_service;

-- ============================================================================
-- Performance Optimization
-- ============================================================================

-- Analyze all tables for query planner
ANALYZE user_analytics;
ANALYZE course_analytics;
ANALYZE assessment_analytics;
ANALYZE dashboard_metrics;
ANALYZE learning_progress;
ANALYZE report_jobs;
ANALYZE event_log;
ANALYZE aggregation_jobs;

-- Set table statistics targets for better query planning
ALTER TABLE user_analytics ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE course_analytics ALTER COLUMN course_id SET STATISTICS 1000;
ALTER TABLE learning_progress ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE learning_progress ALTER COLUMN course_id SET STATISTICS 1000;
ALTER TABLE event_log ALTER COLUMN event_type SET STATISTICS 1000;

-- Enable parallel query execution for large tables
ALTER TABLE event_log SET (parallel_workers = 4);
ALTER TABLE learning_progress SET (parallel_workers = 2);

COMMIT;
