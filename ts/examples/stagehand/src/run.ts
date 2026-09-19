#!/usr/bin/env node
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { writeRunArtifact } from "./artifacts.js";
import { parseCliOptions, usage } from "./cli.js";
import {
    addProductToCart,
    inspectProductResults,
    searchForProduct,
} from "./scenarios/commerce.js";
import {
    enterCrosswordAnswer,
    inspectCrossword,
} from "./scenarios/crossword.js";
import { createPrototypeSession } from "./session.js";

async function main(): Promise<void> {
    const options = parseCliOptions(process.argv.slice(2));
    const startedAt = new Date();
    const session = await createPrototypeSession({
        headless: options.headless,
        ...(options.model === undefined ? {} : { modelName: options.model }),
        ...(options.userDataDir === undefined
            ? {}
            : { userDataDir: options.userDataDir }),
    });

    try {
        await session.page.goto(options.url, {
            waitUntil: "domcontentloaded",
        });
        const result = await runScenario(options, session);
        const snapshot = await session.page.snapshot({ includeIframes: true });
        const finalUrl = await session.page.url();
        const artifactPath = await writeRunArtifact(options.command, {
            scenario: options.command,
            startedAt: startedAt.toISOString(),
            durationMs: Date.now() - startedAt.getTime(),
            initialUrl: options.url,
            finalUrl,
            result,
            snapshot,
        });
        console.log(
            JSON.stringify({ artifactPath, finalUrl, result }, null, 2),
        );
    } finally {
        await session.close();
    }
}

async function runScenario(
    options: ReturnType<typeof parseCliOptions>,
    session: Awaited<ReturnType<typeof createPrototypeSession>>,
): Promise<unknown> {
    switch (options.command) {
        case "commerce-search": {
            const search = await searchForProduct(
                session.stagehand,
                session.page,
                requireValue(options.query, "query"),
            );
            const products = await inspectProductResults(
                session.stagehand,
                session.page,
            );
            return { search, products };
        }
        case "commerce-inspect":
            return inspectProductResults(session.stagehand, session.page);
        case "commerce-add-to-cart":
            return addProductToCart(
                session.stagehand,
                session.page,
                requireValue(options.product, "product"),
            );
        case "crossword-inspect":
            return inspectCrossword(session.stagehand, session.page);
        case "crossword-enter":
            return enterCrosswordAnswer(
                session.stagehand,
                session.page,
                requireValue(options.clue, "clue"),
                requireValue(options.answer, "answer"),
            );
    }
}

function requireValue(value: string | undefined, name: string): string {
    if (value === undefined) {
        throw new Error(`Missing required ${name}`);
    }
    return value;
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage);
    process.exitCode = 1;
});
