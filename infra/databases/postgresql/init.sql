-- LMS Database Initialization Script
-- This script sets up the database schemas and basic configuration

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create service-specific schemas
CREATE SCHEMA IF NOT EXISTS user_service;
CREATE SCHEMA IF NOT EXISTS course_service;
CREATE SCHEMA IF NOT EXISTS auth_service;
CREATE SCHEMA IF NOT EXISTS analytics_service;
CREATE SCHEMA IF NOT EXISTS file_service;
CREATE SCHEMA IF NOT EXISTS search_service;
CREATE SCHEMA IF NOT EXISTS notification_service;

-- Create shared schemas
CREATE SCHEMA IF NOT EXISTS shared_events;
CREATE SCHEMA IF NOT EXISTS shared_audit;

-- Set default privileges for application user
GRANT USAGE ON SCHEMA user_service TO lms_user;
GRANT USAGE ON SCHEMA course_service TO lms_user;
GRANT USAGE ON SCHEMA auth_service TO lms_user;
GRANT USAGE ON SCHEMA analytics_service TO lms_user;
GRANT USAGE ON SCHEMA file_service TO lms_user;
GRANT USAGE ON SCHEMA search_service TO lms_user;
GRANT USAGE ON SCHEMA notification_service TO lms_user;
GRANT USAGE ON SCHEMA shared_events TO lms_user;
GRANT USAGE ON SCHEMA shared_audit TO lms_user;

-- Grant table creation privileges
GRANT CREATE ON SCHEMA user_service TO lms_user;
GRANT CREATE ON SCHEMA course_service TO lms_user;
GRANT CREATE ON SCHEMA auth_service TO lms_user;
GRANT CREATE ON SCHEMA analytics_service TO lms_user;
GRANT CREATE ON SCHEMA file_service TO lms_user;
GRANT CREATE ON SCHEMA search_service TO lms_user;
GRANT CREATE ON SCHEMA notification_service TO lms_user;
GRANT CREATE ON SCHEMA shared_events TO lms_user;
GRANT CREATE ON SCHEMA shared_audit TO lms_user;

-- Create shared audit table
CREATE TABLE IF NOT EXISTS shared_audit.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_name VARCHAR(50) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    operation VARCHAR(10) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    user_id UUID,
    session_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes on audit table
CREATE INDEX IF NOT EXISTS idx_audit_logs_service_name ON shared_audit.audit_logs(service_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON shared_audit.audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON shared_audit.audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON shared_audit.audit_logs(user_id);

-- Create shared events table for inter-service communication
CREATE TABLE IF NOT EXISTS shared_events.event_store (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aggregate_id UUID NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_version INTEGER NOT NULL DEFAULT 1,
    event_data JSONB NOT NULL,
    metadata JSONB,
    occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    sequence_number BIGSERIAL
);

-- Create indexes on event store
CREATE INDEX IF NOT EXISTS idx_event_store_aggregate_id ON shared_events.event_store(aggregate_id);
CREATE INDEX IF NOT EXISTS idx_event_store_aggregate_type ON shared_events.event_store(aggregate_type);
CREATE INDEX IF NOT EXISTS idx_event_store_event_type ON shared_events.event_store(event_type);
CREATE INDEX IF NOT EXISTS idx_event_store_occurred_at ON shared_events.event_store(occurred_at);
CREATE INDEX IF NOT EXISTS idx_event_store_sequence_number ON shared_events.event_store(sequence_number);

-- Create event snapshots table
CREATE TABLE IF NOT EXISTS shared_events.event_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aggregate_id UUID NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,
    snapshot_data JSONB NOT NULL,
    version INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(aggregate_id, aggregate_type)
);

-- Create basic user roles and permissions tables in auth schema
CREATE TABLE IF NOT EXISTS auth_service.roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    is_system_role BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_service.permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    resource VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(resource, action)
);

CREATE TABLE IF NOT EXISTS auth_service.role_permissions (
    role_id UUID REFERENCES auth_service.roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES auth_service.permissions(id) ON DELETE CASCADE,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    granted_by UUID,
    PRIMARY KEY (role_id, permission_id)
);

-- Insert default roles
INSERT INTO auth_service.roles (name, description, is_system_role) 
VALUES 
    ('super_admin', 'Super Administrator with full access', TRUE),
    ('admin', 'Administrator with management access', TRUE),
    ('instructor', 'Course instructor with teaching capabilities', TRUE),
    ('student', 'Student with learning access', TRUE),
    ('guest', 'Guest user with limited access', TRUE)
ON CONFLICT (name) DO NOTHING;

-- Insert basic permissions
INSERT INTO auth_service.permissions (name, resource, action, description)
VALUES
    ('users.create', 'users', 'create', 'Create new users'),
    ('users.read', 'users', 'read', 'View user information'),
    ('users.update', 'users', 'update', 'Update user information'),
    ('users.delete', 'users', 'delete', 'Delete users'),
    ('courses.create', 'courses', 'create', 'Create new courses'),
    ('courses.read', 'courses', 'read', 'View course information'),
    ('courses.update', 'courses', 'update', 'Update course information'),
    ('courses.delete', 'courses', 'delete', 'Delete courses'),
    ('files.upload', 'files', 'upload', 'Upload files'),
    ('files.download', 'files', 'download', 'Download files'),
    ('analytics.read', 'analytics', 'read', 'View analytics data'),
    ('system.admin', 'system', 'admin', 'System administration access')
ON CONFLICT (resource, action) DO NOTHING;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create function for audit logging
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO shared_audit.audit_logs(service_name, table_name, operation, old_values)
        VALUES(TG_ARGV[0], TG_TABLE_NAME, TG_OP, row_to_json(OLD));
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO shared_audit.audit_logs(service_name, table_name, operation, old_values, new_values)
        VALUES(TG_ARGV[0], TG_TABLE_NAME, TG_OP, row_to_json(OLD), row_to_json(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO shared_audit.audit_logs(service_name, table_name, operation, new_values)
        VALUES(TG_ARGV[0], TG_TABLE_NAME, TG_OP, row_to_json(NEW));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION update_updated_at_column() TO lms_user;
GRANT EXECUTE ON FUNCTION audit_trigger_function() TO lms_user;

-- Set search path for convenience
ALTER DATABASE lms_db SET search_path TO public, user_service, course_service, auth_service, shared_events, shared_audit;

-- Configure pg_stat_statements
SELECT pg_stat_statements_reset();

COMMIT;
