// Maps a value in [min, max] to an SVG y between top and top + height.
// Normally max sits at the top; `invert` puts min at the top instead.
export function makeYScale({ min, max, top, height, invert }) {
    const span = max - min || 1;
    return (v) => {
        const t = (v - min) / span;
        return invert ? top + t * height : top + height - t * height;
    };
}

// Default y-range, widened (with padding) only when readings fall outside it.
export function chartWindow(values, { min, max, pad }) {
    if (values.length === 0) return { min, max };
    return {
        min: Math.min(min, Math.min(...values) - pad),
        max: Math.max(max, Math.max(...values) + pad),
    };
}
