// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeRunArtifact(
    scenario: string,
    value: unknown,
): Promise<string> {
    const artifactDirectory = path.resolve("artifacts");
    await mkdir(artifactDirectory, { recursive: true });
    const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
    const artifactPath = path.join(
        artifactDirectory,
        `${timestamp}-${scenario}.json`,
    );
    await writeFile(
        artifactPath,
        `${JSON.stringify(value, null, 2)}\n`,
        "utf8",
    );
    return artifactPath;
}
