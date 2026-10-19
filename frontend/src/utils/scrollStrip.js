// Which scroll arrows a horizontal strip needs, from its scroll metrics.
// A 1px tolerance absorbs sub-pixel scroll positions on scaled displays.
export function scrollArrows({ scrollLeft, clientWidth, scrollWidth }) {
    return {
        left: scrollLeft > 1,
        right: scrollLeft + clientWidth < scrollWidth - 1,
    };
}
