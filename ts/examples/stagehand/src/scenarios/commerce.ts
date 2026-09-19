// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { Action, Page, Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v4";

const ProductResults = z.object({
    products: z.array(
        z.object({
            name: z.string(),
            price: z.string().optional(),
            availability: z.string().optional(),
        }),
    ),
});

const CartState = z.object({
    itemCount: z.number().optional(),
    productNames: z.array(z.string()),
    subtotal: z.string().optional(),
});

export async function searchForProduct(
    stagehand: Stagehand,
    page: Page,
    productName: string,
) {
    const observation = await stagehand.observe(
        "Find the primary product search textbox or search input",
        { page },
    );
    const searchInput = observation.data.find(isTextInputAction);
    if (!searchInput) {
        throw new Error("Stagehand did not find a product search input");
    }

    await page.locator(searchInput.selector).fill(productName);
    await page.keyPress("Enter");
    await page.waitForLoadState("domcontentloaded");

    return {
        query: productName,
        selectedAction: searchInput,
        observationMetadata: observation.metadata,
    };
}

export async function inspectProductResults(stagehand: Stagehand, page: Page) {
    const extraction = await stagehand.extract(
        "Extract visible product search results. Exclude navigation, ads, and recommendations.",
        ProductResults,
        { page },
    );
    return extraction;
}

export async function addProductToCart(
    stagehand: Stagehand,
    page: Page,
    productName: string,
) {
    const action = await stagehand.act(
        `Add the visible product named ${JSON.stringify(productName)} to the cart. Do not proceed to checkout.`,
        { page },
    );
    if (!action.data.success) {
        throw new Error(`Stagehand could not add the product: ${productName}`);
    }

    const cart = await stagehand.extract(
        "Extract the current cart state without navigating to checkout.",
        CartState,
        { page },
    );
    return { action, cart };
}

function isTextInputAction(action: Action): boolean {
    return action.method === "fill" || action.method === "type";
}
