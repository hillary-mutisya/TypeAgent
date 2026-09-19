// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type {
    ChatModel,
    CompletionJsonSchema,
    CompleteUsageStatsCallback,
} from "@typeagent/aiclient";
import type { PromptSection } from "typechat";

import { createTypeAgentClientLlm } from "../src/typeAgentClientLlm.js";

describe("createTypeAgentClientLlm", () => {
    it("maps text, images, JSON schema, and usage", async () => {
        let capturedPrompt: string | PromptSection[] | undefined;
        let capturedSchema: CompletionJsonSchema | undefined;
        const model = {
            async complete(
                prompt: string | PromptSection[],
                usageCallback?: CompleteUsageStatsCallback,
                jsonSchema?: CompletionJsonSchema,
            ) {
                capturedPrompt = prompt;
                capturedSchema = jsonSchema;
                usageCallback?.({
                    prompt_tokens: 10,
                    completion_tokens: 4,
                    total_tokens: 14,
                    cached_tokens: 3,
                });
                return {
                    success: true as const,
                    data: '{"value":"ok"}',
                };
            },
        } as unknown as ChatModel;
        const client = createTypeAgentClientLlm({ createModel: () => model });

        const result = await client.generate({
            systemPrompt: "Use the page evidence.",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Inspect this image" },
                        {
                            type: "image",
                            data: "aGVsbG8=",
                            mimeType: "image/png",
                        },
                    ],
                },
            ],
            responseFormat: {
                type: "json_schema",
                name: "answer",
                schema: {
                    type: "object",
                    properties: { value: { type: "string" } },
                    required: ["value"],
                },
            },
        });

        expect(capturedPrompt).toEqual([
            { role: "system", content: "Use the page evidence." },
            {
                role: "user",
                content: [
                    { type: "text", text: "Inspect this image" },
                    {
                        type: "image_url",
                        image_url: {
                            url: "data:image/png;base64,aGVsbG8=",
                        },
                    },
                ],
            },
        ]);
        expect(capturedSchema).toMatchObject({
            name: "answer",
            strict: true,
        });
        expect(result).toEqual({
            role: "assistant",
            content: { type: "text", text: '{"value":"ok"}' },
            outputFormat: "json_schema",
            structuredContent: { value: "ok" },
            usage: {
                inputTokens: 10,
                outputTokens: 4,
                totalTokens: 14,
                cachedInputTokens: 3,
            },
        });
    });

    it("rejects unsupported tool requests", async () => {
        const client = createTypeAgentClientLlm({
            createModel: () => ({}) as ChatModel,
        });

        await expect(
            client.generate({
                messages: [],
                tools: [
                    {
                        name: "lookup",
                        inputSchema: { type: "object" },
                    },
                ],
            }),
        ).rejects.toThrow("tool calls are not supported");
    });
});
