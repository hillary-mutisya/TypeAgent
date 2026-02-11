// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Type definitions for workflow plans
 */

export interface WorkflowPlan {
    planId: string;
    description: string;
    intent: string; // Classifies plan type for matching (e.g., "web_automation", "email_task")
    createdAt: string;
    version: number;

    // Plan structure
    steps: PlanStep[];
    variables: Variable[];

    // Metadata
    source?: {
        traceId: string;
        originalRequest: string;
        generatedFrom: "trace" | "manual";
    };

    // Usage tracking
    usage?: {
        successCount: number;
        failureCount: number;
        lastUsed: string;
        avgDuration: number;
    };

    // User approval tracking
    approval?: PlanApproval;
}

export interface PlanApproval {
    status: "auto" | "pending_review" | "reviewed" | "approved";

    // Review tracking
    reviewedBy?: string; // User identifier
    reviewedAt?: string; // ISO timestamp
    approvedAt?: string; // ISO timestamp

    // User feedback
    userComments?: string;

    // Review history
    reviewHistory?: Array<{
        action: "reviewed" | "approved" | "rejected";
        timestamp: string;
        comments?: string;
    }>;
}

export interface PlanStep {
    stepId: string;
    stepNumber: number;
    objective: string;
    description: string;

    // Action to execute
    action: {
        schemaName: string; // "browser", "calendar", "email"
        actionName: string;
        parameterTemplate: Record<string, any>; // Mix of fixed values and {{variables}}
    };

    // Execution control
    preconditions: Precondition[];
    outputVariables: OutputVariable[];
    retryPolicy?: {
        maxRetries: number;
        backoffMs: number;
    };

    // Optimistic execution config
    skipByDefault?: boolean; // Don't run by default (fallback-only)
    executionMode?: "normal" | "fallback"; // Execution mode
    optimisticExecution?: {
        enabled: boolean; // Try without dependencies first
        skipDependencies?: string[]; // Dependencies to skip optimistically
        fallbackOnError?: {
            errorTypes: string[]; // Error types that trigger fallback
            fallbackSteps: string[]; // Steps to run on failure
            retryAfterFallback: boolean; // Retry this step after fallback
        };
    };

    // Iteration config (for loops)
    iterationConfig?: {
        iterateOver: string; // Variable to iterate over
        itemVariable: string; // Variable name for current item
    };
}

export interface Precondition {
    type: "variable_exists" | "step_completed" | "custom";
    description: string;
    expression: string;
    required: boolean;

    // Optimistic mode support
    optimistic?: {
        skipInOptimisticMode: boolean; // Skip this precondition in optimistic run
        requiredOnRetry: boolean; // Enforce on retry after fallback
    };
}

export interface OutputVariable {
    name: string;
    source: "action_result" | "user_input" | "computation";
    extractionPath?: string; // JSONPath if from action result
    computation?: string; // Expression if computed
}

export interface Variable {
    name: string;
    type: "string" | "number" | "boolean" | "object" | "array";
    description: string;
    scope: "plan" | "step";
    defaultValue?: any;
}

export interface PlanIndex {
    plans: PlanIndexEntry[];
}

export interface PlanIndexEntry {
    planId: string;
    intent: string;
    description: string;
    keywords: string[];
    successRate: number;
    lastUsed: string;
    executionCount: number;
    approvalStatus?: "auto" | "pending_review" | "reviewed" | "approved";
}

export interface PlanGenerationOptions {
    detailLevel?: "minimal" | "standard" | "detailed";
    includeControlFlow?: boolean;
    maxSteps?: number;
}
