const express = require("express");
const path = require("path");
const { addonBuilder, getRouter } = require("stremio-addon-sdk");
const { ANILIST_API, getCatalog, getMedia, smokeTest } = require("./anilist");
const { ANIZIP_API, getEpisodes: getAniZipEpisodes } = require("./anizip");
const { parseAniListId, toPreviewMeta, toFullMeta } = require("./mappers");

const PORT = Number(process.env.PORT || 7000);
const app = express();

const DEFAULT_CONFIG = Object.freeze({
  titleLanguage: "auto",
  includeSeries: true,
  includeMovies: true,
  seasonYearsBack: 4
});

const GENRES = ["Action","Adventure","Comedy","Drama","Ecchi","Fantasy","Horror","Mahou Shoujo","Mecha","Music","Mystery","Psychological","Romance","Sci-Fi","Slice of Life","Sports","Supernatural","Thriller"];
const SEASONS = ["WINTER","SPRING","SUMMER","FALL"];

function sanitizeConfig(input={}) {
  const languages = new Set(["auto","en","romaji","jp"]);
  const yearsBack = Number(input.seasonYearsBack);
  return {
    titleLanguage: languages.has(input.titleLanguage) ? input.titleLanguage : DEFAULT_CONFIG.titleLanguage,
    includeSeries: typeof input.includeSeries === "boolean" ? input.includeSeries : DEFAULT_CONFIG.includeSeries,
    includeMovies: typeof input.includeMovies === "boolean" ? input.includeMovies : DEFAULT_CONFIG.includeMovies,
    seasonYearsBack: Number.isFinite(yearsBack) ? Math.max(0, Math.min(10, Math.floor(yearsBack))) : DEFAULT_CONFIG.seasonYearsBack
  };
}
function encodeConfig(config) { return Buffer.from(JSON.stringify(sanitizeConfig(config)), "utf8").toString("base64url"); }
function decodeConfig(value) {
  try { return sanitizeConfig(JSON.parse(Buffer.from(value, "base64url").toString("utf8"))); }
  catch { return DEFAULT_CONFIG; }
}
function seasonLabel(s) { return ({WINTER:"Winter",SPRING:"Spring",SUMMER:"Summer",FALL:"Fall"})[s]; }
function seasonalOptions(config) {
  const y = new Date().getUTCFullYear();
  const out = [];
  for (let year=y; year>=y-config.seasonYearsBack; year--) for (const s of SEASONS) out.push(`${seasonLabel(s)} ${year}`);
  return out;
}
function seriesFilters(config) { return ["Tout","En cours","À venir","Populaires","Tendances",...seasonalOptions(config),...GENRES]; }
function movieFilters(config) {
  const y = new Date().getUTCFullYear();
  const years = Array.from({length: config.seasonYearsBack+1}, (_,i)=>String(y-i));
  return ["Tout","Populaires","Tendances",...years,...GENRES];
}
function parseFilter(value,isMovie=false) {
  if (!value || value==="Tout") return {};
  if (value==="En cours") return {status:"RELEASING"};
  if (value==="À venir") return {status:"NOT_YET_RELEASED"};
  if (value==="Populaires") return {sort:["POPULARITY_DESC"]};
  if (value==="Tendances") return {sort:["TRENDING_DESC"]};
  if (isMovie && /^\d{4}$/.test(value)) return {seasonYear:Number(value)};
  const m = /^(Winter|Spring|Summer|Fall)\s+(\d{4})$/.exec(value);
  if (m) return {season:m[1].toUpperCase(),seasonYear:Number(m[2])};
  if (GENRES.includes(value)) return {genre:value};
  return {};
}

function buildAddon(configInput=DEFAULT_CONFIG) {
  const config = sanitizeConfig(configInput);
  const catalogs = [];
  if (config.includeSeries) catalogs.push({
    type:"anime", id:"anilist-series", name:"Séries",
    extra:[
      {name:"genre",isRequired:false,options:seriesFilters(config)},
      {name:"search",isRequired:false},
      {name:"skip",isRequired:false}
    ]
  });
  if (config.includeMovies) catalogs.push({
    type:"anime", id:"anilist-movies", name:"Films",
    extra:[
      {name:"genre",isRequired:false,options:movieFilters(config)},
      {name:"search",isRequired:false},
      {name:"skip",isRequired:false}
    ]
  });

  const manifest = {
    id:"fr.azks.anilist",
    version:"2.0.0",
    name:"AniList",
    description:"Catalogue anime AniList pour Stremio avec métadonnées d'épisodes AniZip.",
    logo:"https://anilist.co/img/icons/android-chrome-512x512.png",
    resources:["catalog","meta"],
    types:["anime"],
    idPrefixes:["anilist:"],
    catalogs,
    behaviorHints:{configurable:true,configurationRequired:false}
  };

  const builder = new addonBuilder(manifest);

  builder.defineCatalogHandler(async args => {
    try {
      const skip = Math.max(0, Number(args?.extra?.skip || 0));
      const perPage = 50;
      const page = Math.floor(skip/perPage)+1;
      const offset = skip%perPage;
      const search = String(args?.extra?.search || "").trim() || undefined;
      const isMovie = args.id === "anilist-movies";
      const filter = parseFilter(String(args?.extra?.genre || ""), isMovie);

      const result = await getCatalog({
        page, perPage,
        format:isMovie ? "MOVIE" : "TV",
        search,
        season:filter.season,
        seasonYear:filter.seasonYear,
        genre:filter.genre,
        status:filter.status,
        sort: search ? ["SEARCH_MATCH"] : filter.sort || ["POPULARITY_DESC"]
      });

      const media = Array.isArray(result?.media) ? result.media.slice(offset) : [];
      return { metas: media.map(item => toPreviewMeta(item, config)) };
    } catch (error) {
      console.error("[catalog]", error?.stack || error);
      return { metas: [] };
    }
  });

  builder.defineMetaHandler(async args => {
    const id = parseAniListId(args.id);
    if (!id) return {meta:null};
    try {
      const media = await getMedia(id);
      if (!media) return {meta:null};
      const aniZipPayload = media.format !== "MOVIE"
        ? await getAniZipEpisodes(id).catch(()=>null)
        : null;
      return { meta: toFullMeta(media, aniZipPayload, config) };
    } catch (error) {
      console.error("[meta]", error?.stack || error);
      return {meta:null};
    }
  });

  return builder.getInterface();
}

app.get("/", (_req,res)=>res.redirect("/configure"));
app.get("/configure", (_req,res)=>{
  res.setHeader("Content-Type","text/html; charset=utf-8");
  res.setHeader("Content-Disposition","inline");
  res.sendFile(path.join(process.cwd(),"public","configure.html"));
});
app.get("/c/:config/configure", (_req,res)=>{
  res.setHeader("Content-Type","text/html; charset=utf-8");
  res.setHeader("Content-Disposition","inline");
  res.sendFile(path.join(process.cwd(),"public","configure.html"));
});
app.get("/health", (_req,res)=>res.json({
  status:"ok",addon:"AniList",version:"2.0.0",
  catalogSource:"AniList",episodeSource:"AniZip",
  aniListApi:ANILIST_API,aniZipApi:ANIZIP_API
}));
app.get("/debug/anilist", async (_req,res)=>{
  try {
    const items = await smokeTest();
    res.json({ok:true,count:items.length,sample:items.map(i=>({id:i.id,title:i?.title?.userPreferred||i?.title?.english||i?.title?.romaji,format:i.format}))});
  } catch (error) { res.status(500).json({ok:false,error:error?.message||String(error)}); }
});
app.get("/debug/anizip/:id", async (req,res)=>{
  try {
    const payload = await getAniZipEpisodes(Number(req.params.id));
    const eps = payload?.episodes && typeof payload.episodes==="object" ? Object.entries(payload.episodes) : [];
    res.json({ok:true,anilistId:Number(req.params.id),episodeCount:eps.length,sample:eps.slice(0,3).map(([number,e])=>({number,title:e?.title,image:e?.image,overview:e?.overview,airDate:e?.airDate}))});
  } catch (error) { res.status(500).json({ok:false,error:error?.message||String(error)}); }
});

app.use(express.static("public",{index:false,fallthrough:true}));
const defaultRouter = getRouter(buildAddon(DEFAULT_CONFIG));
app.use((req,res,next)=> req.path.startsWith("/c/") ? next() : defaultRouter(req,res,next));
app.use("/c/:config",(req,res,next)=> getRouter(buildAddon(decodeConfig(req.params.config)))(req,res,next));

app.listen(PORT,"0.0.0.0",()=>{
  const defaultConfig = encodeConfig(DEFAULT_CONFIG);
  console.log(`AniList API: ${ANILIST_API}`);
  console.log(`AniZip API: ${ANIZIP_API}`);
  console.log(`Configure: http://127.0.0.1:${PORT}/configure`);
  console.log(`Addon: http://127.0.0.1:${PORT}/c/${defaultConfig}/manifest.json`);
});
