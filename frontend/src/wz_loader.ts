export interface MapInfo
{
	ID: number
    Layers: Array<MapLayer>
	Backs: Array<MapBack>
}

export interface MapLayer
{
	Tiles?: Array<MapTile>
	Objs?: Array<MapObj>
}

export interface MapTile
{
    ID: number
	X: number
	Y: number
	Resource: Sprite
}

export interface MapObj
{
    ID: number
	X: number
	Y: number
	Z: number
	FlipX: boolean
	Resource: FrameAnimate
}

export interface MapBack
{
	ID : number
	X : number
	Y : number
	Cx : number
	Cy : number
	Rx : number
	Ry : number
	Alpha : number
	FlipX : boolean
	Front : boolean
	Ani : number
	Type : number
	Resource : Sprite | FrameAnimate | undefined
}

export interface Sprite
{
	Width: number
	Height: number
	OriginX: number
	OriginY: number
	Z: number
	ResourceUrl: string
}

export interface Frame extends Sprite
{
	Delay: number
	A0: number
	A1: number
}

export interface FrameAnimate
{
	Frames: Array<Frame>
}

export async function loadMapInfo(mapID: number, publicResourceBaseUrl?: string | URL | undefined) : Promise<MapInfo> {
    const url = new URL(`Map/Map/Map${Math.floor(mapID/100000000)}/${mapID}.json`, publicResourceBaseUrl);
    const resp = await fetch(url);
    if (!resp.ok) {
        throw `loadMapInfo failed, server returns ${resp.status}.`;
    }
    const respBody = await resp.json();
    return respBody as MapInfo;
}
