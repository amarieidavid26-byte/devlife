import * as PIXI from 'pixi.js';

const FURNITURE_SPRITES = {
    desk:             '/assets/Isometric/desk_SE.png',
    monitor:          '/assets/Isometric/computerScreen_SE.png',
    keyboard:         '/assets/Isometric/computerKeyboard_SE.png',
    mouse:            '/assets/Isometric/computerMouse_SE.png',
    chair:            '/assets/Isometric/chairDesk_SE.png',
    coffee:           '/assets/Isometric/kitchenCoffeeMachine_SE.png',
    speaker:          '/assets/Isometric/speaker_SE.png',
    plant:            '/assets/Isometric/pottedPlant_SE.png',
    radio:            '/assets/Isometric/radio_SE.png',
    bookcase:         '/assets/Isometric/bookcaseOpen_SE.png',
    laptop:           '/assets/Isometric/laptop_SE.png',
    lamp:             '/assets/Isometric/lampRoundTable_SE.png',
    rug:              '/assets/Isometric/rugRectangle_SE.png',
    trashcan:         '/assets/Isometric/trashcan_SE.png',
    doorway:          '/assets/Isometric/doorway_SE.png',
    televisionModern: '/assets/Isometric/televisionModern_SE.png',
    sideTable:        '/assets/Isometric/sideTable_SE.png',
    coatRack:         '/assets/Isometric/coatRackStanding_SE.png',
    bear:             '/assets/Isometric/bear_SE.png',
    cardboardBox:     '/assets/Isometric/cardboardBoxClosed_SE.png',
    pillow:           '/assets/Isometric/pillow_SE.png',
    bed:              '/assets/Isometric/bedSingle_SE.png',
    benchCushion:     '/assets/Isometric/benchCushion_SE.png',
    floorFull:        '/assets/Isometric/floorFull_SE.png',
    wall:             '/assets/Isometric/wall_SE.png',
    wallWindow:       '/assets/Isometric/wallWindow_SE.png',
};

export class AssetLoader {
    static async loadAll() {
        const textures = new Map();
        const entries = Object.entries(FURNITURE_SPRITES);

        for (const [name, path] of entries) {
            try {
                const texture = await PIXI.Assets.load(path);
                textures.set(name, texture);
            } catch (e) {
                console.warn(`Failed to load sprite: ${name} (${path})`);
            }
        }

        return textures;
    }

    static getSprite(textures, name, scale = 1.0) {
        const tex = textures.get(name);
        if (!tex) return null;
        const sprite = new PIXI.Sprite(tex);
        sprite.scale.set(scale);
        sprite.anchor.set(0.5, 1);
        return sprite;
    }
}
