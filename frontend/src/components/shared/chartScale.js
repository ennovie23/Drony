// Maps a value in [min, max] to an SVG y between top and top + height.
// Normally max sits at the top; `invert` puts min at the top instead.
export function makeYScale({ min, max, top, height, invert }) {
    const span = max - min || 1;
    return (v) => {
        const t = (v - min) / span;
        return invert ? top + t * height : top + height - t * height;
    };
}
