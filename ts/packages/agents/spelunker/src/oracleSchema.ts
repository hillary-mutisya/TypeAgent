// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Identifier for a chunk of code.
export type ChunkId = string;

// Answer to the original question.
export type OracleSpecs = {
    question: string; // Original question (e.g. "How can items be related")
    answer: string; // Answer to the question. It is readable and complete, with suitable formatting (line breaks, bullet points etc)

    references: ChunkId[]; // Up to 30 unique chunk ids that support this answer
    confidence: number; // Your confidence in the answer, between 0 and 1
    message?: string; // Optional message to the user (e.g. for low confidence); might request more input
};
