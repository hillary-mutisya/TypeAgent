// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { parseCliOptions } from "../src/cli.js";

describe("parseCliOptions", () => {
    it("parses a commerce search", () => {
        expect(
            parseCliOptions([
                "commerce-search",
                "--url",
                "https://example.com",
                "--query",
                "running shoes",
                "--headless",
            ]),
        ).toEqual({
            command: "commerce-search",
            url: "https://example.com",
            query: "running shoes",
            headless: true,
        });
    });

    it("requires command-specific values", () => {
        expect(() =>
            parseCliOptions([
                "crossword-enter",
                "--url",
                "https://example.com",
                "--clue",
                "1 Across",
            ]),
        ).toThrow("--answer");
    });

    it("rejects non-web URLs", () => {
        expect(() =>
            parseCliOptions([
                "commerce-inspect",
                "--url",
                "file:///tmp/page.html",
            ]),
        ).toThrow("http or https");
    });
});
