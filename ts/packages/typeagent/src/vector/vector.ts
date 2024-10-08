// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Ultra vanilla, non-accelerated (currently), non-unrolled vector operations

export type Vector = number[] | Float32Array;

export function dotProduct(x: Vector, y: Vector): number {
    verifyLengthEqual(x, y);

    let sum = 0;
    for (let i = 0; i < x.length; ++i) {
        sum += x[i] * y[i];
    }
    return sum;
}

export function euclideanLength(x: Vector): number {
    return Math.sqrt(dotProduct(x, x));
}

export function normalizeInPlace(v: Vector): void {
    divideInPlace(v, euclideanLength(v));
}

export function cosineSimilarity(x: Vector, y: Vector): number {
    verifyLengthEqual(x, y);

    let dotSum = 0;
    let lenXSum = 0;
    let lenYSum = 0;
    for (let i = 0; i < x.length; ++i) {
        const xVal: number = x[i];
        const yVal: number = y[i];

        dotSum += xVal * yVal; // Dot product
        lenXSum += xVal * xVal; // For magnitude of x
        lenYSum += yVal * yVal; // For magnitude of y
    }

    // Cosine Similarity of X, Y
    // Sum(X * Y) / |X| * |Y|
    return dotSum / (Math.sqrt(lenXSum) * Math.sqrt(lenYSum));
}

function divideInPlace(x: Vector, divisor: number): void {
    for (let i = 0; i < x.length; ++i) {
        x[i] /= divisor;
    }
}

function verifyLengthEqual(x: Vector, y: Vector) {
    if (x.length != y.length) {
        throw new Error("Array length mismatch");
    }
}
