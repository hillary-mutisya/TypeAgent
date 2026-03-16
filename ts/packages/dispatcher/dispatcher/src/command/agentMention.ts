// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AppAgentManager } from "../context/appAgentManager.js";

export type AgentMention = {
    agentName: string;
    cleanedInput: string;
};

/**
 * Extract the first @-mention of an active agent from input text.
 * Returns the agent name and the input with the @-mention cleaned up.
 *
 * Cleaning rules:
 * - If the @-mention is at the start followed by punctuation (comma, colon),
 *   the mention and punctuation are removed: "@list, find items" → "find items"
 * - Otherwise, only the @ is stripped, keeping the agent name as a word:
 *   "use the @player to play music" → "use the player to play music"
 */
export function extractAgentMention(
    input: string,
    agents: AppAgentManager,
): AgentMention | undefined {
    const mentionPattern = /@(\w+)/g;
    let match;
    while ((match = mentionPattern.exec(input)) !== null) {
        const name = match[1];
        if (agents.isAppAgentName(name)) {
            const before = input.slice(0, match.index);
            const after = input.slice(match.index + match[0].length);

            let cleanedInput: string;
            if (before.trim() === "") {
                // Mention is at the start — strip mention and leading punctuation/whitespace
                cleanedInput = after.replace(/^[\s,;:]+/, "");
            } else {
                // Mention is mid-sentence — replace @name with just name
                cleanedInput = before + name + after;
            }

            return {
                agentName: name,
                cleanedInput: cleanedInput.trim(),
            };
        }
    }
    return undefined;
}
