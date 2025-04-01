// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as fs from "fs";
import * as readline from "readline";
import path from "path";
import { homedir } from "os";

// Define interfaces for our data structures
interface Triple {
    subject: string;
    predicate: string;
    object: string;
    graph?: string;
    isObjectBlankNode?: boolean;
}

interface Restaurant {
    [key: string]: any;
}

/**
 * Escapes special characters in URLs
 * @param url The URL to escape
 * @returns The escaped URL
 */
function escapeUrl(url: string): string {
    return url
        .replace(/\{/g, "%7B")
        .replace(/\}/g, "%7D")
        .replace(/\s/g, "%20")
        .replace(/"/g, "%22")
        .replace(/\\/g, "%5C");
}

/**
 * Checks if a string is a blank node identifier (handles various formats)
 * @param str The string to check
 * @returns Whether the string is a blank node identifier
 */
function isBlankNode(str: string): boolean {
    // Handle different blank node formats
    return str.startsWith("_:") || str.match(/^_:[a-zA-Z0-9]+/) !== null;
}

/**
 * Normalizes a blank node ID to a consistent format
 * @param id The blank node ID
 * @returns The normalized ID
 */
function normalizeBlankNodeId(id: string): string {
    // Just return the original ID since we'll use it as a lookup key
    return id;
}

/**
 * Unescapes characters in a string value from N-Quads
 * @param value The value to unescape
 * @returns The unescaped value
 */
function unescapeValue(value: string): string {
    // If it's a literal value enclosed in quotes
    if (
        value.startsWith('"') &&
        (value.endsWith('"') || value.includes('"@') || value.includes('"^^'))
    ) {
        // Extract the actual string content and language tag if present
        let content: string;
        let lang = "";

        if (value.includes('"@')) {
            const parts = value.split('"@');
            content = parts[0].substring(1);
            lang = parts[1];
        } else if (value.includes('"^^')) {
            const parts = value.split('"^^');
            content = parts[0].substring(1);
        } else {
            content = value.substring(1, value.length - 1);
        }

        const unescaped = content
            .replace(/\\"/g, '"')
            .replace(/\\n/g, "\n")
            .replace(/\\t/g, "\t")
            .replace(/\\\\/g, "\\");

        return lang ? `${unescaped} (${lang})` : unescaped;
    }

    // If it's a URL
    if (value.startsWith("<") && value.endsWith(">")) {
        return value.substring(1, value.length - 1);
    }

    // If it's a blank node, return as is
    return value;
}

/**
 * Parses an N-Quad line into a Triple object
 * @param line A line from an N-Quad file
 * @returns A Triple object or null if the line is invalid
 */
function parseNQuadLine(line: string): Triple | null {
    // Skip comments and empty lines
    if (line.trim().length === 0 || line.trim().startsWith("#")) {
        return null;
    }

    // More robust regex pattern to match various N-Quad formats
    const regex =
        /^(?:<([^>]*)>|(_:[^\s]+))\s+<([^>]*)>\s+(?:<([^>]*)>|"([^"\\]*(?:\\.[^"\\]*)*)"(?:@([a-zA-Z-]+)|(?:\^\^<([^>]+)>)?)?|(_:[^\s]+))\s+(?:<([^>]*)>)?\s*\.$/;

    const match = line.match(regex);

    if (!match) {
        // Try alternative parsing for complex cases
        return parseNQuadLineManually(line);
    }

    const subjectUri = match[1];
    const subjectBlankNode = match[2];
    const predicate = match[3];
    const objectUri = match[4];
    const objectLiteral = match[5];
    const objectLang = match[6];
    const objectDatatype = match[7];
    const objectBlankNode = match[8];
    const graph = match[9];

    const subject = subjectUri || subjectBlankNode;
    let object = "";
    let isObjectBlankNode = false;

    if (objectUri) {
        object = objectUri;
    } else if (objectBlankNode) {
        object = objectBlankNode;
        isObjectBlankNode = true;
    } else if (objectLiteral !== undefined) {
        // Format literal with language or datatype if present
        const lang = objectLang ? `@${objectLang}` : "";
        const datatype = objectDatatype ? `^^<${objectDatatype}>` : "";
        object = `"${objectLiteral}"${lang}${datatype}`;
    }

    return {
        subject,
        predicate,
        object,
        graph,
        isObjectBlankNode,
    };
}

/**
 * Manual parsing for N-Quad lines that don't match the regex
 * @param line A line from an N-Quad file
 * @returns A Triple object or null if the line is invalid
 */
function parseNQuadLineManually(line: string): Triple | null {
    // Remove trailing dot and split by whitespace
    const trimmedLine = line.trim();
    if (!trimmedLine.endsWith(" .") && !trimmedLine.endsWith(".")) {
        console.error(`Invalid N-Quad line (no trailing dot): ${line}`);
        return null;
    }

    const withoutDot = trimmedLine.substring(
        0,
        trimmedLine.length - (trimmedLine.endsWith(" .") ? 2 : 1),
    );

    // Split by whitespace, but respect quotes and URIs
    const parts: string[] = [];
    let current = "";
    let inQuotes = false;
    let inUri = false;
    let escaped = false;

    for (let i = 0; i < withoutDot.length; i++) {
        const char = withoutDot[i];

        if (char === '"' && !escaped) {
            inQuotes = !inQuotes;
            current += char;
        } else if (char === "<" && !inQuotes) {
            inUri = true;
            current += char;
        } else if (char === ">" && inUri) {
            inUri = false;
            current += char;
        } else if (char === "\\" && inQuotes) {
            escaped = true;
            current += char;
        } else if (char === " " && !inQuotes && !inUri) {
            if (current) {
                parts.push(current);
                current = "";
            }
        } else {
            escaped = false;
            current += char;
        }
    }

    if (current) {
        parts.push(current);
    }

    // Need at least subject, predicate, and object
    if (parts.length < 3) {
        console.error(`Invalid N-Quad line (not enough parts): ${line}`);
        return null;
    }

    const subject = parts[0];
    const predicate = parts[1];
    const object = parts[2];
    const graph = parts.length > 3 ? parts[3] : undefined;

    // Check if subject is a blank node
    const isSubjectBlankNode = isBlankNode(subject);

    // Check if object is a blank node
    const isObjectBlankNode = isBlankNode(object);

    // Clean up URI brackets
    const cleanSubject = isSubjectBlankNode
        ? subject
        : subject.replace(/[<>]/g, "");
    const cleanPredicate = predicate.replace(/[<>]/g, "");
    const cleanObject = isObjectBlankNode
        ? object
        : object.startsWith("<")
          ? object.replace(/[<>]/g, "")
          : object;
    const cleanGraph = graph ? graph.replace(/[<>]/g, "") : undefined;

    return {
        subject: cleanSubject,
        predicate: cleanPredicate,
        object: cleanObject,
        graph: cleanGraph!,
        isObjectBlankNode,
    };
}

/**
 * Extracts the local name from a URI
 * @param uri The URI
 * @returns The local name
 */
function getLocalName(uri: string): string {
    const lastSlashIndex = uri.lastIndexOf("/");
    const lastHashIndex = uri.lastIndexOf("#");
    const lastSeparatorIndex = Math.max(lastSlashIndex, lastHashIndex);

    if (lastSeparatorIndex !== -1) {
        return uri.substring(lastSeparatorIndex + 1);
    }

    return uri;
}

/**
 * Processes triples with blank nodes into a nested structure
 * @param triples Array of Triple objects
 * @returns Processed entities
 */
function processBlankNodes(triples: Triple[]): { [id: string]: any } {
    const blankNodeMap: { [id: string]: any } = {};
    const result: { [id: string]: any } = {};

    console.log(`Total triples: ${triples.length}`);

    // Count blank nodes for debugging
    const blankNodeSubjects = new Set<string>();
    const blankNodeObjects = new Set<string>();

    triples.forEach((triple) => {
        if (!triple) return;

        if (isBlankNode(triple.subject)) {
            blankNodeSubjects.add(triple.subject);
        }

        if (triple.isObjectBlankNode) {
            blankNodeObjects.add(triple.object);
        }
    });

    console.log(`Found ${blankNodeSubjects.size} unique blank node subjects`);
    console.log(`Found ${blankNodeObjects.size} unique blank node objects`);

    // First, identify all blank nodes and their properties
    triples.forEach((triple) => {
        if (!triple) return;

        const { subject, predicate, object, isObjectBlankNode } = triple;

        // Process blank nodes as subjects
        if (isBlankNode(subject)) {
            const normSubject = normalizeBlankNodeId(subject);

            // Initialize if this blank node hasn't been seen before
            if (!blankNodeMap[normSubject]) {
                blankNodeMap[normSubject] = {};
            }

            // Get property name
            const propertyName = getLocalName(predicate);

            // Handle object value
            let value: any;

            if (isObjectBlankNode) {
                // If object is a blank node, we'll reference it later
                value = { _ref: normalizeBlankNodeId(object) };
            } else if (object.startsWith("http")) {
                // URI reference
                if (predicate.includes("type")) {
                    // For type predicates, just store the type
                    value = getLocalName(object);
                } else {
                    value = object;
                }
            } else {
                // Literal value
                value = unescapeValue(object);
            }

            // Add to blank node properties
            if (blankNodeMap[normSubject][propertyName]) {
                if (!Array.isArray(blankNodeMap[normSubject][propertyName])) {
                    blankNodeMap[normSubject][propertyName] = [
                        blankNodeMap[normSubject][propertyName],
                    ];
                }
                blankNodeMap[normSubject][propertyName].push(value);
            } else {
                blankNodeMap[normSubject][propertyName] = value;
            }
        }
        // Process non-blank nodes as subjects (these are our top-level entities)
        else {
            if (!result[subject]) {
                result[subject] = {};
            }

            const propertyName = getLocalName(predicate);

            let value: any;

            if (isObjectBlankNode) {
                // If object is a blank node, we'll reference it later
                value = { _ref: normalizeBlankNodeId(object) };
            } else if (object.startsWith("http")) {
                // URI reference
                if (predicate.includes("type")) {
                    // For type predicates, just store the type
                    value = getLocalName(object);
                } else {
                    value = object;
                }
            } else {
                // Literal value
                value = unescapeValue(object);
            }

            // Add to entity properties
            if (result[subject][propertyName]) {
                if (!Array.isArray(result[subject][propertyName])) {
                    result[subject][propertyName] = [
                        result[subject][propertyName],
                    ];
                }
                result[subject][propertyName].push(value);
            } else {
                result[subject][propertyName] = value;
            }
        }
    });

    // Second, resolve blank node references recursively
    function resolveBlankNode(obj: any): any {
        if (!obj) return obj;

        // Base case: not an object
        if (typeof obj !== "object") return obj;

        // Handle arrays
        if (Array.isArray(obj)) {
            return obj.map((item) => resolveBlankNode(item));
        }

        // Handle blank node reference
        if (obj._ref && typeof obj._ref === "string" && isBlankNode(obj._ref)) {
            const normRef = normalizeBlankNodeId(obj._ref);
            return resolveBlankNode(blankNodeMap[normRef]);
        }

        // Handle regular object
        const result: any = {};
        for (const key in obj) {
            result[key] = resolveBlankNode(obj[key]);
        }
        return result;
    }

    // Resolve all references in the result
    for (const key in result) {
        result[key] = resolveBlankNode(result[key]);
    }

    return result;
}

/**
 * Extracts restaurants from the processed data
 * @param entities Object containing all entities
 * @param triples Original triples array for additional lookups
 * @returns Object containing only restaurant entities
 */
function extractRestaurants(
    entities: { [id: string]: any },
    triples: Triple[],
): { [id: string]: Restaurant } {
    const restaurants: { [id: string]: Restaurant } = {};
    const restaurantByBlankNode: { [blankNodeId: string]: string } = {};

    // First, identify all blank nodes that are restaurants
    triples.forEach((triple) => {
        if (!triple) return;

        if (
            isBlankNode(triple.subject) &&
            triple.predicate.includes("type") &&
            (triple.object.includes("Restaurant") ||
                triple.object.includes("FoodEstablishment"))
        ) {
            // Track that this blank node is a restaurant
            restaurantByBlankNode[normalizeBlankNodeId(triple.subject)] =
                triple.subject;
        }
    });

    console.log(
        `Found ${Object.keys(restaurantByBlankNode).length} restaurant blank nodes`,
    );

    // Find the parent entity of restaurant blank nodes
    triples.forEach((triple) => {
        if (!triple) return;

        if (
            triple.isObjectBlankNode &&
            restaurantByBlankNode[normalizeBlankNodeId(triple.object)]
        ) {
            // This triple connects a parent entity to a restaurant blank node
            const parentId = triple.subject;
            const restaurantBlankNode = triple.object;
            const parentProperty = getLocalName(triple.predicate);

            if (!isBlankNode(parentId)) {
                // Only process if the parent is not itself a blank node (we want top-level entities)
                if (!restaurants[parentId]) {
                    restaurants[parentId] = {
                        "@id": parentId,
                        "@type": "Restaurant",
                        "@source": "parent",
                        [parentProperty]: {},
                    };
                }

                // Find all triples related to this restaurant blank node
                const restaurantTriples = triples.filter(
                    (t) =>
                        t.subject === restaurantBlankNode ||
                        (t.isObjectBlankNode &&
                            t.object === restaurantBlankNode),
                );

                // Add restaurant data to the parent entity
                restaurantTriples.forEach((rt) => {
                    if (rt.subject === restaurantBlankNode) {
                        const propName = getLocalName(rt.predicate);
                        let value: any;

                        if (rt.isObjectBlankNode) {
                            // Handle nested blank nodes
                            const nestedTriples = triples.filter(
                                (nt) => nt.subject === rt.object,
                            );
                            value = {};

                            nestedTriples.forEach((nt) => {
                                const nestedPropName = getLocalName(
                                    nt.predicate,
                                );
                                value[nestedPropName] = unescapeValue(
                                    nt.object,
                                );
                            });
                        } else {
                            value = unescapeValue(rt.object);
                        }

                        restaurants[parentId][parentProperty][propName] = value;
                    }
                });
            }
        }
    });

    // Add standalone restaurants (not linked to any parent)
    for (const blankNodeId in restaurantByBlankNode) {
        const restaurantId = restaurantByBlankNode[blankNodeId];

        // Check if this restaurant is already included as a child of some parent
        let isChild = false;
        for (const parentId in restaurants) {
            if (restaurants[parentId][restaurantId]) {
                isChild = true;
                break;
            }
        }

        if (!isChild) {
            // This is a standalone restaurant, collect all its properties
            const restaurantTriples = triples.filter(
                (t) => t.subject === restaurantId,
            );
            const restaurantData: Restaurant = {
                "@id": restaurantId,
                "@type": "Restaurant",
                "@source": "standalone",
            };

            restaurantTriples.forEach((rt) => {
                const propName = getLocalName(rt.predicate);
                let value: any;

                if (rt.isObjectBlankNode) {
                    // Handle nested blank nodes
                    const nestedTriples = triples.filter(
                        (nt) => nt.subject === rt.object,
                    );
                    value = {};

                    nestedTriples.forEach((nt) => {
                        const nestedPropName = getLocalName(nt.predicate);
                        value[nestedPropName] = unescapeValue(nt.object);
                    });
                } else {
                    value = unescapeValue(rt.object);
                }

                restaurantData[propName] = value;
            });

            restaurants[restaurantId] = restaurantData;
        }
    }

    // Also check for entities that refer to restaurants through 'item' property
    for (const entityId in entities) {
        const entity = entities[entityId];

        if (entity.item && typeof entity.item === "object") {
            // Check if the item is a restaurant
            if (
                entity.item.type === "Restaurant" ||
                entity.item.type === "FoodEstablishment"
            ) {
                restaurants[entityId + "#item"] = {
                    "@id": entityId + "#item",
                    "@type": "Restaurant",
                    "@source": "item",
                    ...entity.item,
                };
            }
        }
    }

    // Direct search for entities with type restaurant
    for (const entityId in entities) {
        const entity = entities[entityId];

        if (
            entity.type === "Restaurant" ||
            entity.type === "FoodEstablishment"
        ) {
            restaurants[entityId] = {
                "@id": entityId,
                "@type": "Restaurant",
                "@source": "direct",
                ...entity,
            };
        }
    }

    return restaurants;
}

/**
 * Main function to process an N-Quad file
 * @param inputFilePath Path to the input N-Quad file
 * @param outputFilePath Path to save the output JSON file
 * @param debug Whether to enable debug mode
 */
async function processNQuadFile(
    inputFilePath: string,
    outputFilePath: string,
    debug: boolean = false,
): Promise<void> {
    try {
        console.log(`Processing file: ${inputFilePath}`);

        // Create a read stream for the input file
        const fileStream = fs.createReadStream(inputFilePath);

        // Create a readline interface to read line by line
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity,
        });

        const triples: Triple[] = [];
        let lineCount = 0;
        let parseErrors = 0;

        // Process each line
        for await (const line of rl) {
            lineCount++;
            const triple = parseNQuadLine(line);

            if (triple) {
                triples.push(triple);
            } else {
                parseErrors++;
                if (debug) {
                    console.error(`Parse error on line ${lineCount}: ${line}`);
                }
            }

            // Print progress for large files
            if (lineCount % 10000 === 0) {
                console.log(`Processed ${lineCount} lines...`);
            }
        }

        console.log(
            `Finished reading file. Total lines: ${lineCount}, Successfully parsed: ${triples.length}, Parse errors: ${parseErrors}`,
        );

        // Process triples with blank nodes
        console.log("Processing blank nodes and building entity graph...");
        const allEntities = processBlankNodes(triples);

        // Extract restaurants
        console.log("Extracting restaurant data...");
        const restaurants = extractRestaurants(allEntities, triples);

        // Convert to array
        const restaurantsArray = Object.values(restaurants);

        console.log(`Found ${restaurantsArray.length} restaurants`);

        if (debug && restaurantsArray.length === 0) {
            // Debug: list some of the entity types found
            const types = new Set<string>();
            triples.forEach((triple) => {
                if (triple.predicate.includes("type")) {
                    types.add(triple.object);
                }
            });
            console.log("Entity types found in the data:");
            types.forEach((type) => console.log(` - ${type}`));
        }

        // Write the result to the output file
        fs.writeFileSync(
            outputFilePath,
            JSON.stringify(restaurantsArray, null, 2),
        );

        console.log(
            `Successfully processed ${triples.length} triples and found ${restaurantsArray.length} restaurants.`,
        );
        console.log(`Output saved to ${outputFilePath}`);
    } catch (error) {
        console.error("Error processing file:", error);
    }
}

// Export functions for use as a module
export { parseNQuadLine, processBlankNodes, processNQuadFile, escapeUrl };
async function main() {
    const sourceFolder = path.join(
        homedir(),
        "Downloads",
        "restaurant common crawl",
        "part_12",
    );
    const inputFile = path.join(sourceFolder, "part_12");
    const outputFile = path.join(
        sourceFolder,
        path.basename(inputFile, path.extname(inputFile)) + ".json",
    );

    // Choose which implementation to use
    await processNQuadFile(inputFile, outputFile);

    console.log("Conversion complete!");
}

main().catch(console.error);
