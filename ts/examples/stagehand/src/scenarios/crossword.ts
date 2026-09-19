// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { Page, Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v4";

const Crossword = z.object({
    title: z.string().optional(),
    clues: z.array(
        z.object({
            number: z.string(),
            direction: z.enum(["across", "down"]),
            text: z.string(),
            currentAnswer: z.string().optional(),
        }),
    ),
});

const ClueState = z.object({
    clue: z.string(),
    currentAnswer: z.string().optional(),
});

export async function inspectCrossword(stagehand: Stagehand, page: Page) {
    return stagehand.extract(
        "Extract every visible crossword clue, including its number and direction. Preserve clue text exactly.",
        Crossword,
        { page },
    );
}

export async function enterCrosswordAnswer(
    stagehand: Stagehand,
    page: Page,
    clue: string,
    answer: string,
) {
    const observation = await stagehand.observe(
        `Find the crossword clue or grid cell for ${JSON.stringify(clue)}`,
        { page },
    );
    const target = observation.data.find(
        (action) => action.method === "click" || action.method === undefined,
    );
    if (!target) {
        throw new Error(`Stagehand did not find crossword clue: ${clue}`);
    }

    await page.locator(target.selector).click();
    for (const character of answer.toUpperCase()) {
        if (/^[A-Z]$/.test(character)) {
            await page.keyPress(character);
        }
    }

    const verification = await stagehand.extract(
        `Read the current answer for crossword clue ${JSON.stringify(clue)}`,
        ClueState,
        { page },
    );
    return {
        selectedAction: target,
        observationMetadata: observation.metadata,
        verification,
    };
}
