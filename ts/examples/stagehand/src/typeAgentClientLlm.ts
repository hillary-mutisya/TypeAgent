// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ClientLLM } from "@browserbasehq/stagehand";
import { openai, type ChatModel } from "@typeagent/aiclient";
import type { MultimodalPromptContent, PromptSection } from "typechat";

type StagehandRequest = Parameters<ClientLLM["generate"]>[0];

export type TypeAgentClientLlmOptions = {
    modelName?: string;
    createModel?: () => ChatModel;
};

export function createTypeAgentClientLlm(
    options: TypeAgentClientLlmOptions = {},
): ClientLLM {
    const createModel =
        options.createModel ??
        (() =>
            openai.createChatModel(
                options.modelName ?? "GPT_5_MINI",
                { temperature: 1 },
                undefined,
                ["stagehand-prototype"],
            ));

    return {
        async generate(params) {
            if ("tools" in params && params.tools?.length) {
                throw new Error(
                    "Stagehand tool calls are not supported by the TypeAgent adapter",
                );
            }
            if (params.stopSequences?.length) {
                throw new Error(
                    "Stagehand stop sequences are not supported by the TypeAgent adapter",
                );
            }

            let usage: openai.CompletionUsageStats | undefined;
            const responseFormat = params.responseFormat;
            const jsonSchema =
                responseFormat?.type === "json_schema"
                    ? {
                          name: responseFormat.name,
                          ...(responseFormat.description === undefined
                              ? {}
                              : {
                                    description: responseFormat.description,
                                }),
                          strict: true as const,
                          schema: responseFormat.schema as Record<
                              string,
                              unknown
                          >,
                      }
                    : undefined;

            const response = await createModel().complete(
                toPromptSections(params),
                (value) => {
                    usage = value;
                },
                jsonSchema,
            );
            if (response.success === false) {
                throw new Error(response.message);
            }

            const common = {
                role: "assistant" as const,
                content: { type: "text" as const, text: response.data },
                ...(usage === undefined
                    ? {}
                    : {
                          usage: {
                              inputTokens: usage.prompt_tokens,
                              outputTokens: usage.completion_tokens,
                              totalTokens: usage.total_tokens,
                              ...(usage.cached_tokens === undefined
                                  ? {}
                                  : {
                                        cachedInputTokens: usage.cached_tokens,
                                    }),
                          },
                      }),
            };

            if (responseFormat?.type === "json_schema") {
                return {
                    ...common,
                    outputFormat: "json_schema",
                    structuredContent: JSON.parse(response.data),
                };
            }
            return { ...common, outputFormat: "text" };
        },
    };
}

function toPromptSections(params: StagehandRequest): PromptSection[] {
    const prompt: PromptSection[] = [];
    if (params.systemPrompt) {
        prompt.push({ role: "system", content: params.systemPrompt });
    }

    for (const message of params.messages) {
        const blocks = Array.isArray(message.content)
            ? message.content
            : [message.content];
        const content: MultimodalPromptContent[] = blocks.map((block) => {
            if (block.type === "text") {
                return { type: "text", text: block.text };
            }
            if (block.type === "image") {
                return {
                    type: "image_url",
                    image_url: {
                        url: `data:${block.mimeType};base64,${block.data}`,
                    },
                };
            }
            throw new Error(
                `Unsupported Stagehand content block: ${block.type}`,
            );
        });
        prompt.push({ role: message.role, content });
    }
    return prompt;
}
