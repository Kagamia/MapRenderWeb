import * as WZ from './wz_loader'
import * as PIXI from 'pixi.js'
import { Viewport } from 'pixi-viewport'
import { MovedEvent, ZoomedEvent } from 'pixi-viewport/dist/types'

//------------------------------
// custom PIXI containers

interface MaplestoryMapBackRenderResource {
    get rect() : PIXI.Rectangle
    update(deltaTime: number): void
    clone(): PIXI.DisplayObject
}

class MaplestoryAnimatedSprite extends PIXI.AnimatedSprite implements MaplestoryMapBackRenderResource {
    constructor(textures: PIXI.Texture[] | PIXI.FrameObject[], autoUpdate?: boolean) {
        super(textures, autoUpdate);
        this._rawTextures = textures;
        this._rect = new PIXI.Rectangle();
    }

    private _rawFrames?: Array<WZ.Frame>
    private readonly _rawTextures : PIXI.Texture[] | PIXI.FrameObject[]
    private _rect : PIXI.Rectangle

    update(deltaTime: number): void {
        super.update(deltaTime);

        if (this.rawFrames && this.currentFrame < this.rawFrames.length) {
            const rawFrame = this.rawFrames[this.currentFrame];
            this.pivot.set(rawFrame.OriginX, rawFrame.OriginY);

            const currentTime = <number>this["_currentTime"] % 1;
            this.alpha = (rawFrame.A0 * (1-currentTime) + rawFrame.A1 * currentTime) / 255.0;
        }
    }

    get rect() : PIXI.Rectangle {
        return this._rect;
    }

    get rawFrames() : Array<WZ.Frame> | undefined {
        return this._rawFrames;
    }

    set rawFrames(value: Array<WZ.Frame> | undefined) {
        this._rawFrames = value;
        this._rect = this.calculateRect();
    }

    clone(): MaplestoryAnimatedSprite {
        const clonedObj = new MaplestoryAnimatedSprite(this._rawTextures, this.autoUpdate);
        clonedObj.x = this.x;
        clonedObj.y = this.y;
        clonedObj.scale = this.scale;
        clonedObj.pivot = this.pivot;
        clonedObj.alpha = this.alpha;
        clonedObj.loop = this.loop;
        clonedObj.rawFrames = this.rawFrames;
        clonedObj.currentFrame = this.currentFrame;
        clonedObj["_currentTime"] = this["_currentTime"];

        this.playing ? clonedObj.play() : clonedObj.stop();
        // force updating once to sync all properties.
        clonedObj.update(0);
        return clonedObj;
    }

    private calculateRect() : PIXI.Rectangle {
        if (!this.rawFrames) {
            return new PIXI.Rectangle();
        }

        let left = Number.MAX_SAFE_INTEGER,
            top = Number.MAX_SAFE_INTEGER,
            right = Number.MIN_SAFE_INTEGER,
            bottom = Number.MIN_SAFE_INTEGER;
        
        this.rawFrames.forEach(frame=>{
            left = Math.min(left, -frame.OriginX);
            top = Math.min(top, -frame.OriginY);
            right = Math.max(right, -frame.OriginX+frame.Width);
            bottom = Math.max(bottom, -frame.OriginY + frame.Height);
        });

        // handle flipX
        if (this.scale.x >= 0) {
            return new PIXI.Rectangle(left * this.scale.x, top, (right-left) * this.scale.x, bottom-top);
        } else {
            return new PIXI.Rectangle(right * this.scale.x, top, (left-right) * this.scale.x, bottom-top);
        }
    }
}

class MaplestorySprite extends PIXI.Sprite implements MaplestoryMapBackRenderResource {
    constructor(texture?: PIXI.Texture) {
        super(texture);
    }

    get rect() : PIXI.Rectangle {
        if (!this.texture) return new PIXI.Rectangle();
        let rect = new PIXI.Rectangle(-this.pivot.x, -this.pivot.y, this.texture.width, this.texture.height);
        if (this.scale.x >= 0) {
            return new PIXI.Rectangle(rect.x * this.scale.x, rect.y, this.texture.width * this.scale.x, this.texture.height);
        } else {
            return new PIXI.Rectangle(rect.right * this.scale.x, rect.y, this.texture.width * -this.scale.x, this.texture.height);
        }
    }

    update(deltaTime: number) : void {
        // non-op function
    }

    clone(): MaplestorySprite {
        const clonedObj = new MaplestorySprite(this.texture);
        clonedObj.x = this.x;
        clonedObj.y = this.y;
        clonedObj.scale = this.scale;
        clonedObj.pivot = this.pivot;
        clonedObj.alpha = this.alpha;
        return clonedObj;
    }
}

class TileMode {
    constructor(tileX: boolean, tileY: boolean, autoScrollX: boolean, autoScrollY: boolean) {
        this.tileX = tileX;
        this.tileY = tileY;
        this.autoScrollX = autoScrollX;
        this.autoScrollY = autoScrollY;
    }

    tileX: boolean
    tileY: boolean
    autoScrollX: boolean
    autoScrollY: boolean

    static fromBackType(backType: number) : TileMode {
        switch(backType) {
            case 0: return new TileMode(false, false, false, false);
            case 1: return new TileMode(true, false, false, false);
            case 2: return new TileMode(false, true, false, false);
            case 3: return new TileMode(true, true, false, false);
            case 4: return new TileMode(true, false, true, false);
            case 5: return new TileMode(false, true, false, true);
            case 6: return new TileMode(true, true, true, false);
            case 7: return new TileMode(true, true, false, true);
            default: return new TileMode(false, false, false, false);
        }
    }
}

class MaplestoryTilingSprite<T extends PIXI.DisplayObject & MaplestoryMapBackRenderResource> extends PIXI.Container {
    constructor(viewport: Viewport, mapBack: WZ.MapBack, renderObject: T) {
        super();
        this._viewport = viewport;
        this._mapBack = mapBack;
        this._templateRenderObject = renderObject;
        this._tileMode = TileMode.fromBackType(this._mapBack.Type);

        this._positionOffset = new PIXI.Point();
        this._autoUpdate = false;
        this._isConnectedToTicker = false;

        this.attachViewportEvents();
        // TODO: detach events when this is removed from stage
    }

    private readonly _viewport: Viewport
    private readonly _mapBack: WZ.MapBack
    private readonly _templateRenderObject: T
    private readonly _tileMode: TileMode

    private _positionOffset : PIXI.Point
    private _autoUpdate: boolean;
    private _isConnectedToTicker: boolean;
    
    update(deltaTime: number): void {
        const screenCenter = this._viewport.center;
        const screenRect = new PIXI.Rectangle(
            screenCenter.x - this._viewport.screenWidthInWorldPixels / 2,
            screenCenter.y - this._viewport.screenHeightInWorldPixels / 2,
            this._viewport.screenWidthInWorldPixels,
            this._viewport.screenHeightInWorldPixels
        );
        const resourceRect = this._templateRenderObject.rect
        const cx = this._mapBack.Cx || resourceRect.width;
        const cy = this._mapBack.Cy || resourceRect.height;
        const elapsedMs = deltaTime / 60.0 * 1000;

        // calculate position
        if (this._tileMode.autoScrollX) {
            this._positionOffset.x += this._mapBack.Rx * 5 * elapsedMs / 1000.0;
            this._positionOffset.x %= cx;
        } else {
            // parallax scroll by following camera center
            // rx = -100: fixed in map
            // rx = 0: sync with camera
            // rx = 100: faster than camera
            this._positionOffset.x = (screenCenter.x - 0) * (this._mapBack.Rx + 100) / 100.0;
        }

        if (this._tileMode.autoScrollY) {
            this._positionOffset.y += this._mapBack.Ry * 5 * elapsedMs / 1000.0;
            this._positionOffset.y %= cy;
        } else {
            this._positionOffset.y = (screenCenter.y - 0) * (this._mapBack.Ry + 100) / 100.0;
        }

        let basePos = new PIXI.Point(this._mapBack.X + this._positionOffset.x, this._mapBack.Y + this._positionOffset.y);

        // calculate tiling size
        let tileCountX = 1;
        let tileCountY = 1;
        if (this._tileMode.tileX && cx > 0) {
            let tileStartRight = (basePos.x + resourceRect.right - screenRect.left) % cx;
            if (tileStartRight <= 0)
                tileStartRight += cx;
            tileStartRight += screenRect.left;

            let tileStartLeft = tileStartRight - resourceRect.width;
            if (tileStartLeft >= screenRect.right) {
                tileCountX = 0;
            } else {
                tileCountX = Math.ceil((screenRect.right - tileStartLeft) / cx);
                basePos.x = tileStartLeft - resourceRect.x;
            }
        }

        if (this._tileMode.tileY && cy > 0) {
            let tileStartBottom = (basePos.y + resourceRect.bottom - screenRect.top) % cy;
            if (tileStartBottom <= 0)
                tileStartBottom += cy;
            tileStartBottom += screenRect.top;

            let tileStartTop = tileStartBottom - resourceRect.height;
            if (tileStartTop >= screenRect.bottom) {
                tileCountY = 0;
            } else {
                tileCountY = Math.ceil((screenRect.bottom - tileStartTop) / cy);
                basePos.y = tileStartTop - resourceRect.y;
            }
        }
        
        // ensure children count and update position
        let lastChildIndex = 0;
        for (let j=0; j<tileCountY; j++) {
            for (let i=0; i<tileCountX; i++) {
                if (this.children.length <= lastChildIndex) {
                    this.addChild(this._templateRenderObject.clone());
                }
                const cloneObj = this.children[lastChildIndex];
                cloneObj.x = basePos.x + i * cx;
                cloneObj.y = basePos.y + j * cy;
                lastChildIndex++;
            }
        }
        while (this.children.length > lastChildIndex) { 
            this.removeChildAt(lastChildIndex);
        }

        // update all children
        this._templateRenderObject.update(deltaTime);
        this.children.forEach(v=>{
            (<object>v as MaplestoryMapBackRenderResource).update(deltaTime);
        });
    }

    get autoUpdate(): boolean {
        return this._autoUpdate;
    }

    set autoUpdate(value: boolean) {
        if (value !== this._autoUpdate) {
            if (!value && this._isConnectedToTicker) {
                PIXI.Ticker.shared.remove(this.update, this);
                this._isConnectedToTicker = false;
            } else if (value && !this._isConnectedToTicker) {
                PIXI.Ticker.shared.add(this.update, this);
                this._isConnectedToTicker = true;
            }
            this._autoUpdate = value;
        }
    }

    private attachViewportEvents() {
        this._viewport.on("moved", this.onViewportMoved, this)
        this._viewport.on("zoomed", this.onViewportZoomed, this)
    }

    private onViewportMoved(e: MovedEvent){
        this.update(0);
    }

    private onViewportZoomed(e: ZoomedEvent) {
        this.update(0);
    }
}

//------------------------------

const app = new PIXI.Application({
    backgroundColor: 0xdddddd,
    resizeTo: window,
});
document.body.appendChild(app.view as HTMLCanvasElement)

// create viewport
const viewport = new Viewport({
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    worldWidth: null,
    worldHeight: null,

    events: app.renderer.events // the interaction module is important for wheel to work properly when renderer.view is placed or scaled
})

// add the viewport to the stage
app.stage.addChild(viewport)
app.renderer.on("resize", ()=> {
    viewport.resize(app.renderer.width, app.renderer.height);
});

// activate plugins
viewport
    .drag()
    .pinch()
    .wheel()
    .decelerate();

function createBckgroundFrame(): PIXI.Container {
    const container = new PIXI.Container();
    
    const left = -10000, right = 10000, top = -10000, bottom = 10000;
    const lineInterval = 100;
    const primaryLineInterval = 1000;

    const lineStyle : PIXI.ILineStyleOptions = { width: 1, color: 0xcccccc };
    const primaryLineStyle : PIXI.ILineStyleOptions = { width: 3, color: 0xa0a0ff };

    // draw frame lines
    const g = new PIXI.Graphics();
    for (let y = top; y <= bottom; y+= lineInterval) {
        g.lineStyle(y % primaryLineInterval == 0 ? primaryLineStyle : lineStyle)
            .moveTo(left, y)
            .lineTo(right, y);
    }
    for (let x = left; x <= right; x+= lineInterval) {
        g.lineStyle(x % primaryLineInterval == 0 ? primaryLineStyle : lineStyle)
            .moveTo(x, top)
            .lineTo(x, bottom);
    }
    container.addChild(g);

    // draw axis label
    for (let x = left; x <= right; x+= lineInterval) {
        const label = new PIXI.Text(x.toString(), { align: "left", fontSize: "1em", fill: "#800000"});
        label.position.set(x, 0);
        container.addChild(label);
    }

    for (let y = top; y <= bottom; y+= lineInterval) {
        const label = new PIXI.Text(y.toString(), { align: "left", fontSize: "1em", fill: "#808000"});
        label.position.set(0, y-12);
        container.addChild(label);
    }

    return container;
}

function compositeZIndex(z0: number, z1?: number, z2?: number): number {
    const scale = 1<<10; // 1024
    const normalize = (v?: number) => {
        // -512 <= v <= 511
        v = Math.round(v || 0) + scale / 2;
        // 0 <= v <= 1023
        v = Math.max(0, Math.min(v, scale-1));
        return v;
    };
    return normalize(z0) * scale * scale 
        + normalize(z1) * scale
        + normalize(z2);
}

async function loadAndRenderMap(mapID: number): Promise<void> {
    const mapInfo = await WZ.loadMapInfo(mapID, baseUrl);
    console.log(mapInfo);
    if (mapInfo.Backs) {
        const backLayer = viewport.addChild(new PIXI.Container());
        backLayer.sortableChildren = true;
        backLayer.zIndex = 0;
        const frontLayer = viewport.addChild(new PIXI.Container());
        frontLayer.sortableChildren = true;
        frontLayer.zIndex = 10;

        for (let i=0; i<mapInfo.Backs.length; i++) {
            const mapBack = mapInfo.Backs[i];
            const rootLayer = mapBack.Front ? frontLayer : backLayer;
            if (mapBack.Resource) {
                switch (mapBack.Ani) {
                    case 0: // sprite
                        {
                            const spriteRes = <WZ.Sprite> mapBack.Resource;
                            const spriteImageUrl = new URL(spriteRes.ResourceUrl, baseUrl).toString();
                            const texture = await PIXI.Assets.load<PIXI.Texture>(spriteImageUrl);
                            const spriteObj = new MaplestorySprite(texture);
                            spriteObj.position.set(mapBack.X, mapBack.Y);
                            spriteObj.pivot.set(spriteRes.OriginX, spriteRes.OriginY);
                            if (mapBack.FlipX) {
                                spriteObj.scale.x = -1;
                            }
                            const backObj = rootLayer.addChild(new MaplestoryTilingSprite(viewport, mapBack, spriteObj));
                            backObj.alpha = mapBack.Alpha / 255.0;
                            backObj.zIndex = mapBack.ID;
                            backObj.autoUpdate = true;
                        }
                        break;
                    case 1: // frameAni
                        {
                            const frameAni = <WZ.FrameAnimate> mapBack.Resource;
                            const frames = new Array<PIXI.FrameObject>();
                            for (let k=0; k< frameAni.Frames.length; k++) {
                                const frame = frameAni.Frames[k];
                                const spriteImageUrl = new URL(frame.ResourceUrl, baseUrl).toString();
                                const texture = await PIXI.Assets.load<PIXI.Texture>(spriteImageUrl);
                                frames.push({texture: texture, time: frame.Delay});
                            }
                            const aniObj = new MaplestoryAnimatedSprite(frames, false);
                            aniObj.rawFrames = frameAni.Frames;
                            aniObj.position.set(mapBack.X, mapBack.Y);
                            if (mapBack.FlipX) {
                                aniObj.scale.x = -1;
                            }
                            aniObj.loop = true;
                            aniObj.play();
                            const backObj = rootLayer.addChild(new MaplestoryTilingSprite(viewport, mapBack, aniObj));
                            backObj.alpha = mapBack.Alpha / 255.0;
                            backObj.zIndex = mapBack.ID;
                            backObj.autoUpdate = true;
                        }
                        break;
                    case 2: // Spine
                }
            }
        }
    }

    if (mapInfo.Layers) {
        for (let i=0; i < mapInfo.Layers.length; i++) {
            const mapLayer = mapInfo.Layers[i];
            const layerContainer = viewport.addChild(new PIXI.Container());
            layerContainer.zIndex = i + 1;

            if (mapLayer.Objs) {
                const objContainer = layerContainer.addChild(new PIXI.Container());
                objContainer.sortableChildren = true;
                for (let j=0; j<mapLayer.Objs.length; j++) {
                    const mapObj = mapLayer.Objs[j];
                    const frameAni = mapObj.Resource;
                    if (frameAni && frameAni.Frames) {
                        const frames = new Array<PIXI.FrameObject>();
                        for (let k=0; k< frameAni.Frames.length; k++) {
                            const frame = frameAni.Frames[k];
                            const spriteImageUrl = new URL(frame.ResourceUrl, baseUrl).toString();
                            const texture = await PIXI.Assets.load<PIXI.Texture>(spriteImageUrl);
                            frames.push({texture: texture, time: frame.Delay});
                        }
                        const aniObj = objContainer.addChild(new MaplestoryAnimatedSprite(frames));
                        aniObj.rawFrames = frameAni.Frames;
                        aniObj.position.set(mapObj.X, mapObj.Y);
                        aniObj.zIndex = compositeZIndex(mapObj.Z, mapObj.ID);
                        if (mapObj.FlipX) {
                            aniObj.scale.x = -1;
                        }
                        aniObj.loop = true;
                        aniObj.play();
                    }
                }
            }
            
            if (mapLayer.Tiles) {
                const tileContainer = layerContainer.addChild(new PIXI.Container());
                tileContainer.sortableChildren = true;
                for (let j=0; j<mapLayer.Tiles.length; j++) {
                    const mapTile = mapLayer.Tiles[j];
                    if (mapTile.Resource) {
                        const spriteImageUrl = new URL(mapTile.Resource.ResourceUrl, baseUrl).toString();
                        const texture = await PIXI.Assets.load<PIXI.Texture>(spriteImageUrl);
                        const spriteObj = tileContainer.addChild(new PIXI.Sprite(texture));
                        spriteObj.position.set(mapTile.X, mapTile.Y);
                        spriteObj.pivot.set(mapTile.Resource.OriginX, mapTile.Resource.OriginY);
                        spriteObj.zIndex = compositeZIndex(mapTile.Resource.Z, mapTile.ID);
                    }
                }
            }
        }
    }
}

viewport.addChild(createBckgroundFrame());
viewport.sortableChildren = true;

const queryString = new URLSearchParams(window.location.search);
const mapID = Number.parseInt(queryString.get("mapID") || "100000000");  // <- change to your own
const clientVer = queryString.get("ver") || "CMST-193";                  // <- change to your own
const baseUrl = new URL(`./${clientVer}/`, window.location.href);

PIXI.Ticker.shared.autoStart = false;
loadAndRenderMap(mapID).then(mapInfo=>{
    console.log("success");
    PIXI.Ticker.shared.start();
}).catch(e=>{
    console.error(e);
});
