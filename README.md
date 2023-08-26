# MapRenderWeb

An example of using wzlib to load wz, export resources, and render basic map elements on webpage.

# Setup

## backend
1. install `dotnet`
2. fill full path of `WzComparerR2.WzLib.dll` into `backend/wz_exporter.csproj`
3. fill full path of Maplestory game folder and `frontend/public` folder into `backend/Program.cs`
4. exec `dotnet run` under `backend/`, and see if resources are saved into `frontend/public`

## frontend
1. install `npm`, `tsc`
2. exec `npm install` under `frontend/`
3. exec `npm run serve` under `frontend/`
4. (optional) update default `mapID` and `clientVer` at the end of `frontend/src/index.cs`
5. access `localhost:8080?ver={CLIENT_VER}&mapID={MAP_ID}` in a browser

## License

MIT
