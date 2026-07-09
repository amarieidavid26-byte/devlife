// single source of truth for the per-state palette (PIXI ints + CSS strings)
export const STATE_COLORS = {
    DEEP_FOCUS: 0x9B6AFF,
    STRESSED:   0xFF7A6A,
    FATIGUED:   0xFFB84A,
    RELAXED:    0x6AD89A,
    WIRED:      0x6AB8FF,
};

export const STATE_COLORS_CSS = Object.fromEntries(
    Object.entries(STATE_COLORS).map(([k, v]) => [k, '#' + v.toString(16).padStart(6, '0').toUpperCase()])
);
