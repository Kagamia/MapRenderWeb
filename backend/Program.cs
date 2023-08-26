// See https://aka.ms/new-console-template for more information
using WzComparerR2.WzLib;
using Newtonsoft.Json;

class Program {
    public static void Main(string[] args) {
        Wz_Structure wzs = new();
        wzs.WzVersionVerifyMode = WzVersionVerifyMode.Fast;
        string baseWzFolder = @"C:\Maplestory\Data\Base";  // <- change to your own
        string frontendPublicDir = @".\public";            // <- change to your own
        string wzRegion = "CMST";                          // <- change to your own

        try {
            wzs.LoadWzFolder(baseWzFolder, ref wzs.WzNode, true);
            int mapID = 100000000;
            int wzVersion = wzs.wz_files[0].Header.WzVersion;
            string outputDir = @$"{frontendPublicDir}\{wzRegion}-{wzVersion}";
            Wz_Node mapImgNode = wzs.WzNode.FindNodeByPath(true, "Map", "Map", $"Map{mapID / 100000000}", $"{mapID}.img");

            // Load map manifest
            MapInfo mapInfo = new();
            for (int layer = 0; layer < 8; layer++)
            {
                Wz_Node layerNode = mapImgNode.FindNodeByPath(layer.ToString());

                // load tile
                Wz_Node tileRootNode = layerNode.FindNodeByPath("tile");
                if (tileRootNode != null && tileRootNode.Nodes.Count > 0) {
                    var tileClass = layerNode.FindNodeByPath(@"info\tS").GetValue<string>();
                    mapInfo.Layers[layer].Tiles = tileRootNode.Nodes.Select(tileNode=>{
                        string resourceUrl = string.Format("Map/Tile/{0}.img/{1}/{2}",
                            tileClass,
                            tileNode.FindNodeByPath("u").GetValue<string>(),
                            tileNode.FindNodeByPath("no").GetValueEx<int>(0)
                        );
                        return new MapTile() {
                            ID = int.Parse(tileNode.Text),
                            X = tileNode.FindNodeByPath("x").GetValueEx<int>(0),
                            Y = tileNode.FindNodeByPath("y").GetValueEx<int>(0),
                            Resource = LoadSpriteBase<Sprite>(wzs, resourceUrl, outputDir),
                        };
                    }).ToList();
                }
                
                // load obj
                Wz_Node objRootNode = layerNode.FindNodeByPath("obj");
                if (objRootNode != null && objRootNode.Nodes.Count > 0)
                {
                    mapInfo.Layers[layer].Objs = objRootNode.Nodes.Select(objNode =>
                    {
                        string resourceUrl = string.Format("Map/Obj/{0}.img/{1}/{2}/{3}",
                            objNode.FindNodeByPath("oS").GetValue<string>(),
                            objNode.FindNodeByPath("l0").GetValue<string>(),
                            objNode.FindNodeByPath("l1").GetValue<string>(),
                            objNode.FindNodeByPath("l2").GetValue<string>()
                        );
                        return new MapObj() {
                            ID = int.Parse(objNode.Text),
                            X = objNode.FindNodeByPath("x").GetValueEx<int>(0),
                            Y = objNode.FindNodeByPath("y").GetValueEx<int>(0),
                            Z = objNode.FindNodeByPath("z").GetValueEx<int>(0),
                            FlipX = objNode.FindNodeByPath("f").GetValueEx<int>(0) != 0,
                            Resource = LoadAnimation(wzs, resourceUrl, outputDir),
                        };
                    }).ToList();
                }
                
                // load map back
                Wz_Node backRootNode = mapImgNode.FindNodeByPath("back");
                if (backRootNode != null) {
                    mapInfo.Backs = backRootNode.Nodes.Select(backNode=>{
                        int ani = backNode.FindNodeByPath("ani").GetValueEx<int>(0);
                        string resourceUrl = string.Format("Map/Back/{0}.img/{1}/{2}",
                            backNode.FindNodeByPath("bS").GetValue<string>(),
                            ani switch {
                                0 => "back",
                                1 => "ani",
                                2 => "spine",
                                _ => throw new Exception($"unknown back ani={ani} at {backNode.FullPathToFile}"),
                            },
                            backNode.FindNodeByPath("no").GetValue<string>()
                        );

                        object backResource = ani switch
                        {
                            0 => LoadSpriteBase<Sprite>(wzs, resourceUrl, outputDir),
                            1 => LoadAnimation(wzs, resourceUrl, outputDir),
                            2 => throw new NotImplementedException("spine is not supported"),
                            _ => throw new Exception($"unknown back ani={ani} at {backNode.FullPathToFile}"),
                        };
                        
                        return new MapBack(){
                            ID = int.Parse(backNode.Text),
                            X = backNode.FindNodeByPath("x").GetValueEx<int>(0),
                            Y = backNode.FindNodeByPath("y").GetValueEx<int>(0),
                            Cx = backNode.FindNodeByPath("cx").GetValueEx<int>(0),
                            Cy = backNode.FindNodeByPath("cy").GetValueEx<int>(0),
                            Rx = backNode.FindNodeByPath("rx").GetValueEx<int>(0),
                            Ry = backNode.FindNodeByPath("ry").GetValueEx<int>(0),
                            Alpha = backNode.FindNodeByPath("a").GetValueEx<int>(0),
                            FlipX = backNode.FindNodeByPath("f").GetValueEx<int>(0) != 0,
                            Front = backNode.FindNodeByPath("front").GetValueEx<int>(0) != 0,
                            Ani = ani,
                            Type = backNode.FindNodeByPath("type").GetValueEx<int>(0),
                            Resource = backResource,
                        };
                    }).ToArray();
                }
            }

            // Save map manifest file
            string mapInfoResourceUrl = mapImgNode.FullPathToFile.Replace('\\', '/');
            string mapInfoJsonFile = Path.ChangeExtension(Path.Combine(outputDir, mapInfoResourceUrl), ".json");
            string fileDir = Path.GetDirectoryName(mapInfoJsonFile);
            if (!Directory.Exists(fileDir))
                Directory.CreateDirectory(fileDir);
            File.WriteAllText(mapInfoJsonFile, JsonConvert.SerializeObject(mapInfo));

        } finally {
            wzs.Clear();
        }
    }


    // You can define other methods, fields, classes and namespaces here

    static T LoadSpriteBase<T>(Wz_Structure wzs, string resourceUrl, string outputBaseDir) where T : Sprite, new()
    {
        var pngNode = wzs.WzNode.FindNodeByPath(true, resourceUrl.Split('/')) ?? throw new Exception("Failed to find sprite "+resourceUrl);
        return LoadSpriteBase<T>(pngNode, outputBaseDir);
    }

    static T LoadSpriteBase<T>(Wz_Node pngNode, string outputBaseDir) where T : Sprite, new() {
        // resolve uol
        pngNode = pngNode.ResolveUol();
        // resolve link
        var linkedPngNode = GetLinkedSourceNode(pngNode) ?? pngNode;
        var png = linkedPngNode.GetValue<Wz_Png>() ?? throw new Exception($"{pngNode.FullPathToFile} is not a PNG node");
        var origin = pngNode.FindNodeByPath("origin").GetValueEx<Wz_Vector>(null);
        var sprite = new T(){
            Width = png.Width,
            Height = png.Height,
            OriginX = origin?.X ?? 0,
            OriginY = origin?.Y ?? 0,
            Z = pngNode.FindNodeByPath("z").GetValueEx<int>(0),
            ResourceUrl = SavePngFile(linkedPngNode, outputBaseDir),
        };
        if (sprite is Frame frame) {
            frame.Delay = pngNode.FindNodeByPath("delay").GetValueEx<int>(100);
            frame.A0 = pngNode.FindNodeByPath("a0").GetValueEx<int>(255);
            frame.A1 = pngNode.FindNodeByPath("a1").GetValueEx<int>(255);
        }
        return sprite;
    }

    static string SavePngFile(Wz_Node pngNode, string outputBaseDir) {
        string relativeUrl = pngNode.FullPathToFile.Replace('\\', '/') + ".png";
        string outputFileName = Path.Combine(outputBaseDir, relativeUrl);

        if (!File.Exists(outputFileName))
        {
            string outputDir = Path.GetDirectoryName(outputFileName);
            if (!Directory.Exists(outputDir))
                Directory.CreateDirectory(outputDir);
            using var bitmap = pngNode.GetValue<Wz_Png>().ExtractPng();
            bitmap.Save(outputFileName);
        }
        return relativeUrl;
    }

    static FrameAnimate LoadAnimation(Wz_Structure wzs, string resourceUrl, string outputBaseDir) {
        var aniNode = wzs.WzNode.FindNodeByPath(true, resourceUrl.Split('/')) ?? throw new Exception("Failed to find ani "+resourceUrl);
        var frames = new List<Frame>();
        for (int f = 0; ; f++)
        {
            var pngNode = aniNode.FindNodeByPath(f.ToString());
            if (pngNode == null) break;
            var frame = LoadSpriteBase<Frame>(pngNode, outputBaseDir);
            frames.Add(frame);
        }
        if (frames.Count == 0) throw new Exception("load 0 frames at " + resourceUrl);
        return new FrameAnimate(){
            Frames = frames
        };
    }

    static Wz_Node GetLinkedSourceNode(Wz_Node node)
    {
        Wz_Node findNode(string fullPath) => node.GetNodeWzFile().WzStructure?.WzNode.FindNodeByPath(true, fullPath.Split('/'));
        
        string path;

        if (!string.IsNullOrEmpty(path = node.Nodes["source"].GetValueEx<string>(null)))
        {
            return findNode(path);
        }
        else if (!string.IsNullOrEmpty(path = node.Nodes["_inlink"].GetValueEx<string>(null)))
        {
            var img = node.GetNodeWzImage();
            return img?.Node.FindNodeByPath(true, path.Split('/'));
        }
        else if (!string.IsNullOrEmpty(path = node.Nodes["_outlink"].GetValueEx<string>(null)))
        {
            return findNode(path);
        }
        else
        {
            return node;
        }
    }

    class MapInfo
    {
        public int ID { get; set; }
        public MapLayer[] Layers { get; } = Enumerable.Range(0, 8).Select(_ => new MapLayer()).ToArray();
        public MapBack[] Backs { get; set; }
    }

    class MapLayer
    {
        public List<MapTile> Tiles { get; set; }
        public List<MapObj> Objs { get; set; }
    }

    class MapTile
    {
        public int ID {get;set;}
        public int X { get; set; }
        public int Y { get; set; }
        public Sprite Resource {get;set;}
    }

    class MapObj
    {
        public int ID {get;set;}
        public int X { get; set; }
        public int Y { get; set; }
        public int Z { get; set; }
        public bool FlipX { get; set; }
        public FrameAnimate Resource { get; set; }
    }

    class MapBack
    {
        public int ID { get; set; }
        public int X { get; set; }
        public int Y { get; set; }
        public int Cx { get; set; }
        public int Cy { get; set; }
        public int Rx { get; set; }
        public int Ry { get; set; }
        public int Alpha { get; set; }
        public bool FlipX { get; set; }
        public bool Front { get; set; }
        public int Ani { get; set; }
        public int Type { get; set; }
        public object Resource { get; set; }
    }

    //--------------------------------------

    class Sprite
    {
        public int Width { get; set; }
        public int Height { get; set; }
        public int OriginX {get;set;}
        public int OriginY { get; set; }
        public int Z { get; set; }
        public string ResourceUrl { get; set; }
    }

    class Frame : Sprite
    {
        public int Delay {get;set;}
        public int A0 { get; set; }
        public int A1 { get; set; }
    }

    class FrameAnimate
    {
        public List<Frame> Frames { get; set; }
    }
}
