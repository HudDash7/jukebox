// ====== PASTE YOUR SUPABASE VALUES HERE ======
const SUPABASE_URL = "https://usoxiobhhbbnezjqxqev.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_CL0za6cO_3xAkc5maldc3w_JF1qucjG";
// =============================================

/* PLAYLISTS NEED THIS TABLE. Run once in Supabase > SQL Editor:

create table public.playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  owner text not null,
  name text not null,
  track_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.playlists enable row level security;
create policy "playlists read"   on public.playlists for select to authenticated using (true);
create policy "playlists insert" on public.playlists for insert to authenticated with check (auth.uid() = user_id);
create policy "playlists update" on public.playlists for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "playlists delete" on public.playlists for delete to authenticated using (auth.uid() = user_id);

COVERS, LYRICS AND LISTEN COUNTER NEED THIS. Run once as well:

alter table public.tracks
  add column if not exists cover_path text,
  add column if not exists lyrics text,
  add column if not exists plays integer not null default 0;

drop policy if exists "tracks update own" on public.tracks;
create policy "tracks update own" on public.tracks for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- anyone signed in can bump a listen count (but nothing else on someone else's track)
create or replace function public.bump_play(tid text)
returns integer language sql security definer set search_path = public as $$
  update public.tracks set plays = plays + 1 where id::text = tid returning plays;
$$;
grant execute on function public.bump_play(text) to authenticated;

ARTIST NAMES NEED THIS. Run once:

alter table public.tracks add column if not exists artist text;

RELEASES (albums, EPs, singles) NEED THIS. Run once:

create table if not exists public.releases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  artist text not null,
  title text not null,
  type text not null default 'album' check (type in ('album', 'ep', 'single')),
  cover_path text,
  description text,
  track_ids jsonb not null default '[]'::jsonb,
  release_date timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.releases enable row level security;
create policy "releases read" on public.releases for select to authenticated using (true);
create policy "releases add own" on public.releases for insert to authenticated with check (auth.uid() = user_id);
create policy "releases edit own" on public.releases for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "releases delete own" on public.releases for delete to authenticated using (auth.uid() = user_id);

FRIENDS (requests + friend activity) NEED THIS. Run once:

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles read" on public.profiles for select to authenticated using (true);
create policy "profiles own insert" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles own update" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create table if not exists public.friendships (
  requester uuid not null references auth.users(id) on delete cascade,
  addressee uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
alter table public.friendships enable row level security;
create policy "friendships mine" on public.friendships for select to authenticated using (auth.uid() in (requester, addressee));
create policy "friendships request" on public.friendships for insert to authenticated with check (auth.uid() = requester and status = 'pending');
create policy "friendships accept" on public.friendships for update to authenticated using (auth.uid() = addressee) with check (auth.uid() = addressee and status = 'accepted');
create policy "friendships remove" on public.friendships for delete to authenticated using (auth.uid() in (requester, addressee));

create table if not exists public.activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  track_id text,
  playing boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.activity enable row level security;
create policy "activity own" on public.activity for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "activity friends read" on public.activity for select to authenticated using (exists (
  select 1 from public.friendships f where f.status = 'accepted' and (
    (f.requester = auth.uid() and f.addressee = activity.user_id) or (f.addressee = auth.uid() and f.requester = activity.user_id))));

STORAGE CHECK (Settings > Storage & downloads) NEEDS THIS to list your own files. Run once:

create policy "music list own files" on storage.objects for select to authenticated
  using (bucket_id = 'music' and (storage.foldername(name))[1] = auth.uid()::text);

FOLLOWING ARTISTS NEEDS THIS. Run once:

create table if not exists public.follows (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  artist_name text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, artist_name)
);
alter table public.follows enable row level security;
create policy "follows read" on public.follows for select to authenticated using (true);
create policy "follows own add" on public.follows for insert to authenticated with check (auth.uid() = user_id);
create policy "follows own remove" on public.follows for delete to authenticated using (auth.uid() = user_id);

LIKED SONGS NEED THIS. Run once:

create table if not exists public.likes (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  track_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, track_id)
);
alter table public.likes enable row level security;
create policy "likes own read" on public.likes for select to authenticated using (auth.uid() = user_id);
create policy "likes own add" on public.likes for insert to authenticated with check (auth.uid() = user_id);
create policy "likes own remove" on public.likes for delete to authenticated using (auth.uid() = user_id);

SONG LENGTHS NEED THIS. Run once:

alter table public.tracks add column if not exists duration integer;

-- lets anyone fill in a length that's still missing (it never changes one that's set)
create or replace function public.set_duration(tid text, sec integer)
returns void language sql security definer set search_path = public as $$
  update public.tracks set duration = sec where id::text = tid and duration is null and sec between 1 and 36000;
$$;
grant execute on function public.set_duration(text, integer) to authenticated;

LEADERBOARD (who listened to what, and when) NEEDS THIS. Run once:

create table if not exists public.listens (
  id bigint generated always as identity primary key,
  track_id text not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  listener text not null,
  seconds integer not null default 0,
  counted boolean not null default true,
  created_at timestamptz not null default now()
);
-- already created the table before "time listened"? run this too:
alter table public.listens add column if not exists seconds integer not null default 0,
  add column if not exists counted boolean not null default true;
alter table public.listens enable row level security;
create policy "listens read" on public.listens for select to authenticated using (true);
create policy "listens insert own" on public.listens for insert to authenticated with check (auth.uid() = user_id);

ARTIST PROFILES (claim an artist, picture, bio) NEED THIS. Run once:

create table if not exists public.artists (
  name text primary key,
  picture_path text,
  bio text,
  claimed_by uuid references auth.users(id) on delete cascade,
  claimed_name text,
  updated_at timestamptz not null default now()
);
alter table public.artists enable row level security;
create policy "artists read" on public.artists for select to authenticated using (true);
-- claim = create the row as yourself, only if you uploaded a song by that artist (first claim wins)
create policy "artists claim" on public.artists for insert to authenticated
  with check (claimed_by = auth.uid() and exists (
    select 1 from public.tracks t where trim(t.artist) = artists.name and t.user_id = auth.uid()));
create policy "artists edit own" on public.artists for update to authenticated
  using (claimed_by = auth.uid()) with check (claimed_by = auth.uid());
create policy "artists release own" on public.artists for delete to authenticated using (claimed_by = auth.uid());

PLAYLIST COVERS NEED THIS. Run once:

alter table public.playlists add column if not exists cover_path text;

-- after adding columns, refresh the API so it sees them right away
notify pgrst, 'reload schema';

JAM (listen together) needs no SQL: it uses Supabase Realtime broadcast + presence.
*/

const $ = (id) => document.getElementById(id);
const APP_BUILD = (document.querySelector('meta[name="budsbox-build"]') || {}).content || "dev"; // set in index.html
async function checkUpdate() {
  try {
    const r = await fetch(location.pathname + "?v=" + Date.now(), { cache: "no-store" });
    const m = (await r.text()).match(/name="budsbox-build" content="([^"]+)"/);
    if (m && m[1] !== APP_BUILD) $("upd").classList.remove("hide");
  } catch (e) {}
}
if (/\.netlify\.app$/.test(location.hostname) || /[?&]nlbadge/.test(location.search)) document.documentElement.classList.add("nl-badge");
const audio = $("audio");
const isTouch = matchMedia("(pointer: coarse)").matches;
let sb, me;
let all = [];        // every track in the library
let lists = [];      // every playlist
let queue = [];      // the list you started from (library, a playlist, or search results)
let userQueue = [];  // "Up next" songs you queued by hand, played before the list continues
let ctxId = null;    // where we are in the list (stays put while queued songs play)
let nowId = null;    // id of the loaded track
let view = "lib";    // "lib" | "pls" | "pl:<playlist id>"
let query = "";      // active search (lowercased); overrides view while non-empty
let shown = [];      // tracks currently on screen (data-i indexes into this)
let pickTrack = null;

/* ---------- layout sizes (player / header height drive the desktop grid) ---------- */
function syncSizes() {
  const r = document.documentElement.style;
  r.setProperty("--ph", ($("player").classList.contains("hide") ? 0 : $("player").offsetHeight) + "px");
  r.setProperty("--hh", $("top").offsetHeight + "px");
  const tb = $("tabbar");
  r.setProperty("--tbh", (tb && !tb.classList.contains("hide") ? tb.offsetHeight : 0) + "px");
}
if ("ResizeObserver" in window) { const ro = new ResizeObserver(syncSizes); ro.observe($("player")); ro.observe($("top")); ro.observe($("tabbar")); }
addEventListener("resize", syncSizes);

/* ---------- Minecraft SFX (synthesized, no audio files) ---------- */
let ac = null;
let sfxOn = (() => { try { return localStorage.getItem("jukebox_sfx") !== "off"; } catch (e) { return true; } })();
if (navigator.audioSession) { try { navigator.audioSession.type = "playback"; } catch (e) {} }
function actx() {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "suspended") ac.resume();
  } catch (e) { ac = null; }
  return ac;
}
function tone(type, f0, f1, dur, vol, delay = 0) {
  if (!sfxOn) return;
  const c = actx(); if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
const sfxClick = () => { tone("triangle", 260, 120, 0.07, 0.12); tone("square", 90, 60, 0.05, 0.04); }; // wooden pop
const sfxDing  = () => { tone("sine", 1320, 1760, 0.12, 0.12); tone("sine", 1760, 2093, 0.18, 0.1, 0.07); }; // XP chime
const sfxDrop  = () => { tone("triangle", 420, 70, 0.28, 0.14); tone("square", 210, 50, 0.22, 0.04); }; // item drop
document.addEventListener("click", (e) => {
  const b = e.target.closest("button, .btn");
  if (b && !b.matches("[data-rm],[data-dpl],[data-qrm],#edDelete")) sfxClick();
}, true);
function paintSfx() { $("sfxBtn").textContent = sfxOn ? "SFX ON" : "SFX OFF"; $("sfxBtn").classList.toggle("go", sfxOn); }
$("sfxBtn").onclick = () => {
  sfxOn = !sfxOn;
  try { localStorage.setItem("jukebox_sfx", sfxOn ? "on" : "off"); } catch (e) {}
  paintSfx();
  if (sfxOn) sfxClick();
};
paintSfx();
$("upd").onclick = () => location.reload();
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkUpdate(); });
setInterval(checkUpdate, 10 * 60 * 1000);
setTimeout(checkUpdate, 5000);

/* ---------- pixel music discs ---------- */
const DISC_COLORS = ["#55ff55", "#ff5555", "#55ffff", "#aa00aa", "#333333"]; // Cat, Chirp, Blocks, Mellohi, Stal
function makeDisc(color) {
  let r = "";
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy);
    if (d > 7.6) continue;
    let c = "#101010", o = 1;
    if (d > 5.4 && Math.atan2(dy, dx) > -2.6 && Math.atan2(dy, dx) < -1.7) c = "#5a5a5a"; // glint, so the spin is visible
    if (d <= 4.6) { c = color; if (dx < -0.5) o = 0.7; }                                   // half-shaded label
    if (d < 1.6) { c = "#1d1f1d"; o = 1; }                                                  // center hole
    r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"${o < 1 ? ` fill-opacity="${o}"` : ""}/>`;
  }
  return r;
}
// FIX: append the discs. Assigning innerHTML wiped the pencil / queue / lyrics icons.
$("defs").insertAdjacentHTML("beforeend", DISC_COLORS.map((c, i) => `<symbol id="disc${i}" viewBox="0 0 16 16">${makeDisc(c)}</symbol>`).join(""));
const hash = (s) => { s = String(s); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
const discHTML = (t) => `<span class="disc"><svg viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><use href="#disc${hash(t.id) % DISC_COLORS.length}"/></svg></span>`;
const coverUrl = (t) => sb.storage.from("music").getPublicUrl(t.cover_path).data.publicUrl;
// a song's picture: its own cover, else the cover of the album/EP it's on
const artUrl = (t) => !t ? "" : t.cover_path ? coverUrl(t) : relCoverUrlFor(t);
const thumbHTML = (t) => artUrl(t)
  ? `<span class="cover"><img src="${artUrl(t)}" alt="" loading="lazy" decoding="async"></span>`
  : discHTML(t);
const curTrack = () => nowId == null ? null : (all.find((x) => x.id === nowId) || queue.find((x) => x.id === nowId) || userQueue.find((x) => x.id === nowId) || null);
const artistOf = (t) => (t.artist && String(t.artist).trim()) || "Unknown artist";

/* ---------- "Added by" credit: off by default, opt-in in settings ---------- */
const AB_KEY = "jukebox_addedby";
const AB_MODES = ["off", "name", "you"];
function abMode() {
  const m = me?.user_metadata?.added_by;
  if (AB_MODES.includes(m)) return m;
  try { const l = localStorage.getItem(AB_KEY); if (AB_MODES.includes(l)) return l; } catch (e) {}
  return "off";
}
function addedBy(t) {
  const m = abMode();
  if (m === "off" || !t) return "";
  if (m === "you" && me && t.user_id === me.id) return "Added by You";
  return "Added by " + (t.uploader || "someone");
}
function paintAb() {
  const m = abMode();
  document.querySelectorAll("#abSeg button").forEach((b) => b.classList.toggle("go", b.dataset.ab === m));
  $("abHint").textContent = m === "off" ? "Hidden." : m === "name" ? "Shows the uploader's name." : "Shows names, \"You\" on your uploads.";
}
async function setAb(v) {
  if (!me || !AB_MODES.includes(v)) return;
  try { localStorage.setItem(AB_KEY, v); } catch (e) {}
  me.user_metadata = { ...(me.user_metadata || {}), added_by: v }; // repaint right away
  paintAb(); drawLists(); setNow();
  // saved on your account so it follows you across devices
  const { data, error } = await sb.auth.updateUser({ data: { added_by: v } });
  if (error) console.warn("Could not save credit setting to account:", error.message);
  else if (data?.user) me = data.user;
}
$("abSeg").onclick = (e) => { const b = e.target.closest("[data-ab]"); if (b) setAb(b.dataset.ab); };

/* ---------- settings dropdown ---------- */
const menuOpen = () => !$("menu").classList.contains("hide");
function toggleMenu(open) {
  $("menu").classList.toggle("hide", !open);
  $("gear").setAttribute("aria-expanded", String(open));
  $("gear").classList.toggle("go", open);
  if (!open) $("nameForm").classList.add("hide");
}
$("gear").onclick = () => toggleMenu(!menuOpen());
document.addEventListener("click", (e) => { if (menuOpen() && !e.target.closest("#menuWrap")) toggleMenu(false); });

/* ---------- overlays ---------- */
const openOv = (id) => $(id).classList.remove("hide");
const isOpen = (id) => !$(id).classList.contains("hide");
function closeOv(id) {
  $(id).classList.add("hide");
  if (id === "modal") { pickTrack = null; if (view !== "lib") drawLists(); }
}
document.querySelectorAll(".overlay").forEach((o) => o.addEventListener("click", (e) => { if (e.target === o) closeOv(o.id); }));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (menuOpen()) { toggleMenu(false); $("gear").focus(); return; }
    if (fullOpen() && !document.querySelector(".overlay:not(.hide)")) { closeFull(); return; }
    if (document.activeElement === $("q") && query) { clearSearch(); drawLists(); return; }
    document.querySelectorAll(".overlay:not(.hide)").forEach((o) => closeOv(o.id));
  }
  // "/" jumps to search (when you're not typing somewhere)
  if (e.key === "/" && me && !e.target.closest("input, textarea") && !document.querySelector(".overlay:not(.hide)")) {
    e.preventDefault(); $("q").focus();
  }
});

/* ---------- spacebar = play / pause (like Spotify) ---------- */
document.addEventListener("keydown", (e) => {
  if (e.code !== "Space" && e.key !== " ") return;
  if (!me || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const el = e.target;
  // typing somewhere: leave the space alone
  if (el.closest && el.closest("input, textarea, select, [contenteditable]")) return;
  // a button a keyboard user tabbed to keeps its normal Space behaviour; one you just clicked doesn't
  const ctl = el.closest && el.closest("button, .btn, [role=button], [role=slider]");
  if (ctl && ctl !== clickedCtl) return;
  e.preventDefault();
  $("play").click();
});
// remember the control last focused by mouse/touch, so Space doesn't re-press it
let clickedCtl = null;
document.addEventListener("pointerdown", (e) => { clickedCtl = e.target.closest ? e.target.closest("button, .btn, [role=button], [role=slider]") : null; }, true);
document.addEventListener("keydown", (e) => { if (e.key === "Tab") clickedCtl = null; }, true);

/* ---------- toast ---------- */
let toastT = 0;
function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.classList.remove("hide");
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.add("hide"), 1800);
}

/* ---------- auth ---------- */
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  $("setup").classList.remove("hide");
} else {
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  sb.auth.onAuthStateChange((event, session) => {
    setUser(session?.user || null);
    if (event === "PASSWORD_RECOVERY") openPw(true); // came back from a reset email
  });
  sb.auth.getSession().then(({ data }) => setUser(data.session?.user || null));
}

// only rebuild the app when the signed-in person actually changes
// FIX: always render the first time. When logged out, "no user" == "no user" meant the login screen never appeared.
let booted = false;
function setUser(u) {
  const changed = !booted || (u?.id || null) !== (me?.id || null);
  booted = true;
  me = u;
  if (changed) render(); else if (me) { paintWho(); paintAb(); }
}

function render() {
  if (me) { loadAppearanceFromAccount(); paintTabs(); }
  $("auth").classList.toggle("hide", !!me);
  $("app").classList.toggle("hide", !me);
  $("tabbar").classList.toggle("hide", !me);
  $("player").classList.toggle("hide", !me);
  $("searchBox").classList.toggle("hide", !me);
  $("menuWrap").classList.toggle("invis", !me);
  toggleMenu(false);
  if (me) { paintWho(); paintAb(); loadAll(); syncProfile().then(loadFriends); }
  else { if (jam.role) jamLeave(true); audio.pause(); nowId = null; ctxId = null; queue = []; userQueue = []; all = []; lists = []; clearSearch(); setNow(); updateQBtn(); }
  syncSizes();
}

const authMsg = (t) => ($("authMsg").textContent = t);
const say = (t) => ($("msg").textContent = t);
$("login").onclick = async () => {
  authMsg("Loading...");
  const { error } = await sb.auth.signInWithPassword({ email: $("email").value.trim(), password: $("pass").value });
  authMsg(error ? error.message : "");
};
$("pass").onkeydown = (e) => { if (e.key === "Enter") $("login").click(); };
$("signup").onclick = async () => {
  authMsg("Loading...");
  const { error } = await sb.auth.signUp({ email: $("email").value.trim(), password: $("pass").value });
  authMsg(error ? error.message : "Account created. Log in now.");
};
/* ---------- song lengths ----------
   Saved on the song when it's uploaded. Older songs: whoever uploaded them fills theirs in
   automatically in the background, and any song you play is remembered on this device. */
let durCache = (() => { try { return JSON.parse(localStorage.getItem("jukebox_dur") || "{}"); } catch (e) { return {}; } })();
const durOf = (t) => (t && (t.duration || durCache[t.id])) || 0;
function rememberDur(t, sec) {
  if (!t || !sec || !isFinite(sec) || t.duration) return;
  sec = Math.round(sec);
  if (durCache[t.id] !== sec) {
    durCache[t.id] = sec; try { localStorage.setItem("jukebox_dur", JSON.stringify(durCache)); } catch (e) {}
    document.querySelectorAll("#lists .trow[data-i]").forEach((el) => { if (shown[+el.dataset.i]?.id === t.id) { const c = el.querySelector(".tdur"); if (c) c.textContent = fmt(sec); } });
  }
  if (durNoCol) return;
  if (t.user_id === me?.id) sb.from("tracks").update({ duration: sec }).eq("id", t.id).then((r) => {
    if (r.error) { if (/duration/i.test(r.error.message || "")) durNoCol = true; } else t.duration = sec;
  });
  else if (!durNoRpc) sb.rpc("set_duration", { tid: String(t.id), sec }).then((r) => {
    if (r.error) durNoRpc = true; else t.duration = sec; // function not set up yet: keep it on this device
  });
}
let durNoRpc = false;
let durNoCol = false, durBusy = false;
async function backfillDurations() {
  if (durBusy || !me || durNoCol) return;
  durBusy = true;
  // your songs first, then everyone else's that are still missing a length
  const todo = all.filter((t) => !t.duration).sort((a, b) => (b.user_id === me.id) - (a.user_id === me.id)).slice(0, 60);
  for (const t of todo) {
    if (durNoCol || !me) break;
    if (durCache[t.id]) { rememberDur(t, durCache[t.id]); continue; }
    const sec = await new Promise((res) => {
      const a = new Audio(); a.preload = "metadata";
      const done = (v) => { a.removeAttribute("src"); a.load(); res(v); };
      a.onloadedmetadata = () => done(isFinite(a.duration) ? a.duration : 0);
      a.onerror = () => done(0);
      setTimeout(() => done(0), 15000);
      a.src = urlFor(t);
    });
    if (sec) rememberDur(t, sec);
  }
  durBusy = false;
  if (todo.length) drawLists();
}

/* ---------- Liked Songs ----------
   Saved to your account (likes table). Until that table exists, likes are kept on this device. */
let liked = new Map(), likesLocal = false;
const isLiked = (t) => !!t && liked.has(String(t.id));
const LIKE_KEY = () => "jukebox_likes_" + (me?.id || "");
async function loadLikes() {
  const { data, error } = await sb.from("likes").select("track_id,created_at").eq("user_id", me.id);
  if (error) {
    likesLocal = /likes|schema cache|does not exist/i.test(error.message || "");
    try { liked = new Map(JSON.parse(localStorage.getItem(LIKE_KEY()) || "[]")); } catch (e) { liked = new Map(); }
  } else { likesLocal = false; liked = new Map((data || []).map((r) => [String(r.track_id), r.created_at])); saveLocalLikes(); } // copy kept for offline
}
const saveLocalLikes = () => { try { localStorage.setItem(LIKE_KEY(), JSON.stringify([...liked])); } catch (e) {} };
async function toggleLike(t) {
  if (!t) return;
  const id = String(t.id), was = liked.has(id);
  if (was) liked.delete(id); else liked.set(id, new Date().toISOString());
  paintLikes(); sfxClick(); saveLocalLikes();
  toast(was ? "Removed from Liked Songs" : "Added to Liked Songs");
  if (likesLocal) return;
  const r = was ? await sb.from("likes").delete().eq("user_id", me.id).eq("track_id", id)
                : await sb.from("likes").insert({ user_id: me.id, track_id: id });
  if (r.error) {
    if (/likes|schema cache|does not exist/i.test(r.error.message || "")) { likesLocal = true; saveLocalLikes(); return; }
    if (was) liked.set(id, new Date().toISOString()); else liked.delete(id); // undo
    paintLikes(); say(r.error.message);
  }
}
const likedTracks = () => [...liked.entries()].sort((a, b) => String(b[1]).localeCompare(String(a[1]))).map(([id]) => all.find((t) => String(t.id) === id)).filter(Boolean);
function paintLikes() {
  const t = curTrack();
  for (const id of ["pLike", "fLike", "npLike"]) {
    const b = $(id), on = isLiked(t);
    b.classList.toggle("on", on); b.classList.toggle("invis", !t);
    b.setAttribute("aria-pressed", String(on)); b.title = on ? "Remove from Liked Songs" : "Add to Liked Songs";
    b.querySelector("use").setAttribute("href", on ? "#ic-heart-f" : "#ic-heart");
  }
  document.querySelectorAll("#lists [data-like]").forEach((b) => {
    const on = isLiked(shown[+b.dataset.like]);
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
    b.querySelector("use").setAttribute("href", on ? "#ic-heart-f" : "#ic-heart");
  });
  $("navLikedN").textContent = liked.size || "";
  if (view === "liked") drawLists();
}
for (const id of ["pLike", "fLike", "npLike"]) $(id).onclick = () => toggleLike(curTrack());
$("navLiked").onclick = () => go("liked");

/* ---------- sleep timer ---------- */
const sleep = { at: 0, endOfSong: false };
function setSleep(opt) {
  sleep.at = 0; sleep.endOfSong = false;
  if (opt === "end") sleep.endOfSong = true;
  else if (opt) sleep.at = Date.now() + opt * 60000;
  paintSleep();
}
function sleepLeft() { return sleep.at ? Math.max(0, Math.ceil((sleep.at - Date.now()) / 60000)) : 0; }
function paintSleep() {
  const on = !!(sleep.at || sleep.endOfSong);
  const label = sleep.endOfSong ? "End of song" : sleep.at ? sleepLeft() + " min" : "";
  $("sleepBtn").classList.toggle("on", on); $("sleepBtn").title = on ? "Sleep timer: " + label : "Sleep timer";
  $("fSleep").classList.toggle("go", on); $("fSleepTxt").textContent = on ? label : "Sleep";
  $("sleepNow").textContent = on ? "· " + (sleep.endOfSong ? "stops at the end of this song" : "stops in " + label) : "";
  const opts = [[5, "5 minutes"], [15, "15 minutes"], [30, "30 minutes"], [45, "45 minutes"], [60, "1 hour"], ["end", "End of song"]];
  $("sleepOpts").innerHTML = opts.map(([v, l]) => `<button class="sheetopt sleepopt" data-sleep="${v}">${l}</button>`).join("") +
    (on ? '<button class="sheetopt sleepopt" data-sleep="off"><b>Turn off timer</b></button>' : "");
}
$("sleepOpts").onclick = (e) => {
  const b = e.target.closest("[data-sleep]"); if (!b) return;
  const v = b.dataset.sleep;
  setSleep(v === "off" ? null : v === "end" ? "end" : +v);
  closeOv("sleepSheet");
  toast(v === "off" ? "Sleep timer off" : v === "end" ? "Music will stop after this song" : `Music will stop in ${b.textContent}`);
};
const openSleep = () => { paintSleep(); openOv("sleepSheet"); };
$("sleepBtn").onclick = openSleep; $("fSleep").onclick = openSleep;
setInterval(() => {
  if (sleep.at && Date.now() >= sleep.at) { setSleep(null); if (!audio.paused) { pauseByUser(); toast("Sleep timer: music paused"); } }
  else if (sleep.at) paintSleep();
}, 1000);
paintSleep();

/* ---------- Recently played (kept on this device) ---------- */
const RECENT_KEY = () => "jukebox_recent_" + (me?.id || "");
function getRecent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY()) || "[]"); } catch (e) { return []; } }
function rememberRecent(k) {
  if (!me || !k) return;
  const r = [k, ...getRecent().filter((x) => x !== k)].slice(0, 12);
  try { localStorage.setItem(RECENT_KEY(), JSON.stringify(r)); } catch (e) {}
}
// a tile for each recent item that still exists
function recentTiles() {
  const tiles = [];
  for (const k of getRecent()) {
    let art = "", name = "", round = false;
    if (k === "liked") { art = '<span class="likedtile"><svg viewBox="0 0 9 9" shape-rendering="crispEdges" aria-hidden="true"><use href="#ic-heart-f"/></svg></span>'; name = "Liked Songs"; }
    else if (k.startsWith("pl:")) { const p = lists.find((x) => x.id === k.slice(3)); if (!p) continue; art = plArtHTML(p); name = p.name; }
    else if (k.startsWith("ar:")) { const n = k.slice(3); if (!songsBy(n).length) continue; art = artistArt(n); name = n; round = true; }
    else if (k.startsWith("rel:")) { const r = releases.find((x) => String(x.id) === k.slice(4)); if (!r) continue; art = relArt(r); name = r.title; }
    else if (k.startsWith("t:")) { const t = all.find((x) => String(x.id) === k.slice(2)); if (!t) continue; art = thumbHTML(t); name = t.title; }
    tiles.push(`<button class="rtile" data-recent="${esc(k)}" title="${esc(name)}"><span class="rart${round ? " round" : ""}">${art}</span><span class="rname">${esc(name)}</span></button>`);
    if (tiles.length >= 8) break;
  }
  return tiles.length ? `<h2 class="sech">Recently played</h2><div class="recent">${tiles.join("")}</div>` : "";
}
function openRecent(k) {
  if (k === "liked") return go("liked");
  if (k.startsWith("pl:")) return go(k);
  if (k.startsWith("ar:")) return goArtist(k.slice(3));
  if (k.startsWith("rel:")) return go(k);
  const t = all.find((x) => String(x.id) === k.slice(2));
  if (t) { ctxName = "Library"; rememberRecent(k); playTrack(t, sorted(all)); drawLists(); }
}

/* ---------- following artists ---------- */
let follows = new Map(), followerCount = new Map(), followsLocal = false;
const FOLLOW_KEY = () => "jukebox_follows_" + (me?.id || "");
const isFollowing = (name) => follows.has(name);
async function loadFollows() {
  const { data, error } = await sb.from("follows").select("user_id,artist_name,created_at");
  followerCount = new Map();
  if (error) {
    followsLocal = /follows|schema cache|does not exist/i.test(error.message || "");
    try { follows = new Map(JSON.parse(localStorage.getItem(FOLLOW_KEY()) || "[]")); } catch (e) { follows = new Map(); }
    return;
  }
  followsLocal = false; follows = new Map();
  for (const r of data || []) {
    followerCount.set(r.artist_name, (followerCount.get(r.artist_name) || 0) + 1);
    if (r.user_id === me.id) follows.set(r.artist_name, r.created_at);
  }
}
async function toggleFollow(name) {
  const was = follows.has(name);
  if (was) { follows.delete(name); followerCount.set(name, Math.max(0, (followerCount.get(name) || 1) - 1)); }
  else { follows.set(name, new Date().toISOString()); followerCount.set(name, (followerCount.get(name) || 0) + 1); }
  drawLists(); sfxClick(); toast(was ? "Unfollowed " + name : "Following " + name);
  if (followsLocal) { try { localStorage.setItem(FOLLOW_KEY(), JSON.stringify([...follows])); } catch (e) {} return; }
  const r = was ? await sb.from("follows").delete().eq("user_id", me.id).eq("artist_name", name)
                : await sb.from("follows").insert({ user_id: me.id, artist_name: name });
  if (r.error) {
    if (/follows|schema cache|does not exist/i.test(r.error.message || "")) { followsLocal = true; try { localStorage.setItem(FOLLOW_KEY(), JSON.stringify([...follows])); } catch (e) {} return; }
    await loadFollows(); drawLists(); say(r.error.message);
  }
}
// Home: songs from artists you follow added in the last 2 weeks
function newFromFollowed() {
  if (!follows.size) return "";
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const fresh = all.filter((t) => hasArtist(t) && follows.has(artistOf(t)) && String(t.created_at || "") > since)
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))).slice(0, 6);
  if (!fresh.length) return "";
  return '<h2 class="sech">New from artists you follow</h2><div class="recent">' + fresh.map((t) =>
    `<button class="rtile" data-recent="t:${esc(t.id)}" title="${esc(t.title)}"><span class="rart">${thumbHTML(t)}</span><span class="rname">${esc(t.title)}<br><span class="sub">${esc(artistOf(t))} · ${esc(ago(t.created_at))}</span></span></button>`).join("") + "</div>";
}
// a heads-up when something new arrived since your last visit
function noteNewFromFollowed() {
  const key = "jukebox_seen_" + me.id;
  let last = ""; try { last = localStorage.getItem(key) || ""; } catch (e) {}
  try { localStorage.setItem(key, new Date().toISOString()); } catch (e) {}
  if (!last || !follows.size) return;
  const n = all.filter((t) => hasArtist(t) && follows.has(artistOf(t)) && String(t.created_at || "") > last && t.user_id !== me.id).length;
  if (n) setTimeout(() => toast(`${n} new song${n === 1 ? "" : "s"} from artists you follow`), 1200);
}

/* ---------- Wrapped: your listening recap ---------- */
let wrapPeriod = "month";
function wrapStats(period) {
  const now = new Date();
  const from = period === "month" ? new Date(now.getFullYear(), now.getMonth(), 1) : period === "year" ? new Date(now.getFullYear(), 0, 1) : new Date(0);
  const iso = from.toISOString();
  const rows = (lb.rows || []).filter((r) => String(r.created_at) >= iso);
  const byId = new Map(all.map((t) => [String(t.id), t]));
  const mine = rows.filter((r) => r.user_id === me.id && byId.has(String(r.track_id)));
  const secBySong = new Map(), secByArtist = new Map(), secByDay = new Map(), songs = new Set();
  let sec = 0, listens = 0;
  for (const r of mine) {
    const s = +r.seconds || 0, t = byId.get(String(r.track_id));
    sec += s; if (r.counted !== false) listens++;
    songs.add(t.id);
    secBySong.set(t.id, (secBySong.get(t.id) || 0) + s);
    if (hasArtist(t)) secByArtist.set(artistOf(t), (secByArtist.get(artistOf(t)) || 0) + s);
    const d = String(r.created_at).slice(0, 10); secByDay.set(d, (secByDay.get(d) || 0) + s);
  }
  const top = (m, n) => [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n);
  const topSongs = top(secBySong, 5).map(([id, s]) => ({ t: all.find((x) => x.id === id), s }));
  const [topArtist] = top(secByArtist, 1);
  // where you rank among everyone, overall and for your top artist
  const everyone = new Map(), onArtist = new Map();
  for (const r of rows) {
    const t = byId.get(String(r.track_id)); if (!t) continue;
    const s = +r.seconds || 0;
    everyone.set(r.user_id, (everyone.get(r.user_id) || 0) + s);
    if (topArtist && hasArtist(t) && artistOf(t) === topArtist[0]) onArtist.set(r.user_id, (onArtist.get(r.user_id) || 0) + s);
  }
  const rankOf = (m) => { const list = [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]); const i = list.findIndex(([u]) => u === me.id); return i < 0 ? null : { rank: i + 1, of: list.length }; };
  const [bigDay] = top(secByDay, 1);
  return { sec, listens, songs: songs.size, topSongs, topArtist, overall: rankOf(everyone), fan: topArtist ? rankOf(onArtist) : null, bigDay };
}
function renderWrap() {
  document.querySelectorAll("#wrapTabs button").forEach((b) => { const on = b.dataset.wp === wrapPeriod; b.classList.toggle("go", on); b.setAttribute("aria-selected", String(on)); });
  const box = $("wrapBody");
  if (!lb.rows) { box.innerHTML = '<div class="empty">Loading...</div>'; return; }
  if (lb.noTable || lb.oldSchema) { box.innerHTML = '<div class="empty">Wrapped uses your listening time. Run the "LEADERBOARD" SQL from the top of js/app.js in Supabase first (including the seconds/counted columns).</div>'; return; }
  const w = wrapStats(wrapPeriod);
  const label = { month: new Date().toLocaleString(undefined, { month: "long" }), year: String(new Date().getFullYear()), all: "all time" }[wrapPeriod];
  if (!w.sec && !w.listens) { box.innerHTML = `<div class="empty">No listening recorded for ${esc(label)} yet. Press play and come back!</div>`; return; }
  const ord = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th");
  let h = `<div class="wcard w1"><div class="wsmall">${esc(label === "all time" ? "All time" : label)}, you listened for</div><div class="wbig">${Math.round(w.sec / 60).toLocaleString()} minutes</div>
    <div class="wsmall">${w.listens} listen${w.listens === 1 ? "" : "s"} · ${w.songs} different song${w.songs === 1 ? "" : "s"}</div></div>`;
  if (w.topSongs.length) h += `<div class="wcard w2"><div class="wsmall">Your top songs</div>${w.topSongs.map((x, i) => `<div class="wrow"><span class="wn">${i + 1}</span>${thumbHTML(x.t)}<span class="meta"><span class="t">${esc(x.t.title)}</span><span class="by">${esc(artistOf(x.t))} · ${fmtLong(x.s)}</span></span></div>`).join("")}</div>`;
  if (w.topArtist) h += `<div class="wcard w3"><div class="wsmall">Your top artist</div><div class="wart">${artistArt(w.topArtist[0])}</div><div class="wbig">${esc(w.topArtist[0])}</div>
    <div class="wsmall">${fmtLong(w.topArtist[1])} together${w.fan ? (w.fan.rank === 1 ? ` · you're their #1 listener on Budsbox!` : ` · you're their ${ord(w.fan.rank)} biggest listener`) : ""}</div></div>`;
  if (w.overall) h += `<div class="wcard w4"><div class="wsmall">Among everyone on Budsbox</div><div class="wbig">${ord(w.overall.rank)} of ${w.overall.of}</div><div class="wsmall">for time listened</div></div>`;
  if (w.bigDay) h += `<div class="wcard w5"><div class="wsmall">Your biggest day</div><div class="wbig">${esc(new Date(w.bigDay[0] + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }))}</div><div class="wsmall">${fmtLong(w.bigDay[1])} of music</div></div>`;
  box.innerHTML = h;
}
async function openWrap() {
  toggleMenu(false); renderWrap(); openOv("wrapModal");
  await lbLoad(true); if (isOpen("wrapModal")) renderWrap();
}
$("wrapOpen").onclick = openWrap;
$("wrapClose").onclick = () => closeOv("wrapModal");
$("wrapTabs").onclick = (e) => { const b = e.target.closest("[data-wp]"); if (b) { wrapPeriod = b.dataset.wp; renderWrap(); } };

/* ---------- offline: downloads + saved library ----------
   Downloading a playlist (or Liked Songs) saves its songs and covers in this device's cache;
   sw.js plays them from there. The library itself is also saved so the app opens offline. */
const AUDIO_CACHE = "budsbox-audio";
const OFFLINE_KEY = () => "jukebox_offline_" + (me?.id || "");
const DATA_KEY = () => "jukebox_data_" + (me?.id || "");
let offlineIds = new Set(), dlBusy = false;
function saveOfflineData(tracks, playlists, artists, rels) {
  try {
    const prev = readOfflineData() || {};
    localStorage.setItem(DATA_KEY(), JSON.stringify({ tracks, playlists: playlists || prev.playlists || [], artists: artists || prev.artists || [], releases: rels || prev.releases || [], at: Date.now() }));
  } catch (e) {}
}
function readOfflineData() { try { return JSON.parse(localStorage.getItem(DATA_KEY()) || "null"); } catch (e) { return null; } }
const getDownloads = () => { try { return JSON.parse(localStorage.getItem(OFFLINE_KEY()) || "[]"); } catch (e) { return []; } };
const setDownloads = (a) => { try { localStorage.setItem(OFFLINE_KEY(), JSON.stringify(a)); } catch (e) {} };
const isDownloadedSet = (k) => getDownloads().includes(k);
const isDownloaded = (t) => !!t && offlineIds.has(String(t.id));
const canDownload = () => "caches" in window && "serviceWorker" in navigator;
function tracksFor(k) {
  if (k === "liked") return likedTracks();
  if (k.startsWith("rel:")) { const r = releases.find((x) => String(x.id) === k.slice(4)); return r ? relTracks(r) : []; }
  const p = lists.find((x) => x.id === k.slice(3));
  return p ? p.track_ids.map((id) => all.find((t) => t.id === id)).filter(Boolean) : [];
}
const filesFor = (t) => [urlFor(t), ...(t.cover_path ? [coverUrl(t)] : [])];
function dlButton(k) {
  if (!canDownload()) return "";
  const on = isDownloadedSet(k);
  return `<button class="rbtn hbtn dlbtn${on ? " on" : ""}" data-dl="${esc(k)}" aria-pressed="${on}" aria-label="${on ? "Remove download" : "Download"}" title="${on ? "Downloaded — tap to remove from this device" : "Download to play offline"}">${ICON("ic-dl")}</button>`;
}
async function refreshOfflineIds() {
  if (!("caches" in window)) return;
  try {
    const keys = new Set((await (await caches.open(AUDIO_CACHE)).keys()).map((r) => r.url));
    offlineIds = new Set(all.filter((t) => keys.has(urlFor(t))).map((t) => String(t.id)));
  } catch (e) {}
}
async function downloadTracks(tracks, label) {
  const cache = await caches.open(AUDIO_CACHE);
  const have = new Set((await cache.keys()).map((r) => r.url));
  const todo = tracks.filter((t) => !have.has(urlFor(t)));
  let n = 0, failed = 0;
  for (const t of todo) {
    n++; if (label) toast(`Downloading ${n} of ${todo.length}: ${t.title}`);
    for (const u of filesFor(t)) {
      if (have.has(u)) continue;
      try { const r = await fetch(u, { mode: "cors" }); if (!r.ok) throw new Error(r.status); await cache.put(u, r); have.add(u); }
      catch (e) { failed++; }
    }
    offlineIds.add(String(t.id));
  }
  return { count: todo.length, failed };
}
async function toggleDownload(k) {
  if (!canDownload()) { toast("This browser can't save music for offline"); return; }
  if (dlBusy) { toast("A download is already running"); return; }
  const list = getDownloads();
  if (list.includes(k)) {
    setDownloads(list.filter((x) => x !== k));
    await pruneDownloads(); drawLists(); toast("Removed from this device");
    return;
  }
  setDownloads([...list, k]); drawLists();
  dlBusy = true;
  const r = await downloadTracks(tracksFor(k), true);
  dlBusy = false;
  drawLists();
  toast(r.failed ? `Downloaded, but ${r.failed} file${r.failed === 1 ? "" : "s"} failed — try again later` : r.count ? "Downloaded — ready to play offline" : "Already downloaded");
}
// keep downloads in step: new songs in a downloaded playlist get saved, removed ones get cleaned up
async function syncDownloads() {
  if (!canDownload() || dlBusy || !navigator.onLine) { await refreshOfflineIds(); return; }
  const keys = getDownloads(); if (!keys.length) { await refreshOfflineIds(); return; }
  dlBusy = true;
  const want = [...new Map(keys.flatMap(tracksFor).map((t) => [t.id, t])).values()];
  await downloadTracks(want, false);
  dlBusy = false;
  await pruneDownloads();
  if (document.querySelector("#lists .trow")) drawLists();
}
async function pruneDownloads() {
  if (!("caches" in window)) return;
  const keep = new Set(getDownloads().flatMap(tracksFor).flatMap(filesFor));
  const cache = await caches.open(AUDIO_CACHE);
  for (const r of await cache.keys()) if (!keep.has(r.url)) await cache.delete(r);
  await refreshOfflineIds();
}
async function downloadsSize() {
  if (!("caches" in window)) return { files: 0, bytes: 0 };
  const cache = await caches.open(AUDIO_CACHE); let bytes = 0, files = 0;
  for (const r of await cache.keys()) { const res = await cache.match(r); if (res) { bytes += (await res.clone().blob()).size; files++; } }
  return { files, bytes };
}
function paintOnline() { document.body.classList.toggle("offline", !navigator.onLine); }
addEventListener("online", () => { paintOnline(); if (me) loadAll(); });
addEventListener("offline", paintOnline);
paintOnline();
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});

/* ---------- storage check + cleanup ----------
   Lists the files in your own folder, adds up their size, and finds ones nothing uses any more
   (left behind when a cover was replaced or an upload was interrupted). Only your folder is touched. */
let storeUnused = [];
const STORAGE_POLICY_SQL = "create policy \"music list own files\" on storage.objects for select to authenticated using (bucket_id = 'music' and (storage.foldername(name))[1] = auth.uid()::text);";
async function listMyFiles() {
  const out = []; let offset = 0;
  for (;;) {
    const { data, error } = await sb.storage.from("music").list(me.id, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    out.push(...(data || []).filter((f) => f && f.name && f.id !== null));
    if (!data || data.length < 1000) break;
    offset += 1000;
  }
  return out;
}
async function openStorage() {
  toggleMenu(false); openOv("storeModal");
  $("storeMsg").textContent = ""; $("storeClean").classList.add("hide"); $("storeClearDl").classList.add("hide");
  $("storeCloud").textContent = "Checking..."; $("storeLocal").textContent = "Checking...";
  const local = await downloadsSize();
  $("storeLocal").textContent = local.files ? `${mb(local.bytes)} in ${local.files} file${local.files === 1 ? "" : "s"} (${offlineIds.size} song${offlineIds.size === 1 ? "" : "s"})` : "Nothing downloaded yet. Use ↓ on a playlist or Liked Songs.";
  $("storeClearDl").classList.toggle("hide", !local.files);
  let files;
  try { files = await listMyFiles(); }
  catch (e) {
    $("storeCloud").innerHTML = "Couldn't list your files. To allow it, run this once in Supabase &gt; SQL Editor:<br><br><code>" + esc(STORAGE_POLICY_SQL) + "</code>";
    return;
  }
  const used = new Set();
  for (const t of all) { used.add(t.path); if (t.cover_path) used.add(t.cover_path); }
  for (const p of lists) if (p.cover_path) used.add(p.cover_path);
  for (const r of releases) if (r.cover_path) used.add(r.cover_path);
  for (const r of artistInfo.values()) if (r.picture_path) used.add(r.picture_path);
  if (appearance.photo) used.add(appearance.photo);
  const recent = Date.now() - 15 * 60000; // skip files from uploads that may still be finishing
  const size = (f) => +(f.metadata && f.metadata.size) || 0;
  const total = files.reduce((n, f) => n + size(f), 0);
  storeUnused = files.filter((f) => !used.has(`${me.id}/${f.name}`) && Date.parse(f.created_at || 0) < recent);
  const waste = storeUnused.reduce((n, f) => n + size(f), 0);
  $("storeCloud").textContent = `You're using ${mb(total)} in ${files.length} file${files.length === 1 ? "" : "s"}.` +
    (storeUnused.length ? ` ${storeUnused.length} unused file${storeUnused.length === 1 ? "" : "s"} (${mb(waste)}) can be deleted.` : " Nothing unused — all tidy.");
  $("storeClean").classList.toggle("hide", !storeUnused.length);
  $("storeClean").textContent = `Delete ${storeUnused.length} unused file${storeUnused.length === 1 ? "" : "s"}`;
}
$("storeOpen").onclick = openStorage;
$("storeClose").onclick = () => closeOv("storeModal");
$("storeClean").onclick = async () => {
  if (!storeUnused.length || !confirm(`Delete ${storeUnused.length} unused file${storeUnused.length === 1 ? "" : "s"}? Nothing in Budsbox uses them.`)) return;
  const paths = storeUnused.map((f) => `${me.id}/${f.name}`);
  let failed = 0;
  for (let i = 0; i < paths.length; i += 100) { const { error } = await sb.storage.from("music").remove(paths.slice(i, i + 100)); if (error) failed++; }
  $("storeMsg").textContent = failed ? "Some files couldn't be deleted." : "Cleaned up.";
  sfxDrop(); openStorage();
};
$("storeClearDl").onclick = async () => {
  if (!confirm("Remove all downloaded music from this device? It stays in Budsbox; you just won't have it offline.")) return;
  setDownloads([]); try { await caches.delete(AUDIO_CACHE); } catch (e) {}
  offlineIds = new Set(); drawLists(); openStorage(); toast("Downloads removed");
};

/* ---------- appearance: background + accent colour ----------
   Saved on this device right away, and on your account so it follows you. */
const APPEAR_KEY = "jukebox_appearance";
const APPEAR_DEFAULT = { bg: "black", photo: null, dim: 55, blur: false, accent: "green" };
const ACCENTS = {
  green: ["#5a9e32", "#3f7522", "#9be35a"], blue: ["#2f7bd0", "#1f5a9e", "#7cc0ff"], purple: ["#8a4fd0", "#64359e", "#c9a2ff"],
  pink: ["#d04f8f", "#9e3569", "#ffa2cf"], gold: ["#c79a1a", "#946f0c", "#fcdb5b"],
};
let appearance = (() => { try { return { ...APPEAR_DEFAULT, ...JSON.parse(localStorage.getItem(APPEAR_KEY) || "{}") }; } catch (e) { return { ...APPEAR_DEFAULT }; } })();
const bgPhotoUrl = (p) => !p ? "" : p.startsWith("data:") || p.startsWith("blob:") ? p : sb ? sb.storage.from("music").getPublicUrl(p).data.publicUrl : "";
function applyAppearance() {
  const a = appearance, h = document.documentElement;
  const bg = a.bg === "photo" && !a.photo ? "black" : a.bg;
  for (const k of ["black", "classic", "forest", "photo"]) h.classList.toggle("bg-" + k, bg === k);
  const url = bg === "photo" ? bgPhotoUrl(a.photo) : "";
  $("bgLayer").style.backgroundImage = url ? `url("${url}")` : "";
  $("bgLayer").classList.toggle("blur", !!a.blur);
  h.style.setProperty("--bgdim", String((+a.dim || 0) / 100));
  const c = ACCENTS[a.accent] || ACCENTS.green;
  h.style.setProperty("--grass", c[0]); h.style.setProperty("--grass-d", c[1]); h.style.setProperty("--gold", c[2]);
  const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.setAttribute("content", c[0]);
}
let appearT = 0;
function saveAppearance() {
  try { localStorage.setItem(APPEAR_KEY, JSON.stringify(appearance)); } catch (e) {}
  applyAppearance(); paintAppearance();
  clearTimeout(appearT);
  appearT = setTimeout(async () => {
    if (!me) return;
    const { data, error } = await sb.auth.updateUser({ data: { appearance } });
    if (!error && data?.user) me = data.user;
  }, 700);
}
// when you log in, your account's look wins over this device's
function loadAppearanceFromAccount() {
  const a = me?.user_metadata?.appearance;
  if (a && typeof a === "object") { appearance = { ...APPEAR_DEFAULT, ...a }; try { localStorage.setItem(APPEAR_KEY, JSON.stringify(appearance)); } catch (e) {} }
  applyAppearance();
}
function paintAppearance() {
  const a = appearance;
  document.querySelectorAll("#bgChoices [data-bg]").forEach((b) => { const on = b.dataset.bg === a.bg; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); });
  document.querySelectorAll("#accents [data-accent]").forEach((b) => { const on = b.dataset.accent === a.accent; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); });
  $("photoOpts").classList.toggle("hide", a.bg !== "photo");
  $("bgNoPhoto").classList.toggle("hide", !a.photo);
  $("bgPhotoSw").style.backgroundImage = a.photo ? `url("${bgPhotoUrl(a.photo)}")` : "";
  $("bgDim").value = a.dim; $("bgDimV").textContent = a.dim + "%";
  $("bgBlur").checked = !!a.blur;
}
// keep the photo's shape (not square), long side up to 1600px
function resizeBg(file, max = 1600) {
  return new Promise((res, rej) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      c.toBlob((b) => (b ? res(b) : rej(new Error("Could not read that image"))), "image/jpeg", 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(u); rej(new Error("That file isn't an image")); };
    img.src = u;
  });
}
$("appearOpen").onclick = () => { toggleMenu(false); $("appearMsg").textContent = ""; paintAppearance(); openOv("appearModal"); };
$("appearClose").onclick = () => closeOv("appearModal");
$("appearReset").onclick = () => { const old = appearance.photo; appearance = { ...APPEAR_DEFAULT }; saveAppearance(); if (old && !old.startsWith("data:")) sb.storage.from("music").remove([old]); toast("Back to the default look"); };
$("bgChoices").onclick = (e) => {
  const b = e.target.closest("[data-bg]"); if (!b) return;
  appearance.bg = b.dataset.bg; saveAppearance();
  if (b.dataset.bg === "photo" && !appearance.photo) $("bgImg").click(); // pick one straight away
};
$("accents").onclick = (e) => { const b = e.target.closest("[data-accent]"); if (b) { appearance.accent = b.dataset.accent; saveAppearance(); } };
$("bgDim").oninput = () => { appearance.dim = +$("bgDim").value; $("bgDimV").textContent = appearance.dim + "%"; applyAppearance(); };
$("bgDim").onchange = () => saveAppearance();
$("bgBlur").onchange = () => { appearance.blur = $("bgBlur").checked; saveAppearance(); };
$("bgImg").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = "";
  if (!f) return;
  $("appearMsg").textContent = "Uploading photo...";
  try {
    const blob = await resizeBg(f);
    // show it right away while it uploads
    const preview = URL.createObjectURL(blob);
    $("bgLayer").style.backgroundImage = `url("${preview}")`; document.documentElement.classList.add("bg-photo");
    const path = `${me.id}/bg_${Date.now()}.jpg`;
    const up = await sb.storage.from("music").upload(path, blob, { contentType: "image/jpeg" });
    if (up.error) throw new Error("Upload failed: " + up.error.message);
    const old = appearance.photo;
    appearance.photo = path; appearance.bg = "photo"; saveAppearance();
    if (old && old !== path && !old.startsWith("data:")) sb.storage.from("music").remove([old]);
    $("appearMsg").textContent = "";
    setTimeout(() => URL.revokeObjectURL(preview), 5000);
  } catch (err) { $("appearMsg").textContent = err.message; applyAppearance(); }
};
$("bgNoPhoto").onclick = () => {
  const old = appearance.photo; appearance.photo = null; appearance.bg = "black"; saveAppearance();
  if (old && !old.startsWith("data:")) sb.storage.from("music").remove([old]);
};
applyAppearance();

/* ---------- friends + friend activity ----------
   profiles: everyone's display name (so friends can be found)
   friendships: requests and accepted friends
   activity: what you're playing; only you and accepted friends can read it */
const fr = { rows: [], names: new Map(), act: new Map(), noTable: false, loaded: false };
let frShare = (() => { try { return localStorage.getItem("jukebox_share") !== "off"; } catch (e) { return true; } })();
const FR_TABLES = /profiles|friendships|activity|schema cache|does not exist/i;
const otherOf = (r) => (r.requester === me.id ? r.addressee : r.requester);
function frStatus(uid) {
  const r = fr.rows.find((x) => otherOf(x) === uid);
  if (!r) return null;
  if (r.status === "accepted") return "friend";
  return r.requester === me.id ? "sent" : "received";
}
const friendIds = () => fr.rows.filter((r) => r.status === "accepted").map(otherOf);
const frName = (uid) => fr.names.get(uid) || "Player";
const frInitial = (uid) => (frName(uid).trim()[0] || "?").toUpperCase();
async function syncProfile() {
  if (!me) return;
  const r = await sb.from("profiles").upsert({ id: me.id, name: myName(), updated_at: new Date().toISOString() });
  if (r.error && FR_TABLES.test(r.error.message || "")) fr.noTable = true;
}
async function loadFriends() {
  if (!me) return;
  const f = await sb.from("friendships").select("*");
  if (f.error) { fr.noTable = FR_TABLES.test(f.error.message || ""); fr.loaded = true; paintFriends(); return; }
  fr.noTable = false;
  fr.rows = (f.data || []).filter((r) => r.requester === me.id || r.addressee === me.id);
  const ids = [...new Set(fr.rows.map(otherOf))];
  if (ids.length) {
    const p = await sb.from("profiles").select("id,name").in("id", ids);
    for (const x of (p.data || [])) fr.names.set(x.id, x.name);
  }
  const fids = friendIds();
  fr.act = new Map();
  if (fids.length) {
    const a = await sb.from("activity").select("*").in("user_id", fids);
    for (const x of (a.data || [])) if (fids.includes(x.user_id)) fr.act.set(x.user_id, x);
  }
  fr.loaded = true;
  paintFriends();
  if (view === "lib" && !query) drawLists();
}
// "listening now" if they're playing and their app checked in within the last few minutes
const isLive = (a) => a && a.playing && a.track_id && Date.now() - Date.parse(a.updated_at) < 5 * 60000;
function paintFriends() {
  const incoming = fr.rows.filter((r) => r.status === "pending" && r.addressee === me.id).length;
  document.querySelectorAll(".frbadge").forEach((b) => { b.textContent = incoming || ""; b.classList.toggle("hide", !incoming); });
  if (!isOpen("friendsModal")) return;
  $("frSetup").classList.toggle("hide", !fr.noTable);
  $("frBody").classList.toggle("hide", fr.noTable);
  $("frShare").checked = frShare;
  if (fr.noTable) return;
  // activity, most recent first
  const fids = friendIds().sort((a, b) => String(fr.act.get(b)?.updated_at || "").localeCompare(String(fr.act.get(a)?.updated_at || "")));
  $("frActivity").innerHTML = fids.length ? fids.map((uid) => {
    const a = fr.act.get(uid), t = a && a.track_id ? all.find((x) => String(x.id) === String(a.track_id)) : null, live = isLive(a);
    return `<div class="frrow"><span class="frav${live ? " live" : ""}">${esc(frInitial(uid))}</span>
      <span class="meta${t ? " frsong" : ""}" ${t ? `data-frplay="${esc(t.id)}" role="button" tabindex="0" title="Play ${esc(t.title)}"` : ""}><span class="t">${esc(frName(uid))}</span>
      <span class="by">${t ? `${esc(t.title)} · ${esc(artistOf(t))}` : "Nothing played yet"}</span></span>
      <span class="frwhen${live ? " live" : ""}">${live ? "● Listening now" : a && a.updated_at ? esc(ago(a.updated_at)) : ""}</span></div>`;
  }).join("") : '<div class="sub">No friends yet. Search for someone below to add them.</div>';
  const reqs = fr.rows.filter((r) => r.status === "pending");
  $("frReqWrap").classList.toggle("hide", !reqs.length);
  $("frRequests").innerHTML = reqs.map((r) => {
    const uid = otherOf(r), mine = r.requester === me.id;
    return `<div class="frrow"><span class="frav">${esc(frInitial(uid))}</span><span class="meta"><span class="t">${esc(frName(uid))}</span><span class="by">${mine ? "Request sent" : "Wants to be friends"}</span></span>
      ${mine ? `<button data-frcancel="${uid}">Cancel</button>` : `<button class="go" data-fraccept="${uid}">Accept</button><button data-frdecline="${uid}">Decline</button>`}</div>`;
  }).join("");
  const fl = friendIds();
  $("frListWrap").classList.toggle("hide", !fl.length);
  $("frList").innerHTML = fl.map((uid) => `<div class="frrow"><span class="frav">${esc(frInitial(uid))}</span><span class="meta"><span class="t">${esc(frName(uid))}</span></span><button class="del" data-frremove="${uid}">Remove</button></div>`).join("");
}
let frSearchT = 0;
$("frSearch").addEventListener("input", () => {
  clearTimeout(frSearchT);
  frSearchT = setTimeout(async () => {
    const q = $("frSearch").value.trim();
    if (q.length < 2) { $("frResults").innerHTML = ""; return; }
    const { data, error } = await sb.from("profiles").select("id,name").ilike("name", `%${q.replace(/[%_]/g, "")}%`).limit(20);
    if (error) { $("frResults").innerHTML = `<div class="sub">${esc(error.message)}</div>`; return; }
    const people = (data || []).filter((p) => p.id !== me.id && p.name.toLowerCase().includes(q.toLowerCase()));
    for (const p of people) fr.names.set(p.id, p.name);
    $("frResults").innerHTML = people.length ? people.map((p) => {
      const s = frStatus(p.id);
      const btn = s === "friend" ? '<span class="frwhen">Friends</span>' : s === "sent" ? '<span class="frwhen">Requested</span>'
        : s === "received" ? `<button class="go" data-fraccept="${p.id}">Accept</button>` : `<button class="go" data-fradd="${p.id}">Add friend</button>`;
      return `<div class="frrow"><span class="frav">${esc((p.name.trim()[0] || "?").toUpperCase())}</span><span class="meta"><span class="t">${esc(p.name)}</span></span>${btn}</div>`;
    }).join("") : '<div class="sub">Nobody by that name yet. They need to have opened Budsbox at least once.</div>';
  }, 250);
});
async function frAct(fn, okMsg) {
  const r = await fn();
  if (r && r.error) { $("frMsg").textContent = r.error.message; return; }
  if (okMsg) toast(okMsg);
  await loadFriends(); $("frSearch").dispatchEvent(new Event("input"));
}
$("friendsModal").addEventListener("click", (e) => {
  const b = e.target.closest("button, [data-frplay]"); if (!b) return;
  const d = b.dataset;
  if (d.fradd) {
    if (frStatus(d.fradd) === "received") return frAct(() => sb.from("friendships").update({ status: "accepted" }).eq("requester", d.fradd).eq("addressee", me.id), "You're now friends with " + frName(d.fradd));
    return frAct(() => sb.from("friendships").insert({ requester: me.id, addressee: d.fradd, status: "pending" }), "Friend request sent");
  }
  if (d.fraccept) return frAct(() => sb.from("friendships").update({ status: "accepted" }).eq("requester", d.fraccept).eq("addressee", me.id), "You're now friends with " + frName(d.fraccept));
  if (d.frdecline) return frAct(() => sb.from("friendships").delete().eq("requester", d.frdecline).eq("addressee", me.id), "Request declined");
  if (d.frcancel) return frAct(() => sb.from("friendships").delete().eq("requester", me.id).eq("addressee", d.frcancel), "Request cancelled");
  if (d.frremove) {
    if (!confirm(`Remove ${frName(d.frremove)} from your friends?`)) return;
    return frAct(async () => {
      await sb.from("friendships").delete().eq("requester", me.id).eq("addressee", d.frremove);
      return sb.from("friendships").delete().eq("requester", d.frremove).eq("addressee", me.id);
    }, "Friend removed");
  }
  if (d.frplay) { const t = all.find((x) => String(x.id) === d.frplay); if (t) { ctxName = frName(friendIds().find((u) => String(fr.act.get(u)?.track_id) === d.frplay)) + "'s activity"; playTrack(t, [t]); } }
});
$("frShare").onchange = async () => {
  frShare = $("frShare").checked;
  try { localStorage.setItem("jukebox_share", frShare ? "on" : "off"); } catch (e) {}
  if (frShare) { toast("Friends can see what you're listening to"); publishActivity(true); }
  else { toast("Your listening is private"); await sb.from("activity").delete().eq("user_id", me.id); }
};
async function openFriends() {
  toggleMenu(false); $("frMsg").textContent = ""; $("frSearch").value = ""; $("frResults").innerHTML = "";
  openOv("friendsModal"); paintFriends();
  await syncProfile(); await loadFriends();
}
$("friendsBtn").onclick = openFriends; $("mFriendsBtn").onclick = openFriends;
$("frClose").onclick = () => closeOv("friendsModal");
// tell friends what's playing (on play/pause/song change, and every couple of minutes while playing)
let actT = 0, actLast = "";
function publishActivity(force) {
  if (!me || !frShare || fr.noTable) return;
  clearTimeout(actT);
  actT = setTimeout(async () => {
    const row = { user_id: me.id, track_id: nowId != null ? String(nowId) : null, playing: nowId != null && !audio.paused, updated_at: new Date().toISOString() };
    const sig = row.track_id + "|" + row.playing;
    if (!force && sig === actLast && Date.now() - (publishActivity.at || 0) < 110000) return;
    actLast = sig; publishActivity.at = Date.now();
    const r = await sb.from("activity").upsert(row);
    if (r.error && FR_TABLES.test(r.error.message || "")) fr.noTable = true;
  }, 1200);
}
setInterval(() => { if (me && !audio.paused) publishActivity(true); }, 120000);
let frTick = 0; // every 20s while Friends is open, every minute otherwise
setInterval(() => { frTick++; if (me && !document.hidden && (isOpen("friendsModal") || frTick % 3 === 0)) loadFriends(); }, 20000);
// Home: friends playing something right now (or in the last half hour)
function friendsListening() {
  const recent = friendIds().map((u) => [u, fr.act.get(u)]).filter(([, a]) => a && a.track_id && Date.now() - Date.parse(a.updated_at) < 30 * 60000)
    .sort((x, y) => String(y[1].updated_at).localeCompare(String(x[1].updated_at))).slice(0, 6);
  const tiles = recent.map(([u, a]) => {
    const t = all.find((x) => String(x.id) === String(a.track_id)); if (!t) return "";
    return `<button class="rtile frtile" data-recent="t:${esc(t.id)}" title="${esc(frName(u))}: ${esc(t.title)}"><span class="rart"><span class="frav${isLive(a) ? " live" : ""}">${esc(frInitial(u))}</span></span><span class="rname">${esc(frName(u))}<br><span class="sub">${esc(t.title)}</span></span></button>`;
  }).join("");
  return tiles ? `<h2 class="sech">Friends listening</h2><div class="recent">${tiles}</div>` : "";
}

/* ---------- releases: albums, EPs and singles ----------
   A release is a titled, ordered set of your songs under an artist name, with a cover. */
let releases = [], relByTrack = new Map(), relNoTable = false;
const REL_TYPES = { album: "Album", ep: "EP", single: "Single" };
const relCoverUrl = (r) => r && r.cover_path ? sb.storage.from("music").getPublicUrl(r.cover_path).data.publicUrl : "";
function relCoverUrlFor(t) { const r = relByTrack.get(String(t.id)); return r ? relCoverUrl(r) || "" : ""; }
const relTracks = (r) => (r.track_ids || []).map((id) => all.find((t) => String(t.id) === String(id))).filter(Boolean);
const relYear = (r) => new Date(r.release_date || r.created_at || Date.now()).getFullYear();
function relArt(r) {
  const u = relCoverUrl(r) || (relTracks(r).find((t) => t.cover_path) ? coverUrl(relTracks(r).find((t) => t.cover_path)) : "");
  return u ? `<span class="cover"><img src="${u}" alt="" loading="lazy" decoding="async"></span>` : discHTML({ id: "rel:" + r.id });
}
const relCard = (r) => `<button class="relcard" data-rel="${esc(r.id)}" title="${esc(r.title)}"><span class="relart">${relArt(r)}</span><span class="reltitle">${esc(r.title)}</span><span class="sub">${REL_TYPES[r.type] || "Album"} · ${relYear(r)}</span></button>`;
const relRow = (r) => `<div class="track trow prow" tabindex="0" data-rel="${esc(r.id)}"><span class="lcov">${relArt(r)}</span>
  <span class="meta"><span class="t">${esc(r.title)}</span><span class="by">${REL_TYPES[r.type] || "Album"} · ${esc(r.artist)}</span></span><span class="tact"></span></div>`;
const releasesBy = (name) => releases.filter((r) => r.artist === name && relTracks(r).length);
function newReleasesRow() {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const fresh = releases.filter((r) => String(r.release_date || r.created_at) > since && relTracks(r).length).slice(0, 8);
  return fresh.length ? `<h2 class="sech">New releases</h2><div class="relgrid">${fresh.map(relCard).join("")}</div>` : "";
}
// --- editor
let relEdit = null; // { id?, type, title, artist, track_ids, cover_path, pendingCover, coverUrl, dropCover, description }
function myArtistNames() {
  const names = new Set(all.filter((t) => t.user_id === me.id && hasArtist(t)).map(artistOf));
  for (const r of artistInfo.values()) if (r.claimed_by === me.id) names.add(r.name);
  return [...names];
}
function openRelease(existing, presetArtist) {
  if (relNoTable) { alert('Releases need a one-time setup: run the "RELEASES" SQL from the top of js/app.js in Supabase > SQL Editor.'); return; }
  const mineNames = myArtistNames();
  relEdit = existing ? { ...existing, track_ids: [...(existing.track_ids || [])], pendingCover: null, dropCover: false }
    : { type: "album", title: "", artist: presetArtist || mineNames[0] || myName(), track_ids: [], cover_path: null, pendingCover: null, dropCover: false, description: "" };
  $("relHead").textContent = existing ? "Edit release" : "New release";
  $("relTitle").value = relEdit.title; $("relArtist").value = relEdit.artist; $("relDesc").value = relEdit.description || "";
  $("relArtists").innerHTML = mineNames.map((n) => `<option value="${esc(n)}">`).join("");
  $("relSave").textContent = existing ? "Save changes" : "Release";
  $("relDelete").classList.toggle("hide", !existing);
  $("relMsg").textContent = ""; $("relPicker").classList.add("hide");
  paintRelEditor(); openOv("relModal");
}
function paintRelEditor() {
  const e = relEdit; if (!e) return;
  document.querySelectorAll("#relType [data-rt]").forEach((b) => { const on = b.dataset.rt === e.type; b.classList.toggle("go", on); b.setAttribute("aria-checked", String(on)); });
  const songs = e.track_ids.map((id) => all.find((t) => String(t.id) === String(id))).filter(Boolean);
  const cover = e.coverUrl || (!e.dropCover && e.cover_path ? relCoverUrl(e) : "") || (songs.find((t) => t.cover_path) ? coverUrl(songs.find((t) => t.cover_path)) : "");
  $("relPrev").innerHTML = cover ? `<img src="${cover}" alt="">` : discHTML({ id: "rel:new" });
  $("relCount").textContent = songs.length ? `· ${songs.length} song${songs.length === 1 ? "" : "s"}${(() => { const s = songs.reduce((n, t) => n + (durOf(t) || 0), 0); return s ? ", " + Math.round(s / 60) + " min" : ""; })()}` : "";
  $("relTracks").innerHTML = songs.length ? songs.map((t, i) => `<div class="relt"><span class="wn">${i + 1}</span><span class="meta"><span class="t">${esc(t.title)}</span><span class="by">${durOf(t) ? fmt(durOf(t)) : ""}</span></span>
    <button class="rbtn" data-relup="${i}" aria-label="Move up" ${i ? "" : "disabled"}>▲</button><button class="rbtn" data-reldown="${i}" aria-label="Move down" ${i < songs.length - 1 ? "" : "disabled"}>▼</button><button class="rbtn rdel" data-relrm="${i}" aria-label="Remove">${ICON("ic-x")}</button></div>`).join("")
    : '<div class="sub">No songs yet. Upload new ones or add songs you\'ve already uploaded.</div>';
  if (!$("relPicker").classList.contains("hide")) paintRelPicker();
}
function paintRelPicker() {
  const mine = all.filter((t) => t.user_id === me.id && !relEdit.track_ids.map(String).includes(String(t.id)));
  $("relPicker").innerHTML = mine.length ? mine.map((t) => `<label class="relpick"><input type="checkbox" data-relpick="${esc(t.id)}"> <span class="meta"><span class="t">${esc(t.title)}</span><span class="by">${esc(artistOf(t))}${relByTrack.get(String(t.id)) && relByTrack.get(String(t.id)).id !== relEdit.id ? " · on " + esc(relByTrack.get(String(t.id)).title) : ""}</span></span></label>`).join("") + '<button class="go" id="relPickAdd">Add selected</button>'
    : '<div class="sub">All your uploads are already in this release.</div>';
}
$("relType").onclick = (e) => { const b = e.target.closest("[data-rt]"); if (b) { relEdit.type = b.dataset.rt; paintRelEditor(); } };
$("relTracks").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return;
  const ids = relEdit.track_ids, d = b.dataset;
  if (d.relup) { const i = +d.relup; [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; }
  else if (d.reldown) { const i = +d.reldown; [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]]; }
  else if (d.relrm) ids.splice(+d.relrm, 1);
  paintRelEditor();
};
$("relPickBtn").onclick = () => { $("relPicker").classList.toggle("hide"); paintRelPicker(); };
$("relPicker").addEventListener("click", (e) => {
  if (e.target.id !== "relPickAdd") return;
  const picked = [...document.querySelectorAll("#relPicker [data-relpick]:checked")].map((x) => x.dataset.relpick);
  relEdit.track_ids.push(...picked); $("relPicker").classList.add("hide"); paintRelEditor();
});
$("relUpload").onchange = async (e) => {
  const files = [...e.target.files]; e.target.value = "";
  if (!files.length) return;
  relEdit.artist = $("relArtist").value.trim() || relEdit.artist;
  const added = await uploadSongs(files, { artist: relEdit.artist, onStatus: (m) => ($("relMsg").textContent = m) });
  if (added === null) return;
  $("relMsg").textContent = added.length ? `Uploaded ${added.length} song${added.length === 1 ? "" : "s"} (they're in the Library too).` : "";
  await loadAll();
  relEdit.track_ids.push(...added.map((t) => t.id).filter((id) => all.some((x) => String(x.id) === String(id))));
  paintRelEditor();
};
$("relImg").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    relEdit.pendingCover = await resizeImage(f, 640); relEdit.dropCover = false;
    if (relEdit.coverUrl) URL.revokeObjectURL(relEdit.coverUrl);
    relEdit.coverUrl = URL.createObjectURL(relEdit.pendingCover); paintRelEditor();
  } catch (err) { $("relMsg").textContent = err.message; }
};
$("relCancel").onclick = () => closeOv("relModal");
$("relSave").onclick = async () => {
  const e = relEdit; if (!e) return;
  e.title = $("relTitle").value.trim(); e.artist = $("relArtist").value.trim(); e.description = $("relDesc").value.trim();
  const songs = e.track_ids.map((id) => all.find((t) => String(t.id) === String(id))).filter(Boolean);
  if (!e.title) { $("relMsg").textContent = "Give your release a title."; $("relTitle").focus(); return; }
  if (!e.artist) { $("relMsg").textContent = "Add the artist name."; $("relArtist").focus(); return; }
  if (!songs.length) { $("relMsg").textContent = "Add at least one song."; return; }
  if (songs.some((t) => t.user_id !== me.id)) { $("relMsg").textContent = "You can only release songs you uploaded."; return; }
  const claim = artistInfo.get(e.artist);
  if (claim && claim.claimed_by !== me.id) { $("relMsg").textContent = `${e.artist} is claimed by ${claim.claimed_name || "someone else"}, so only they can release under that name.`; return; }
  $("relSave").disabled = true; $("relMsg").textContent = "Saving...";
  let newPath = null;
  if (e.pendingCover) {
    newPath = `${me.id}/release_${Date.now()}.jpg`;
    const up = await sb.storage.from("music").upload(newPath, e.pendingCover, { contentType: "image/jpeg" });
    if (up.error) { $("relMsg").textContent = "Cover upload failed: " + up.error.message; $("relSave").disabled = false; return; }
  }
  const row = { title: e.title, artist: e.artist, type: e.type, description: e.description || null, track_ids: songs.map((t) => t.id),
    cover_path: newPath || (e.dropCover ? null : e.cover_path || null) };
  const res = e.id ? await sb.from("releases").update(row).eq("id", e.id).select().single()
                   : await sb.from("releases").insert({ ...row, user_id: me.id, release_date: new Date().toISOString() }).select().single();
  $("relSave").disabled = false;
  if (res.error) {
    if (newPath) sb.storage.from("music").remove([newPath]);
    $("relMsg").textContent = /releases|schema cache|does not exist/i.test(res.error.message || "") ? 'Releases need a one-time setup: run the "RELEASES" SQL from the top of js/app.js in Supabase > SQL Editor.' : res.error.message;
    return;
  }
  if (newPath && e.cover_path) sb.storage.from("music").remove([e.cover_path]);
  // the songs carry the release's artist name, so they appear on the artist page
  await Promise.all(songs.filter((t) => artistOf(t) !== e.artist).map((t) => sb.from("tracks").update({ artist: e.artist }).eq("id", t.id)));
  const id = (res.data && res.data.id) || e.id;
  closeOv("relModal"); sfxDing(); toast(e.id ? "Release updated" : `${REL_TYPES[e.type]} released!`);
  await loadAll(); if (id) go("rel:" + id);
};
$("relDelete").onclick = async () => {
  const e = relEdit; if (!e || !e.id) return;
  if (!confirm(`Delete "${e.title}"? The songs stay in Budsbox; only the release is removed.`)) return;
  const { error } = await sb.from("releases").delete().eq("id", e.id);
  if (error) { $("relMsg").textContent = error.message; return; }
  if (e.cover_path) sb.storage.from("music").remove([e.cover_path]);
  closeOv("relModal"); sfxDrop(); toast("Release deleted");
  await loadAll(); go(releasesBy(e.artist).length || songsBy(e.artist).length ? "ar:" + e.artist : "lib");
};
$("csRelease").onclick = () => { closeOv("createSheet"); openRelease(null); };

/* ---------- password: forgot + change ---------- */
$("forgot").onclick = async () => {
  const email = $("email").value.trim();
  if (!email) { authMsg("Type your email above first, then tap Forgot password."); $("email").focus(); return; }
  authMsg("Sending...");
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  authMsg(error ? error.message : "Check your email for a link to reset your password.");
};
function openPw(fromEmail) {
  $("pw1").value = ""; $("pw2").value = "";
  $("pwMsg").textContent = fromEmail ? "Welcome back! Choose a new password." : "";
  toggleMenu(false); openOv("pwModal"); setTimeout(() => $("pw1").focus(), 60);
}
$("pwChange").onclick = () => openPw(false);
$("pwCancel").onclick = () => closeOv("pwModal");
$("pw2").onkeydown = (e) => { if (e.key === "Enter") $("pwSave").click(); };
$("pwSave").onclick = async () => {
  const a = $("pw1").value, b = $("pw2").value;
  if (a.length < 6) { $("pwMsg").textContent = "Use at least 6 characters."; return; }
  if (a !== b) { $("pwMsg").textContent = "The two passwords don't match."; return; }
  $("pwMsg").textContent = "Saving...";
  const { error } = await sb.auth.updateUser({ password: a });
  if (error) { $("pwMsg").textContent = error.message; return; }
  closeOv("pwModal"); sfxDing(); toast("Password updated");
};
$("logout").onclick = async () => { toggleMenu(false); await flushListen(); sb.auth.signOut(); };

/* ---------- display name ---------- */
const myName = () => me.user_metadata?.display_name || me.email.split("@")[0];
const myLists = () => lists.filter((p) => p.user_id === me.id);
function paintWho() { $("who").textContent = myName(); $("avatar").textContent = (myName().trim()[0] || "?").toUpperCase(); }

$("editName").onclick = () => {
  $("nameIn").value = myName();
  $("nameForm").classList.remove("hide");
  $("nameIn").focus(); $("nameIn").select();
};
$("nameCancel").onclick = () => $("nameForm").classList.add("hide");
$("nameIn").onkeydown = (e) => { if (e.key === "Enter") $("nameSave").click(); };
$("nameSave").onclick = async () => {
  const n = $("nameIn").value.trim().slice(0, 24);
  if (!n) { $("nameIn").focus(); return; }
  const { data, error } = await sb.auth.updateUser({ data: { display_name: n } });
  if (error) { say(error.message); return; }
  me = data.user;
  // best effort: rename existing rows so your uploads keep your new name
  await sb.from("tracks").update({ uploader: n }).eq("user_id", me.id);
  await sb.from("playlists").update({ owner: n }).eq("user_id", me.id);
  $("nameForm").classList.add("hide");
  paintWho(); toast("Name saved."); sfxDing(); syncProfile();
  loadAll();
};

/* ---------- data ---------- */
async function loadAll() {
  const [t, p, ar, rl] = await Promise.all([
    sb.from("tracks").select("*").order("created_at", { ascending: false }),
    sb.from("playlists").select("*").order("created_at", { ascending: true }),
    sb.from("artists").select("*"),
    sb.from("releases").select("*").order("release_date", { ascending: false }),
  ]);
  await Promise.all([loadLikes(), loadFollows()]);
  if (ar.error) { artistInfo = new Map(); artistsNoTable = /artists|schema cache|does not exist/i.test(ar.error.message || ""); }
  else { artistInfo = new Map((ar.data || []).map((r) => [r.name, r])); artistsNoTable = false; }
  if (t.error) {
    // no connection: fall back to the library saved on this device last time
    const c = readOfflineData();
    if (!c) { say(t.error.message); return; }
    t.data = c.tracks; p.data = c.playlists; p.error = null;
    if (!artistInfo.size) artistInfo = new Map((c.artists || []).map((r) => [r.name, r]));
    rl.data = c.releases || []; rl.error = null;
    if (!loadAll.offlineNoted) { loadAll.offlineNoted = true; toast("You're offline \u2014 showing your downloaded music"); }
  } else saveOfflineData(t.data, p.error ? null : p.data, ar.error ? null : ar.data, rl.error ? null : rl.data);
  if (rl.error) { releases = []; relNoTable = /releases|schema cache|does not exist/i.test(rl.error.message || ""); }
  else { releases = rl.data || []; relNoTable = false; }
  relByTrack = new Map(); for (const r of releases) for (const id of r.track_ids || []) if (!relByTrack.has(String(id))) relByTrack.set(String(id), r);
  all = t.data || [];
  // keep queued songs pointing at fresh rows (plays, lyrics, covers)
  const fresh = (x) => all.find((y) => y.id === x.id);
  queue = queue.map(fresh).filter(Boolean);
  if (queueOrig) queueOrig = queueOrig.map(fresh).filter(Boolean);
  userQueue = userQueue.map(fresh).filter(Boolean);
  // newest first (no more per-uploader groups)
  all.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  if (p.error) { lists = []; say("Playlists unavailable: " + p.error.message + " (run the SQL in the script comment)"); }
  else lists = p.data || [];
  drawLists(); setNow();
  setTimeout(backfillDurations, 3000);
  setTimeout(syncDownloads, 4000);
  if (!loadAll.noted) { loadAll.noted = true; noteNewFromFollowed(); }
  // opened from a Jam invite link: prefill the code (joining needs a tap so the phone allows audio)
  if (pendingJam && !jam.role) {
    $("jamCode").value = pendingJam; pendingJam = "";
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
    openJam(); $("jamMsg").textContent = "Tap Join to listen along.";
  }
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

function creditHTML(t) {
  const ab = addedBy(t);
  const a = t.artist && String(t.artist).trim() ? `<span class="alink" data-artist="${esc(artistOf(t))}">${esc(artistOf(t))}</span>` : esc(artistOf(t));
  return a + (ab ? ` <span class="ab">· ${esc(ab)}</span>` : "");
}
/* ---------- artists ---------- */
const hasArtist = (t) => !!(t.artist && String(t.artist).trim());
const songsBy = (name) => all.filter((t) => hasArtist(t) && artistOf(t) === name);
function artistNames() {
  const latest = new Map();
  for (const t of all) if (hasArtist(t)) { const n = artistOf(t), c = String(t.created_at || ""); if (!latest.has(n) || c > latest.get(n)) latest.set(n, c); }
  return [...latest.entries()].sort((a, b) => b[1].localeCompare(a[1])).map(([n]) => n);
}
let artistInfo = new Map(), artistsNoTable = false;
const artistPicUrl = (r) => sb.storage.from("music").getPublicUrl(r.picture_path).data.publicUrl;
const myArtist = (name) => artistInfo.get(name)?.claimed_by === me.id;
const canClaim = (name) => !artistInfo.has(name) && songsBy(name).some((t) => t.user_id === me.id);
function artistArt(name) {
  const r = artistInfo.get(name);
  if (r && r.picture_path) return `<span class="cover"><img src="${artistPicUrl(r)}" alt="" loading="lazy" decoding="async"></span>`;
  return artistFallbackArt(name);
}
// no profile picture: one of their album covers, else a pixel disc
function artistFallbackArt(name) {
  const cov = songsBy(name).find((t) => t.cover_path);
  return cov ? `<span class="cover"><img src="${coverUrl(cov)}" alt="" loading="lazy" decoding="async"></span>` : discHTML({ id: "artist:" + name });
}
function artistRow(name) {
  const n = songsBy(name).length;
  return `<div class="track trow prow arow" tabindex="0" data-ar="${esc(name)}"><span class="lcov round">${artistArt(name)}</span>
    <span class="meta"><span class="t">${esc(name)}</span><span class="by">Artist · ${n} song${n === 1 ? "" : "s"}${isFollowing(name) ? " \u00B7 Following" : ""}</span></span><span class="tact"></span></div>`;
}
function goArtist(name) { if (name && songsBy(name).length) { if (fullOpen()) closeFull(); go("ar:" + name); } }

// "3 days ago" style dates for the Date added column
function ago(iso) {
  const t = Date.parse(iso || ""); if (!t) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  const u = [[31536000, "year"], [2592000, "month"], [604800, "week"], [86400, "day"], [3600, "hour"], [60, "minute"]];
  for (const [n, w] of u) if (s >= n) { const k = Math.floor(s / n); return k + " " + w + (k === 1 ? "" : "s") + " ago"; }
  return "just now";
}
const PLUS = '<svg viewBox="0 0 9 9" shape-rendering="crispEdges" aria-hidden="true"><use href="#ic-cplus"/></svg>';
const ICON = (id) => `<svg viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true"><use href="#${id}"/></svg>`;

// Spotify-style track row: # | cover + title/artist | date added | plays | actions (on hover)
function trackRow(t, i, extra, canEdit) {
  const edit = canEdit && t.user_id === me.id
    ? `<button class="rbtn" data-edit="${i}" aria-label="Edit song" title="Edit song">${ICON("ic-pen")}</button>` : "";
  return `<div class="track trow${isDownloaded(t) ? " dl" : ""}" tabindex="0" data-i="${i}">` +
    `<span class="tn"><span class="num">${i + 1}</span><span class="eq">${ICON("ic-play")}</span></span>` +
    thumbHTML(t) +
    `<span class="meta"><span class="t">${esc(t.title)}</span><span class="by">${creditHTML(t)}</span></span>` +
    `<span class="tdate">${esc(ago(t.created_at))}</span>` +
    `<span class="plays" data-plays="${esc(t.id)}">▶ ${t.plays || 0}</span>` +
    `<span class="tdur">${durOf(t) ? fmt(durOf(t)) : ""}</span>` +
    `<span class="tact"><button class="rbtn lk${isLiked(t) ? " on" : ""}" data-like="${i}" aria-pressed="${isLiked(t)}" aria-label="Like" title="${isLiked(t) ? "Remove from" : "Add to"} Liked Songs"><svg viewBox="0 0 9 9" shape-rendering="crispEdges" aria-hidden="true"><use href="#ic-heart${isLiked(t) ? "-f" : ""}"/></svg></button><button class="rbtn" data-add="${i}" aria-label="Add to playlist or queue" title="Add to playlist or queue">${PLUS}</button>${edit}${extra}</span></div>`;
}
const listHead = () => '<div class="lhead" aria-hidden="true"><span class="tn">#</span><span></span><span>Title</span><span class="tdate">Date added</span><span class="plays">Plays</span><span class="tdur">Time</span><span></span></div>';

// playlist cover: its own picture, else its first song's cover, else a pixel disc
const plCoverUrl = (p) => sb.storage.from("music").getPublicUrl(p.cover_path).data.publicUrl;
function plArtHTML(p) {
  if (p.cover_path) return `<span class="cover"><img src="${plCoverUrl(p)}" alt="" loading="lazy" decoding="async"></span>`;
  const first = p.track_ids.map((id) => all.find((t) => t.id === id)).find((t) => t && t.cover_path);
  return first ? `<span class="cover"><img src="${coverUrl(first)}" alt="" loading="lazy" decoding="async"></span>` : discHTML({ id: p.id });
}
function plRow(p) {
  const n = p.track_ids.length, mine = p.user_id === me.id;
  return `<div class="track trow prow" tabindex="0" data-pl="${esc(p.id)}"><span class="lcov">${plArtHTML(p)}</span>
    <span class="meta"><span class="t">${esc(p.name)}</span><span class="by">Playlist · ${esc(p.owner)} · ${n} song${n === 1 ? "" : "s"}</span></span>
    <span class="tact">${mine ? `<button class="rbtn rdel" data-dpl="${esc(p.id)}" aria-label="Delete playlist" title="Delete playlist">${ICON("ic-x")}</button>` : ""}</span></div>`;
}

// big header like Spotify: cover, type, title, meta, then play / shuffle / extras
function heroHTML({ kind, title, meta, art, extras, back, canPlay }) {
  return `<div class="hero">
    ${back ? `<button class="ico hback" data-back="1" aria-label="Back to playlists">${ICON("ic-down")}</button>` : ""}
    <div class="hart">${art}</div>
    <div class="hmeta"><div class="sub">${esc(kind)}</div><h1 class="htitle">${esc(title)}</h1><div class="sub hsub">${meta}</div></div>
  </div>
  <div class="hbar">
    ${canPlay ? `<button class="go bigplay" data-playall="1" aria-label="Play">${ICON("ic-play")}</button>
    <button class="ico pbtn${shuffleOn ? " on" : ""}" data-shufplay="1" aria-pressed="${shuffleOn}" aria-label="${shuffleOn ? "Turn shuffle off" : "Shuffle play"}" title="${shuffleOn ? "Shuffle is on \u2014 tap to turn off" : "Shuffle play"}">${ICON("ic-shuffle")}</button>` : ""}
    ${extras || ""}
  </div>`;
}
let sortBy = (() => { try { return localStorage.getItem("jukebox_sort") || "recent"; } catch (e) { return "recent"; } })();
const sortSel = () => `<label class="sortw"><span class="sub">Sort</span><select id="sortSel" aria-label="Sort songs">
  ${[["recent", "Recently added"], ["title", "Title"], ["artist", "Artist"], ["plays", "Most played"]].map(([v, l]) => `<option value="${v}"${sortBy === v ? " selected" : ""}>${l}</option>`).join("")}
</select></label>`;
function sorted(list) {
  const a = [...list], k = (x) => String(x || "").toLowerCase();
  if (sortBy === "title") a.sort((x, y) => k(x.title).localeCompare(k(y.title)));
  else if (sortBy === "artist") a.sort((x, y) => k(artistOf(x)).localeCompare(k(artistOf(y))) || k(x.title).localeCompare(k(y.title)));
  else if (sortBy === "plays") a.sort((x, y) => (y.plays || 0) - (x.plays || 0));
  else a.sort((x, y) => String(y.created_at || "").localeCompare(String(x.created_at || "")));
  return a;
}


/* ---------- search ---------- */
function matches(t, q) {
  const f = [t.title, t.artist];
  if (abMode() !== "off") f.push(t.uploader); // only search names you've chosen to see
  return f.some((s) => s && String(s).toLowerCase().includes(q));
}
function clearSearch() { query = ""; $("q").value = ""; }
$("q").addEventListener("input", () => { query = $("q").value.trim().toLowerCase(); drawLists(); $("main").scrollTop = 0; });
$("q").addEventListener("keydown", (e) => { if (e.key === "Enter") $("q").blur(); });

function drawLists() {
  if (!me) return;
  const box = $("lists");
  const tab = query ? "" : view.startsWith("pl:") ? "pls" : view;
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("go", b.dataset.v === tab));
  const swipeHint = isTouch ? '<div class="sub hint">Swipe right on a song to queue it</div>' : "";
  const plays = (list) => list.reduce((n, t) => n + (t.plays || 0), 0);
  // " · 52 min" when we know how long the songs are
  const len = (list) => { const k = list.filter(durOf); if (!k.length) return ""; const sec = k.reduce((n, t) => n + durOf(t), 0); const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return " \u00B7 " + (k.length < list.length ? "about " : "") + (h ? `${h} hr ${m} min` : `${m} min`); };
  let html = "";

  if (!query && mSearch) {
    shown = [...all].sort((a, b) => (b.plays || 0) - (a.plays || 0)).slice(0, 10);
    html = '<div class="sempty sub">Find songs, artists and playlists</div>' +
      (shown.length ? '<h2 class="sech">Most played</h2>' + shown.map((t, i) => trackRow(t, i, "", true)).join("") : "");
  } else if (query) {
    shown = sorted(all.filter((t) => matches(t, query)));
    const pls = lists.filter((p) => p.name.toLowerCase().includes(query));
    const ars = artistNames().filter((n) => n.toLowerCase().includes(query));
    html = `<h2 class="sech">Results for "${esc($("q").value.trim())}"</h2>`;
    if (!shown.length && !pls.length && !ars.length) html += '<div class="empty">No matches. Try a song title or artist.</div>';
    if (ars.length) html += '<h2 class="sech">Artists</h2>' + ars.slice(0, 6).map(artistRow).join("");
    const rls = releases.filter((r) => relTracks(r).length && (r.title.toLowerCase().includes(query) || r.artist.toLowerCase().includes(query)));
    if (rls.length) html += '<h2 class="sech">Albums</h2>' + rls.slice(0, 6).map(relRow).join("");
    if (shown.length) { html += `<div class="secbar"><h2 class="sech">Songs</h2>${sortSel()}</div>` + swipeHint + listHead(); shown.forEach((t, i) => { html += trackRow(t, i, "", true); }); }
    if (pls.length) { html += '<h2 class="sech">Playlists</h2>'; pls.forEach((p) => { html += plRow(p); }); }
  } else if (view === "lib") {
    shown = sorted(all);
    html = recentTiles() + friendsListening() + newReleasesRow() + newFromFollowed() + heroHTML({
      kind: "Everyone's music", title: "Library", art: '<span class="cover"><img src="icon-512.png" alt=""></span>', canPlay: all.length > 0,
      meta: `<b>${esc(myName())}</b> · ${all.length} song${all.length === 1 ? "" : "s"} · ${plays(all)} listens${len(all)}`,
      extras: `<label class="btn uplbtn" for="file">+ Upload</label><button class="btn uplbtn" data-newrelease="1">+ Release</button><span class="grow"></span>${sortSel()}`,
    });
    if (!all.length) html += '<div class="empty">No music yet. Upload a song to start the world.</div>';
    else html += swipeHint + listHead();
    shown.forEach((t, i) => { html += trackRow(t, i, "", true); });
  } else if (view === "pls") {
    shown = [];
    const chips = [["all", "All"], ["mine", "By you"], ["shared", "Shared"], ["albums", "Albums"], ["artists", "Artists"]];
    let pls = lists.filter((p) => libFilter === "all" || (libFilter === "mine" ? p.user_id === me.id : p.user_id !== me.id));
    pls = libSort === "alpha"
      ? [...pls].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
      : [...pls].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    html = `<div class="secbar deskonly"><h2 class="sech">Your Library</h2></div>
      <div class="chips" role="group" aria-label="Filter">${chips.map(([v, l]) => `<button class="chip${libFilter === v ? " on" : ""}" data-chip="${v}" aria-pressed="${libFilter === v}">${l}</button>`).join("")}</div>
      <div class="lsort"><button class="lsortbtn" data-lsort="1" aria-label="Change sort">${ICON("ic-sort")}${libSort === "alpha" ? "Alphabetical" : "Recents"}</button></div>`;
    if (libFilter === "albums") {
      const rs = releases.filter((r) => relTracks(r).length);
      const list = libSort === "alpha" ? [...rs].sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase())) : rs;
      html += list.length ? list.map(relRow).join("") : '<div class="empty">No albums or EPs yet. Release one from Create \u2192 Album or EP.</div>';
    } else if (libFilter === "artists") {
      let names = artistNames();
      if (libSort === "alpha") names = [...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      html += names.length ? names.map(artistRow).join("") : '<div class="empty">No artists yet. Add an artist to a song with the pencil (Edit song).</div>';
    } else {
    if (libFilter === "all") html += `<div class="track trow prow" tabindex="0" data-goliked="1"><span class="lcov"><span class="likedtile"><svg viewBox="0 0 9 9" shape-rendering="crispEdges" aria-hidden="true"><use href="#ic-heart-f"/></svg></span></span>
      <span class="meta"><span class="t">Liked Songs</span><span class="by">Playlist \u00B7 ${liked.size} song${liked.size === 1 ? "" : "s"}</span></span><span class="tact"></span></div>`;
    if (libFilter === "all") html += `<div class="track trow prow" tabindex="0" data-golib="1"><span class="lcov"><span class="libtile">${ICON("ic-note")}</span></span>
      <span class="meta"><span class="t">All songs</span><span class="by">Collection · ${all.length} song${all.length === 1 ? "" : "s"}</span></span><span class="tact"></span></div>`;
    html += pls.map(plRow).join("");
    if (!pls.length && libFilter !== "all") html += `<div class="empty">${libFilter === "mine" ? "You haven't made a playlist yet." : "No shared playlists yet."}</div>`;
    html += `<div class="track trow prow" tabindex="0" data-newpl="1"><span class="lcov"><span class="newtile">${ICON("ic-plus")}</span></span>
      <span class="meta"><span class="t">New playlist</span><span class="by">Create one and add songs with \u2295</span></span><span class="tact"></span></div>`;
    }
  } else if (view.startsWith("rel:")) {
    const r = releases.find((x) => String(x.id) === view.slice(4));
    if (!r) { view = "lib"; return drawLists(); }
    shown = relTracks(r);
    const mineR = r.user_id === me.id;
    html = heroHTML({
      kind: REL_TYPES[r.type] || "Album", title: r.title, back: true, canPlay: shown.length > 0,
      art: relArt(r),
      meta: `<b class="alink" data-artist="${esc(r.artist)}">${esc(r.artist)}</b> \u00B7 ${relYear(r)} \u00B7 ${shown.length} song${shown.length === 1 ? "" : "s"}${len(shown).replace(" \u00B7 ", ", ")}`,
      extras: dlButton("rel:" + r.id) + (mineR ? `<span class="grow"></span><button class="rbtn hbtn" data-reledit="1" aria-label="Edit release" title="Edit release">${ICON("ic-pen")}</button>` : ""),
    });
    if (r.description) html += `<div class="arbio"><p>${esc(r.description)}</p></div>`;
    html += listHead();
    shown.forEach((t, i) => { html += trackRow(t, i, "", true); });
    html += `<div class="sub reldate">Released ${esc(new Date(r.release_date || r.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }))}</div>`;
    const more = releasesBy(r.artist).filter((x) => x.id !== r.id);
    if (more.length) html += `<h2 class="sech">More by ${esc(r.artist)}</h2><div class="relgrid">${more.map(relCard).join("")}</div>`;
  } else if (view === "liked") {
    shown = likedTracks();
    html = heroHTML({
      kind: "Playlist", title: "Liked Songs", back: true, canPlay: shown.length > 0,
      art: '<span class="likedtile"><svg viewBox="0 0 9 9" shape-rendering="crispEdges" aria-hidden="true"><use href="#ic-heart-f"/></svg></span>',
      meta: `<b>${esc(myName())}</b> \u00B7 ${shown.length} song${shown.length === 1 ? "" : "s"}${len(shown)}` + (likesLocal ? " \u00B7 saved on this device" : ""),
      extras: dlButton("liked"),
    });
    if (!shown.length) html += '<div class="empty">Songs you like will show up here. Tap the \u2661 on any song.</div>';
    else html += swipeHint + listHead();
    shown.forEach((t, i) => { html += trackRow(t, i, "", true); });
  } else if (view.startsWith("ar:")) {
    const name = view.slice(3), songs = songsBy(name);
    if (!songs.length) { view = "pls"; return drawLists(); }
    shown = [...songs].sort((a, b) => (b.plays || 0) - (a.plays || 0) || String(b.created_at || "").localeCompare(String(a.created_at || "")));
    const info = artistInfo.get(name), mineA = myArtist(name);
    html = heroHTML({
      kind: info ? "\u2713 Verified artist" : "Artist", title: name, back: true, canPlay: true,
      art: artistArt(name) + (mineA ? `<button class="hedit" data-aredit="1" aria-label="Change artist picture" title="Change picture">${ICON("ic-pen")}<span>Choose photo</span></button>` : ""),
      meta: `${songs.length} song${songs.length === 1 ? "" : "s"} \u00B7 ${plays(songs)} listens${len(songs)}` + (followerCount.get(name) ? ` \u00B7 ${followerCount.get(name)} follower${followerCount.get(name) === 1 ? "" : "s"}` : "") + (info ? ` \u00B7 claimed by <b>${esc(info.claimed_name || "someone")}</b>` : ""),
      extras: `<button class="btn followbtn${isFollowing(name) ? " on" : ""}" data-follow="1" aria-pressed="${isFollowing(name)}">${isFollowing(name) ? "Following" : "Follow"}</button>` +
        (mineA ? `<button class="rbtn hbtn" data-aredit="1" aria-label="Edit artist profile" title="Edit artist profile (picture, bio)">${ICON("ic-pen")}</button>`
        : canClaim(name) ? '<button class="btn claimbtn" data-arclaim="1">Claim artist</button>' : "") +
        (songs.some((t) => t.user_id === me.id) && (!info || info.claimed_by === me.id) ? '<button class="btn claimbtn" data-newrel="1">+ New release</button>' : ""),
    }).replace('<div class="hart">', '<div class="hart round">');
    if (info && info.bio && info.bio.trim()) html += `<div class="arbio"><h2 class="sech">About</h2><p>${esc(info.bio.trim())}</p></div>`;
    html += '<h2 class="sech">Popular</h2>' + swipeHint + listHead();
    shown.forEach((t, i) => { html += trackRow(t, i, "", true); });
    const disc = releasesBy(name);
    if (disc.length) html += `<h2 class="sech">Discography</h2><div class="relgrid">${disc.map(relCard).join("")}</div>`;
  } else {
    const p = lists.find((x) => x.id === view.slice(3));
    if (!p) { view = "pls"; return drawLists(); }
    const mine = p.user_id === me.id;
    shown = p.track_ids.map((id) => all.find((t) => t.id === id)).filter(Boolean);
    html = heroHTML({
      kind: mine ? "Playlist" : "Shared playlist", title: p.name, back: true, canPlay: shown.length > 0,
      art: plArtHTML(p) + (mine ? `<button class="hedit" data-pledit="${esc(p.id)}" aria-label="Change playlist cover" title="Change cover">${ICON("ic-pen")}<span>Choose photo</span></button>` : ""),
      meta: `<b>${esc(p.owner)}</b> · ${shown.length} song${shown.length === 1 ? "" : "s"} · ${plays(shown)} listens${len(shown)}`,
      extras: dlButton("pl:" + p.id) + (mine ? `<button class="rbtn hbtn" data-pledit="${esc(p.id)}" aria-label="Edit playlist" title="Edit playlist (cover, name)">${ICON("ic-pen")}</button>` +
        (shown.length > 1 ? `<button class="btn reorderbtn${reorderId === p.id ? " go" : ""}" data-reorder="1">${reorderId === p.id ? "Done" : "Reorder"}</button>` : "") + `<span class="grow"></span><button class="rbtn rdel hbtn" data-dpl="${esc(p.id)}" aria-label="Delete playlist" title="Delete playlist">${ICON("ic-x")}</button>` : ""),
    });
    if (!shown.length) html += `<div class="empty">${mine ? "Empty. Use + on any song in the Library to add it here." : "Nothing in here yet."}</div>`;
    else html += swipeHint + listHead();
    const ro = mine && reorderId === p.id;
    if (ro) html += '<div class="sub hint">Drag \u2261 to move songs (or focus it and use the arrow keys). Tap Done when finished.</div>';
    shown.forEach((t, i) => { html += trackRow(t, i, ro ? `<button class="rbtn dragh" data-drag="${i}" aria-label="Move ${esc(t.title)}" title="Drag to move">${ICON("ic-grip")}</button>`
      : mine ? `<button class="rbtn rdel" data-rm="${i}" aria-label="Remove from playlist" title="Remove from playlist">${ICON("ic-x")}</button>` : "", false); });
  }
  $("lists").classList.toggle("reordering", view.startsWith("pl:") && reorderId === view.slice(3));
  box.innerHTML = html;
  const ss = $("sortSel");
  if (ss) ss.onchange = () => { sortBy = ss.value; try { localStorage.setItem("jukebox_sort", sortBy); } catch (e) {} drawLists(); };
  markNow(); drawSide();
}

function drawSide() {
  if (!me) return;
  const active = (id) => !query && view === "pl:" + id;
  const item = (p) => `<button class="sitem${active(p.id) ? " go" : ""}" data-spl="${esc(p.id)}" title="${esc(p.name)}"><span class="sthumb">${plArtHTML(p)}</span><span class="t">${esc(p.name)}</span><span class="sub">${p.track_ids.length}</span></button>`;
  const mine = myLists(), others = lists.filter((p) => p.user_id !== me.id);
  $("navLib").classList.toggle("go", !query && view === "lib");
  $("navLiked").classList.toggle("go", !query && view === "liked");
  $("navLikedN").textContent = liked.size || "";
  $("sideMine").innerHTML = mine.length ? mine.map(item).join("") : '<div class="empty sub">None yet.</div>';
  $("sideOthers").innerHTML = others.length ? others.map(item).join("") : '<div class="empty sub">Nothing shared yet.</div>';
}

// highlight the playing row and spin its disc without a redraw (keeps typed text intact)
function markNow() {
  const playing = !audio.paused;
  document.querySelectorAll("#lists .track[data-i]").forEach((el) => {
    const t = shown[+el.dataset.i];
    const on = !!t && t.id === nowId;
    el.classList.toggle("on", on);
    el.classList.toggle("playing", on && playing);
  });
  $("art").classList.toggle("playing", playing);
  $("npArt").classList.toggle("playing", playing && nowId != null);
}

let prevView = "pls";
// drag a song by its grip to a new spot, then save the new order
(() => {
  const L2 = $("lists");
  let d = null;
  const rows = () => [...L2.querySelectorAll(".track[data-i]")];
  L2.addEventListener("pointerdown", (e) => {
    const h = e.target.closest(".dragh"); if (!h) return;
    e.preventDefault();
    const row = h.closest(".track[data-i]");
    d = { row, pid: e.pointerId, y0: e.clientY, moved: false };
    h.setPointerCapture(e.pointerId); row.classList.add("dragging");
  });
  L2.addEventListener("pointermove", (e) => {
    if (!d || e.pointerId !== d.pid) return;
    d.moved = true;
    const others = rows().filter((r) => r !== d.row);
    const after = others.find((r) => { const b = r.getBoundingClientRect(); return e.clientY < b.top + b.height / 2; });
    if (after) L2.insertBefore(d.row, after); else others.length && others[others.length - 1].after(d.row);
  });
  const end = (e) => { if (!d || e.pointerId !== d.pid) return; d.row.classList.remove("dragging"); const m = d.moved; d = null; if (m) saveOrder(); };
  L2.addEventListener("pointerup", end); L2.addEventListener("pointercancel", end);
  L2.addEventListener("keydown", (e) => {
    const h = e.target.closest && e.target.closest(".dragh"); if (!h || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault(); e.stopPropagation();
    const row = h.closest(".track[data-i]"), sib = e.key === "ArrowUp" ? row.previousElementSibling : row.nextElementSibling;
    if (!sib || !sib.matches(".track[data-i]")) return;
    if (e.key === "ArrowUp") sib.before(row); else sib.after(row);
    h.focus(); saveOrder(true);
  });
  async function saveOrder(keepFocus) {
    const p = lists.find((x) => x.id === view.slice(3)); if (!p) return;
    const order = rows().map((r) => shown[+r.dataset.i]).filter(Boolean).map((t) => t.id);
    const missing = p.track_ids.filter((id) => !order.includes(id)); // songs no longer in the library stay at the end
    const focused = keepFocus && document.activeElement && shown[+document.activeElement.closest(".track[data-i]")?.dataset.i]?.id;
    if (await saveIds(p, [...order, ...missing])) {
      drawLists();
      if (focused) { const i = shown.findIndex((t) => t.id === focused); const h = L2.querySelector(`.dragh[data-drag="${i}"]`); if (h) h.focus(); }
    }
  }
})();

function go(v) {
  if (!(v.startsWith("pl:") && v === view)) reorderId = null;
  if ((v.startsWith("ar:") || v.startsWith("pl:") || v.startsWith("rel:") || v === "liked") && v !== view) prevView = (query || mSearch) ? "pls" : view;
  clearSearch(); view = v; mSearch = false;
  mtab = v === "lib" ? "home" : "library";
  paintTabs(); drawLists(); $("main").scrollTop = 0; scrollTo(0, 0);
}
/* ---------- phones: bottom tabs (Home / Search / Your Library / Create) ---------- */
let mtab = "home", mSearch = false, libFilter = "all";
let libSort = (() => { try { return localStorage.getItem("jukebox_libsort") || "recent"; } catch (e) { return "recent"; } })();
function paintTabs() {
  document.querySelectorAll("#tabbar [data-tab]").forEach((b) => { const on = b.dataset.tab === mtab; b.classList.toggle("on", on); if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  if (mtab === "home") $("pTitle").innerHTML = '<svg class="logomark" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#161816"/><circle cx="32" cy="32" r="24" fill="none" stroke="#ffffff22" stroke-width="1.6"/><circle cx="32" cy="32" r="18.5" fill="none" stroke="#ffffff1a" stroke-width="1.6"/><circle cx="32" cy="32" r="11" fill="var(--gold)"/><circle cx="32" cy="32" r="2.6" fill="#161816"/></svg><span class="wordmark">budsbox</span>';
  else $("pTitle").textContent = mtab === "search" ? "Search" : "Your Library";
  $("pTitle").classList.toggle("isbrand", mtab === "home");
  document.body.classList.toggle("m-search", mSearch);
}
function setTab(t) {
  if (t === "create") { openCreate(); return; }
  if (t === "home") return go("lib");
  if (t === "library") return go("pls");
  clearSearch(); mtab = "search"; mSearch = true; paintTabs(); drawLists(); scrollTo(0, 0);
  setTimeout(() => $("q").focus(), 60);
}
$("tabbar").onclick = (e) => { const b = e.target.closest("[data-tab]"); if (b) setTab(b.dataset.tab); };
$("mSearchBtn").onclick = () => setTab("search");
$("mCreateBtn").onclick = () => openCreate();
function openCreate(playlist) {
  $("csNew").classList.toggle("hide", !playlist); $("csName").value = "";
  openOv("createSheet");
  if (playlist) setTimeout(() => $("csName").focus(), 60);
}
$("csPlaylist").onclick = () => { $("csNew").classList.remove("hide"); $("csName").focus(); };
$("csMake").onclick = async () => {
  const name = $("csName").value.trim();
  if (!name) { $("csName").focus(); return; }
  const p = await createPlaylist(name);
  if (p) { closeOv("createSheet"); toast("Created " + p.name); sfxDing(); go("pl:" + p.id); }
};
$("csName").onkeydown = (e) => { if (e.key === "Enter") $("csMake").click(); };
$("csUpload").addEventListener("click", () => setTimeout(() => closeOv("createSheet"), 0));
$("csJam").onclick = () => { closeOv("createSheet"); openJam(); };
$("tabs").onclick = (e) => { const b = e.target.closest("button"); if (b) go(b.dataset.v); };
$("navLib").onclick = () => go("lib");
$("side").addEventListener("click", (e) => { const b = e.target.closest("[data-spl]"); if (b) go("pl:" + b.dataset.spl); });
$("sideMk").onclick = async () => { await createFromInput($("sideNew")); };
$("sideNew").onkeydown = (e) => { if (e.key === "Enter") $("sideMk").click(); };

let reorderId = null;
$("lists").onclick = (e) => {
  const b = e.target.closest("button");
  if (b && b.dataset.reorder) { reorderId = reorderId ? null : view.slice(3); return drawLists(); }
  if (b && b.dataset.drag !== undefined) return;
  if ($("lists").classList.contains("reordering") && e.target.closest(".track[data-i]")) return; // no playing while reordering
  if (b) {
    if (b.dataset.like !== undefined) return toggleLike(shown[+b.dataset.like]);
    if (b.dataset.recent) return openRecent(b.dataset.recent);
    if (b.dataset.dl) return toggleDownload(b.dataset.dl);
    if (b.dataset.rel) return go("rel:" + b.dataset.rel);
    if (b.dataset.reledit) return openRelease(releases.find((x) => String(x.id) === view.slice(4)));
    if (b.dataset.newrel) return openRelease(null, view.slice(3));
    if (b.dataset.newrelease) return openRelease(null);
    if (b.dataset.follow) return toggleFollow(view.slice(3));
    if (b.dataset.add !== undefined) return openPicker(shown[+b.dataset.add]);
    if (b.dataset.edit !== undefined) return openEdit(shown[+b.dataset.edit]);
    if (b.dataset.rm !== undefined) return removeFromPlaylist(+b.dataset.rm);
    if (b.dataset.dpl) { e.stopPropagation(); return deletePlaylist(b.dataset.dpl); }
    if (b.id === "mk") return createFromInput($("plName"));
    if (b.dataset.back !== undefined) return go(prevView && prevView !== view ? prevView : "pls");
    if (b.dataset.playall !== undefined) { if (shown.length) pickPlay(shown[0], shown, true); return; }
    if (b.dataset.pledit) { e.stopPropagation(); return openPlEdit(lists.find((x) => x.id === b.dataset.pledit)); }
    if (b.dataset.arclaim) return claimArtist(view.slice(3));
    if (b.dataset.aredit) return openArEdit(view.slice(3));
    if (b.dataset.shufplay !== undefined) {
      if (!shown.length) return;
      if (jam.role === "guest") { jamCmd({ cmd: "list", ids: shuffled(shown, null).map((x) => x.id) }); toast("Shuffling this list for the Jam"); return; }
      if (shuffleOn) { setShuffle(false); return; }
      setShuffle(true, true); toast("Shuffle on");
      pickPlay(shown[Math.floor(Math.random() * shown.length)], shown); drawLists(); return;
    }
  }
  if (b && b.dataset.chip) { libFilter = b.dataset.chip; return drawLists(); }
  if (b && b.dataset.lsort) { libSort = libSort === "alpha" ? "recent" : "alpha"; try { localStorage.setItem("jukebox_libsort", libSort); } catch (e2) {} return drawLists(); }
  if (e.target.closest("[data-golib]")) return go("lib");
  if (e.target.closest("[data-goliked]")) return go("liked");
  const rr = e.target.closest(".track[data-rel]"); if (rr) return go("rel:" + rr.dataset.rel);
  if (e.target.closest("[data-newpl]")) return openCreate(true);
  const ar = e.target.closest("[data-ar]");
  if (ar) return goArtist(ar.dataset.ar);
  const al = e.target.closest(".alink");
  if (al && (!isPhoneLayout() || !al.closest(".track"))) return goArtist(al.dataset.artist); // phones: tapping a song row plays it
  const pl = e.target.closest("[data-pl]");
  if (pl) return go("pl:" + pl.dataset.pl);
  const r = e.target.closest(".track[data-i]");
  if (r) pickPlay(shown[+r.dataset.i], shown);
};
$("lists").onkeydown = (e) => {
  if (e.target.id === "plName" && e.key === "Enter") return createFromInput(e.target);
  if (e.key !== "Enter" || !e.target.classList.contains("track")) return;
  if (e.target.dataset.golib) go("lib");
  else if (e.target.dataset.newpl) openCreate(true);
  else if (e.target.dataset.ar) goArtist(e.target.dataset.ar);
  else if (e.target.dataset.rel) go("rel:" + e.target.dataset.rel);
  else if (e.target.dataset.pl) go("pl:" + e.target.dataset.pl);
  else pickPlay(shown[+e.target.dataset.i], shown);
};
// tapping a song: plays it, or in someone else's Jam adds it to the shared queue
function pickPlay(t, list, wholeList) {
  if (!t) return;
  if (jam.role === "guest") {
    if (wholeList) { jamCmd({ cmd: "list", ids: list.map((x) => x.id) }); toast("Playing this list for the Jam"); }
    else enqueue(t);
    return;
  }
  // "Playing from" label for the full-screen player
  const pl = view.startsWith("pl:") && lists.find((x) => x.id === view.slice(3));
  ctxName = query ? 'Search "' + $("q").value.trim() + '"' : pl ? pl.name : view.startsWith("ar:") ? view.slice(3) : view.startsWith("rel:") ? (releases.find((r) => String(r.id) === view.slice(4)) || {}).title || "Album" : view === "liked" ? "Liked Songs" : "Library";
  // remember for "Recently played" on Home: the collection you played from, or the song itself
  rememberRecent(view.startsWith("pl:") || view.startsWith("ar:") || view.startsWith("rel:") || view === "liked" ? (query ? "t:" + t.id : view) : "t:" + t.id);
  playTrack(t, list);
}

/* ---------- swipe right on a song to queue it (touch) ---------- */
let sw = null, swallowClick = false;
const L = $("lists");
L.addEventListener("pointerdown", (e) => {
  if (L.classList.contains("reordering")) return;
  if (e.pointerType !== "touch") return;
  const row = e.target.closest(".track[data-i]");
  if (!row || e.target.closest("button")) return;
  sw = { row, pid: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, on: false };
});
L.addEventListener("pointermove", (e) => {
  if (!sw || e.pointerId !== sw.pid) return;
  const dx = e.clientX - sw.x0, dy = e.clientY - sw.y0;
  if (!sw.on) {
    if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { sw = null; return; } // it's a scroll
    if (dx > 12 && dx > Math.abs(dy) * 1.2) {
      sw.on = true;
      try { sw.row.setPointerCapture(sw.pid); } catch (_) {}
      sw.row.classList.remove("settle");
    } else return;
  }
  sw.dx = Math.max(0, dx - 12);
  sw.row.style.transform = `translateX(${sw.dx}px)`;
  const armed = sw.dx > Math.min(140, sw.row.offsetWidth * 0.35);
  if (armed !== sw.row.classList.contains("armed")) {
    sw.row.classList.toggle("armed", armed);
    if (armed && navigator.vibrate) navigator.vibrate(8);
  }
});
function endSwipe(e, commit) {
  if (!sw || e.pointerId !== sw.pid) return;
  const s = sw; sw = null;
  if (!s.on) return;
  const armed = s.row.classList.contains("armed");
  s.row.classList.remove("armed");
  s.row.classList.add("settle");
  s.row.style.transform = "";
  swallowClick = true; setTimeout(() => (swallowClick = false), 400); // the lift-off isn't a tap
  if (commit && armed) enqueue(shown[+s.row.dataset.i]);
}
L.addEventListener("pointerup", (e) => endSwipe(e, true));
L.addEventListener("pointercancel", (e) => endSwipe(e, false));
L.addEventListener("click", (e) => { if (swallowClick) { swallowClick = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);

/* ---------- queueing ---------- */
function enqueue(t, next) {
  if (!t) return;
  if (jam.role === "guest") { jamCmd({ cmd: "add", id: t.id, next: !!next }); sfxDing(); toast("Added to the Jam: " + t.title); return; }
  next ? userQueue.unshift(t) : userQueue.push(t);
  sfxDing(); updateQBtn();
  if (isOpen("qModal")) renderQueue();
  toast((next ? "Playing next: " : "Queued: ") + t.title);
}

/* ---------- playlists ---------- */
async function createPlaylist(name, firstTrackId) {
  const { data, error } = await sb.from("playlists")
    .insert({ name, owner: myName(), user_id: me.id, track_ids: firstTrackId != null ? [firstTrackId] : [] })
    .select().single();
  if (error) { say(error.message); return null; }
  lists.push(data);
  return data;
}

async function createFromInput(input) {
  const name = input.value.trim();
  if (!name) { input.focus(); toast("Give the playlist a name."); return; }
  const p = await createPlaylist(name);
  if (p) { input.value = ""; toast("Created " + p.name); sfxDing(); go("pl:" + p.id); }
}

async function saveIds(p, ids) {
  const { error } = await sb.from("playlists").update({ track_ids: ids }).eq("id", p.id);
  if (error) { say(error.message); return false; }
  p.track_ids = ids;
  return true;
}

async function removeFromPlaylist(i) {
  const p = lists.find((x) => x.id === view.slice(3));
  const t = shown[i];
  if (!p || !t) return;
  if (await saveIds(p, p.track_ids.filter((id) => id !== t.id))) { sfxDrop(); drawLists(); }
}

async function deletePlaylist(id) {
  const p = lists.find((x) => x.id === id);
  if (!p || !confirm("Delete playlist " + p.name + "?")) return;
  const { error } = await sb.from("playlists").delete().eq("id", id);
  if (error) { say(error.message); return; }
  if (p.cover_path) sb.storage.from("music").remove([p.cover_path]);
  lists = lists.filter((x) => x.id !== id);
  sfxDrop();
  drawLists();
}

/* ---------- artist profiles: claim, picture, bio ---------- */
const ARTIST_SQL_MSG = 'Artist profiles need one-time setup: run the "ARTIST PROFILES" SQL from the top of the script in Supabase > SQL Editor.';
async function claimArtist(name) {
  if (artistsNoTable) { alert(ARTIST_SQL_MSG); return; }
  if (!canClaim(name)) { toast("Only someone who uploaded this artist's songs can claim them"); return; }
  if (!confirm(`Claim ${name}? You'll be the only one who can change their picture and bio.`)) return;
  const { data, error } = await sb.from("artists").insert({ name, claimed_by: me.id, claimed_name: myName() }).select().single();
  if (error) {
    if (/duplicate|unique|23505/i.test((error.code || "") + error.message)) toast("Someone already claimed this artist");
    else if (/artists|schema cache|does not exist/i.test(error.message)) alert(ARTIST_SQL_MSG);
    else say(error.message);
    await loadAll(); return;
  }
  artistInfo.set(name, data || { name, claimed_by: me.id, claimed_name: myName() });
  sfxDing(); toast("You claimed " + name);
  drawLists(); openArEdit(name);
}
let arEditing = null, arPending = null, arDrop = false, arUrl = null;
function paintArePrev() {
  const name = arEditing; if (name == null) return;
  const r = artistInfo.get(name) || {};
  $("arePrev").innerHTML = arUrl ? `<img src="${arUrl}" alt="">`
    : (!arDrop && r.picture_path) ? `<img src="${artistPicUrl(r)}" alt="">`
    : artistFallbackArt(name);
  $("areNoPic").classList.toggle("hide", !(arUrl || (r.picture_path && !arDrop)));
}
function openArEdit(name) {
  if (!myArtist(name)) return;
  arEditing = name; arPending = null; arDrop = false;
  if (arUrl) { URL.revokeObjectURL(arUrl); arUrl = null; }
  $("areTitle").textContent = "Artist profile · " + name;
  $("areBio").value = artistInfo.get(name)?.bio || "";
  $("areMsg").textContent = ""; $("areSave").disabled = false;
  paintArePrev(); openOv("arEditModal");
}
$("areImg").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = "";
  if (!f) return;
  try {
    arPending = await resizeImage(f, 480); arDrop = false;
    if (arUrl) URL.revokeObjectURL(arUrl);
    arUrl = URL.createObjectURL(arPending); $("areMsg").textContent = ""; paintArePrev();
  } catch (err) { $("areMsg").textContent = err.message; }
};
$("areNoPic").onclick = () => { arPending = null; arDrop = true; if (arUrl) { URL.revokeObjectURL(arUrl); arUrl = null; } paintArePrev(); };
$("areCancel").onclick = () => closeOv("arEditModal");
$("areSave").onclick = async () => {
  const name = arEditing, r = artistInfo.get(name); if (!r) return;
  const patch = { bio: $("areBio").value.trim() || null, claimed_name: myName(), updated_at: new Date().toISOString() };
  $("areSave").disabled = true; $("areMsg").textContent = "Saving...";
  let newPath = null;
  if (arPending) {
    newPath = `${me.id}/artist_${Date.now()}.jpg`;
    const up = await sb.storage.from("music").upload(newPath, arPending, { contentType: "image/jpeg" });
    if (up.error) { $("areMsg").textContent = "Photo upload failed: " + up.error.message; $("areSave").disabled = false; return; }
    patch.picture_path = newPath;
  } else if (arDrop) patch.picture_path = null;
  const { error } = await sb.from("artists").update(patch).eq("name", name);
  if (error) { if (newPath) sb.storage.from("music").remove([newPath]); $("areMsg").textContent = error.message; $("areSave").disabled = false; return; }
  if ((newPath || arDrop) && r.picture_path) sb.storage.from("music").remove([r.picture_path]);
  Object.assign(r, patch);
  if (arUrl) { URL.revokeObjectURL(arUrl); arUrl = null; }
  closeOv("arEditModal"); sfxDing(); toast("Artist profile saved");
  drawLists(); setNow();
};
$("areRelease").onclick = async () => {
  const name = arEditing, r = artistInfo.get(name); if (!r) return;
  if (!confirm(`Give up your claim on ${name}? Their picture and bio will be removed, and someone else can claim them.`)) return;
  const { error } = await sb.from("artists").delete().eq("name", name);
  if (error) { $("areMsg").textContent = error.message; return; }
  if (r.picture_path) sb.storage.from("music").remove([r.picture_path]);
  artistInfo.delete(name);
  closeOv("arEditModal"); sfxDrop(); toast("Claim released");
  drawLists(); setNow();
};

/* ---------- edit playlist: cover + name ---------- */
let plEditing = null, plPending = null, plDrop = false, plUrl = null;
function paintPlePrev() {
  const p = plEditing; if (!p) return;
  $("plePrev").innerHTML = plUrl ? `<img src="${plUrl}" alt="">`
    : plDrop ? plArtHTML({ ...p, cover_path: null })
    : plArtHTML(p);
  $("pleNoCover").classList.toggle("hide", !(plUrl || (p.cover_path && !plDrop)));
}
function openPlEdit(p) {
  if (!p || p.user_id !== me.id) return;
  plEditing = p; plPending = null; plDrop = false;
  if (plUrl) { URL.revokeObjectURL(plUrl); plUrl = null; }
  $("pleName").value = p.name;
  $("pleMsg").textContent = "";
  $("pleSave").disabled = false;
  paintPlePrev();
  openOv("plEditModal");
}
$("pleImg").onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = "";
  if (!f) return;
  try {
    plPending = await resizeImage(f, 480); plDrop = false;
    if (plUrl) URL.revokeObjectURL(plUrl);
    plUrl = URL.createObjectURL(plPending);
    $("pleMsg").textContent = ""; paintPlePrev();
  } catch (err) { $("pleMsg").textContent = err.message; }
};
$("pleNoCover").onclick = () => { plPending = null; plDrop = true; if (plUrl) { URL.revokeObjectURL(plUrl); plUrl = null; } paintPlePrev(); };
$("pleCancel").onclick = () => closeOv("plEditModal");
$("pleName").onkeydown = (e) => { if (e.key === "Enter") $("pleSave").click(); };
$("pleSave").onclick = async () => {
  const p = plEditing; if (!p) return;
  const name = $("pleName").value.trim();
  if (!name) { $("pleMsg").textContent = "Give the playlist a name."; return; }
  const patch = { name };
  $("pleSave").disabled = true; $("pleMsg").textContent = "Saving...";
  let newPath = null;
  if (plPending) {
    newPath = `${me.id}/plcover_${Date.now()}.jpg`;
    const up = await sb.storage.from("music").upload(newPath, plPending, { contentType: "image/jpeg" });
    if (up.error) { $("pleMsg").textContent = "Cover upload failed: " + up.error.message; $("pleSave").disabled = false; return; }
    patch.cover_path = newPath;
  } else if (plDrop) patch.cover_path = null;
  const { error } = await sb.from("playlists").update(patch).eq("id", p.id);
  if (error) {
    if (newPath) sb.storage.from("music").remove([newPath]);
    $("pleMsg").textContent = /cover_path|schema cache|does not exist/i.test(error.message)
      ? "Playlist covers need one line of setup SQL in Supabase (see the comment at the top of the script): alter table public.playlists add column if not exists cover_path text;"
      : error.message;
    $("pleSave").disabled = false;
    return;
  }
  if ((newPath || plDrop) && p.cover_path) sb.storage.from("music").remove([p.cover_path]);
  Object.assign(p, patch);
  if (plUrl) { URL.revokeObjectURL(plUrl); plUrl = null; }
  closeOv("plEditModal");
  sfxDing(); toast("Playlist updated");
  drawLists();
};

function openPicker(t) {
  if (!t) return;
  pickTrack = t;
  $("pickTitle").textContent = t.title;
  $("pickMsg").textContent = "";
  $("newName").value = "";
  drawPick();
  openOv("modal");
}
function closePicker() { closeOv("modal"); }
$("qNext").onclick = () => { if (!pickTrack) return; enqueue(pickTrack, true); $("pickMsg").textContent = "Playing next: " + pickTrack.title; };
$("qAdd").onclick = () => { if (!pickTrack) return; enqueue(pickTrack); $("pickMsg").textContent = "Queued: " + pickTrack.title; };

function drawPick() {
  const mine = myLists();
  $("pickList").innerHTML = mine.length
    ? mine.map((p) => `<div class="track" tabindex="0" data-pick="${esc(p.id)}"><span class="t">${esc(p.name)}</span><span>${p.track_ids.includes(pickTrack.id) ? "ADDED" : "+"}</span></div>`).join("")
    : '<div class="empty">No playlists yet. Name one below.</div>';
}

$("pickList").onclick = async (e) => {
  const el = e.target.closest("[data-pick]");
  if (!el || !pickTrack) return;
  const p = lists.find((x) => x.id === el.dataset.pick);
  if (!p || p.track_ids.includes(pickTrack.id)) return;
  if (await saveIds(p, [...p.track_ids, pickTrack.id])) { $("pickMsg").textContent = "Added to " + p.name; sfxDing(); drawPick(); drawSide(); }
};
$("pickList").onkeydown = (e) => { if (e.key === "Enter" && e.target.dataset.pick) e.target.click(); };
$("newAdd").onclick = async () => {
  const name = $("newName").value.trim();
  if (!name || !pickTrack) return;
  const p = await createPlaylist(name, pickTrack.id);
  if (p) { $("pickMsg").textContent = "Added to " + p.name; sfxDing(); $("newName").value = ""; drawPick(); drawSide(); }
};
$("pickClose").onclick = closePicker;

/* ---------- player ---------- */
function urlFor(t) { return sb.storage.from("music").getPublicUrl(t.path).data.publicUrl; }

function setNow() {
  const t = curTrack();
  $("now").textContent = t ? t.title : "Nothing playing";
  $("now").classList.toggle("idle", !t);
  paintLikes();
  $("player").classList.toggle("idle", !t); syncSizes();
  $("nowBy").textContent = t ? artistOf(t) : "";
  $("pAdd").classList.toggle("invis", !t);
  $("mini").setAttribute("role", t ? "button" : "group");
  $("mini").tabIndex = t ? 0 : -1;
  paintPlayBtn();
  if (fullOpen()) { if (t) renderFull(); else closeFull(); }
  const i = queue.findIndex((x) => x.id === nowId);
  $("lvl").textContent = !t ? 0 : i >= 0 ? i + 1 : "Q";
  $("art").classList.toggle("hide", !t);
  $("art").innerHTML = t ? thumbHTML(t) : "";
  renderLyrics(); markNow();
  if (isOpen("qModal")) renderQueue();
}

// listen counter state: a listen counts after ~30s (or half of a short song) of real playback
let listened = 0, lastT = 0, counted = false;

function playTrack(t, q, viaQueue) {
  if (!t) return;
  if (q) { queueOrig = [...q]; queue = shuffleOn ? shuffled(q, t.id) : [...q]; }
  if (!viaQueue) ctxId = t.id;
  nowId = t.id;
  newSession();
  audio.src = urlFor(t);
  audio.play().catch(() => {});
  setNow(); updateQBtn(); setMeta(t);
}
function setMeta(t) {
  if (!("mediaSession" in navigator) || !t) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title, artist: artistOf(t), album: "Budsbox",
      artwork: artUrl(t) ? [{ src: artUrl(t), sizes: "320x320", type: "image/jpeg" }] : [],
    });
  } catch (e) {}
}

// next song: queued ones first, then the list carries on
function advance() {
  if (userQueue.length) { playTrack(userQueue.shift(), null, true); return true; }
  const i = queue.findIndex((t) => t.id === ctxId);
  const n = i >= 0 ? queue[i + 1] : null;
  if (n) { playTrack(n); return true; }
  if (repeatMode === "all" && queue.length) { playTrack(queue[0]); return true; } // loop the list
  return false;
}

/* ---------- shuffle + repeat (off / all / one) ---------- */
let shuffleOn = false, repeatMode = "off", queueOrig = null;
try { shuffleOn = localStorage.getItem("jukebox_shuffle") === "1"; const r = localStorage.getItem("jukebox_repeat"); if (["off", "all", "one"].includes(r)) repeatMode = r; } catch (e) {}
function shuffled(list, firstId) {
  const first = list.find((x) => x.id === firstId);
  const rest = list.filter((x) => x.id !== firstId);
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  return first ? [first, ...rest] : rest;
}
function paintModes() {
  $("shufBtn").classList.toggle("on", shuffleOn);
  $("shufBtn").setAttribute("aria-pressed", String(shuffleOn));
  $("shufBtn").title = shuffleOn ? "Shuffle: on" : "Shuffle: off";
  $("repBtn").classList.toggle("on", repeatMode !== "off");
  $("repBtn").classList.toggle("one", repeatMode === "one");
  const label = { off: "Repeat: off", all: "Repeat: all", one: "Repeat: one song" }[repeatMode];
  $("repBtn").setAttribute("aria-label", label); $("repBtn").title = label;
  // full-screen player mirrors the bar
  $("fShuf").classList.toggle("on", shuffleOn); $("fShuf").setAttribute("aria-pressed", String(shuffleOn));
  $("fRep").classList.toggle("on", repeatMode !== "off"); $("fRep").classList.toggle("one", repeatMode === "one");
  $("fRep").setAttribute("aria-label", label);
}
function setShuffle(on, quiet) {
  if (jam.role === "guest") { toast("The Jam host controls shuffle"); return false; }
  if (on === shuffleOn) return true;
  shuffleOn = on;
  if (shuffleOn) { queueOrig = queueOrig || [...queue]; queue = shuffled(queue, ctxId); }
  else if (queueOrig) queue = [...queueOrig];
  try { localStorage.setItem("jukebox_shuffle", shuffleOn ? "1" : "0"); } catch (e) {}
  paintModes(); if (!quiet) toast(shuffleOn ? "Shuffle on" : "Shuffle off");
  setNow(); jamPush(); drawLists();
  return true;
}
$("shufBtn").onclick = () => setShuffle(!shuffleOn);
$("fShuf").onclick = () => setShuffle(!shuffleOn);
$("fRep").onclick = () => $("repBtn").click();
$("repBtn").onclick = () => {
  if (jam.role === "guest") { toast("The Jam host controls repeat"); return; }
  repeatMode = { off: "all", all: "one", one: "off" }[repeatMode];
  try { localStorage.setItem("jukebox_repeat", repeatMode); } catch (e) {}
  paintModes(); toast({ off: "Repeat off", all: "Repeating this list", one: "Repeating this song" }[repeatMode]);
};
paintModes();

function step(d) {
  if (jam.role === "guest") { jamCmd({ cmd: d > 0 ? "next" : "prev" }); return; }
  if (d > 0) { advance(); return; }
  if (audio.currentTime > 3 || nowId !== ctxId) { audio.currentTime = 0; return; } // restart before going back
  const i = queue.findIndex((t) => t.id === ctxId);
  if (i > 0) playTrack(queue[i - 1]);
}

function seekBy(s) {
  if (!isFinite(audio.duration)) return;
  seekTo(audio.currentTime + s);
}
function seekTo(sec) {
  if (!isFinite(audio.duration)) return;
  audio.currentTime = Math.max(0, Math.min(audio.duration, sec));
  syncPos();
  if (jam.role === "guest") jamSeek(audio.currentTime);
}

function updateQBtn() { $("qBtn").classList.toggle("on", userQueue.length > 0); paintNpNext(); jamPush(); }

async function countListen(id) {
  const t = all.find((x) => x.id === id);
  if (!t) return;
  t.plays = (t.plays || 0) + 1;
  paintPlays(t);
  const { data, error } = await sb.rpc("bump_play", { tid: String(id) });
  if (error) { t.plays--; paintPlays(t); console.warn("bump_play failed (run the SQL in the script comment):", error.message); }
  else if (typeof data === "number") { t.plays = data; paintPlays(t); }
  // leaderboard: this session now counts as a listen
  sessCounted = true; flushListen();
}

/* ---------- listening sessions (for "time listened") ---------- */
let sessTrack = null, pendingSec = 0, sessCounted = false, sessCountSent = false;
function newSession() {
  flushListen();
  sessTrack = nowId; pendingSec = 0; sessCounted = false; sessCountSent = false;
  listened = 0; lastT = 0; counted = false;
}
// save the real seconds listened since the last save (and whether this play counted as a listen)
async function flushListen() {
  if (!me || lb.noTable || sessTrack == null) return;
  const sec = Math.round(pendingSec), c = sessCounted && !sessCountSent;
  if (sec < 1 && !c) return;
  pendingSec = 0; if (c) sessCountSent = true;
  const base = { track_id: String(sessTrack), user_id: me.id, listener: myName() };
  if (lb.oldSchema) { if (c) sb.from("listens").insert(base).then(() => {}); return; }
  const r = await sb.from("listens").insert({ ...base, seconds: sec, counted: c });
  if (!r.error) { lb.at = 0; return; }
  const m = r.error.message || "";
  if (/seconds|counted/i.test(m)) { lb.oldSchema = true; if (c) await sb.from("listens").insert(base); }
  else if (/listens|schema cache|does not exist/i.test(m)) lb.noTable = true;
  console.warn("listen history not saved:", m);
}
document.addEventListener("visibilitychange", () => { if (document.hidden) flushListen(); });
addEventListener("pagehide", () => flushListen());

/* ---------- leaderboard (Settings > Fun) ---------- */
const lb = { tab: "time", rows: null, at: 0, noTable: false, oldSchema: false, err: "" };
const COLS_ERR = /seconds|counted/i, TABLE_ERR = /listens|schema cache|does not exist/i;
async function lbLoad(force) {
  if (!force && lb.rows && Date.now() - lb.at < 60000) return;
  let { data, error } = await sb.from("listens").select("track_id,user_id,listener,created_at,seconds,counted").order("created_at", { ascending: true }).limit(50000);
  if (error && COLS_ERR.test(error.message)) {
    lb.oldSchema = true;
    ({ data, error } = await sb.from("listens").select("track_id,user_id,listener,created_at").order("created_at", { ascending: true }).limit(50000));
  }
  if (error) { lb.rows = []; lb.err = error.message; lb.noTable = TABLE_ERR.test(error.message); }
  else { lb.rows = data || []; lb.err = ""; lb.noTable = false; }
  lb.at = Date.now();
}
function lbStats() {
  const ids = new Set(all.map((t) => String(t.id)));
  const names = new Map(), people = new Map();
  for (const r of lb.rows) {
    names.set(r.user_id, r.listener || "Player"); // latest name wins
    if (!ids.has(String(r.track_id))) continue; // song was deleted
    const u = people.get(r.user_id) || { sec: 0, n: 0, secBy: new Map(), nBy: new Map() };
    const sec = +r.seconds || 0, tid = String(r.track_id);
    u.sec += sec; u.secBy.set(tid, (u.secBy.get(tid) || 0) + sec);
    if (r.counted !== false) { u.n++; u.nBy.set(tid, (u.nBy.get(tid) || 0) + 1); }
    people.set(r.user_id, u);
  }
  return { names, people };
}
// 3h 12m / 14m / 45s
function fmtLong(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : m ? `${m}m` : `${sec}s`;
}
const lbRank = (i) => `<span class="lbrank r${i + 1}">${i < 3 ? ["1st", "2nd", "3rd"][i] : i + 1}</span>`;
const lbSetup = () => `<div class="empty">This part of the leaderboard starts once the <b>listens</b> table exists. Run the "LEADERBOARD" SQL from the top of the script in Supabase &gt; SQL Editor. Top songs already works.</div>`;
const favOf = (m) => { let best = null, v = 0; for (const [k, n] of m) if (n > v) { v = n; best = k; } return best && all.find((t) => String(t.id) === best); };
function renderLb() {
  document.querySelectorAll("#lbTabs button").forEach((b) => { const on = b.dataset.lb === lb.tab; b.classList.toggle("go", on); b.setAttribute("aria-selected", String(on)); });
  const box = $("lbBody");
  if (lb.tab === "songs") {
    lb.top = [...all].filter((t) => (t.plays || 0) > 0).sort((a, b) => (b.plays || 0) - (a.plays || 0)).slice(0, 15);
    box.innerHTML = lb.top.length
      ? lb.top.map((t, i) => `<div class="lbrow" data-lbplay="${i}" role="button" tabindex="0" title="Play">${lbRank(i)}${thumbHTML(t)}<span class="meta"><span class="t">${esc(t.title)}</span><span class="by">${esc(artistOf(t))}</span></span><span class="lbscore">▶ ${t.plays}</span></div>`).join("") + '<div class="lbnote">All-time listens. Tap a song to play it.</div>'
      : '<div class="empty">No listens yet. Play something for 30 seconds!</div>';
    return;
  }
  if (!lb.rows) { box.innerHTML = '<div class="empty">Loading...</div>'; return; }
  if (lb.noTable) { box.innerHTML = lbSetup(); return; }
  if (lb.err) { box.innerHTML = `<div class="empty">${esc(lb.err)}</div>`; return; }
  const st = lbStats();
  const nameOf = (uid) => uid === me.id ? myName() : st.names.get(uid) || "Player";
  const row = (uid, i, sub, score) => `<div class="lbrow${uid === me.id ? " me" : ""}">${lbRank(i)}<span class="meta"><span class="t">${esc(nameOf(uid))}${uid === me.id ? " (you)" : ""}</span><span class="by">${sub}</span></span><span class="lbscore">${score}</span></div>`;
  if (lb.tab === "time") {
    if (lb.oldSchema) { box.innerHTML = '<div class="empty">Time listened needs two new columns. In Supabase &gt; SQL Editor run:<br><br>alter table public.listens add column if not exists seconds integer not null default 0, add column if not exists counted boolean not null default true;</div>'; return; }
    const board = [...st.people.entries()].filter(([, u]) => u.sec > 0).sort((a, b) => b[1].sec - a[1].sec).slice(0, 15);
    box.innerHTML = board.length
      ? board.map(([uid, u], i) => { const f = favOf(u.secBy); return row(uid, i, "Most time on: " + esc(f ? f.title : "?"), fmtLong(u.sec)); }).join("") +
        '<div class="lbnote">Real listening time: skipping ahead doesn\'t count, pausing stops the clock.</div>'
      : '<div class="empty">No listening time yet. Press play!</div>';
    return;
  }
  const board = [...st.people.entries()].filter(([, u]) => u.n > 0).sort((a, b) => b[1].n - a[1].n).slice(0, 15);
  box.innerHTML = board.length
    ? board.map(([uid, u], i) => { const f = favOf(u.nBy); return row(uid, i, "Most played: " + esc(f ? f.title : "?"), `${u.n} listen${u.n === 1 ? "" : "s"}`); }).join("") +
      '<div class="lbnote">A listen counts after about 30 seconds of real playback.</div>'
    : '<div class="empty">No listens recorded yet.</div>';
}
async function openLb() {
  toggleMenu(false);
  renderLb(); openOv("lbModal");
  await lbLoad(); if (isOpen("lbModal")) renderLb();
}
$("lbOpen").onclick = openLb;
$("lbClose").onclick = () => closeOv("lbModal");
$("lbTabs").onclick = (e) => { const b = e.target.closest("[data-lb]"); if (b) { lb.tab = b.dataset.lb; renderLb(); } };
$("lbBody").onclick = (e) => { const r = e.target.closest("[data-lbplay]"); if (r && lb.top) pickPlay(lb.top[+r.dataset.lbplay], lb.top); };
$("lbBody").onkeydown = (e) => { if (e.key === "Enter" && e.target.dataset.lbplay !== undefined) e.target.click(); };
function paintPlays(t) {
  document.querySelectorAll("[data-plays]").forEach((el) => { if (el.dataset.plays === String(t.id)) el.textContent = "▶ " + (t.plays || 0); });
  if (t.id === nowId) paintPlayCount(t);
}

$("play").onclick = () => {
  if (jam.role === "guest") {
    // the host is playing but this phone blocked autoplay: start locally, in sync
    if (jam.last?.playing && audio.paused && nowId != null) { jam.blocked = false; if (isFinite(audio.duration)) audio.currentTime = jamWant(); audio.play().catch(() => {}); return; }
    jamCmd({ cmd: audio.paused ? "play" : "pause" });
    return;
  }
  if (nowId == null) { if (shown.length) playTrack(shown[0], shown); else if (all.length) playTrack(all[0], all); return; }
  audio.paused ? audio.play().catch(() => {}) : pauseByUser();
};
$("prev").onclick = () => step(-1);
$("next").onclick = () => step(1);

/* ---------- lock screen / AirPods (Media Session) ---------- */
function initMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const ms = navigator.mediaSession;
  const on = (a, f) => { try { ms.setActionHandler(a, f); } catch (e) {} };
  on("play", () => { if (nowId == null) { if (all.length) playTrack(all[0], all); } else resumePlay(); });
  on("pause", () => audio.pause());
  on("previoustrack", () => step(-1));
  on("nexttrack", () => step(1));
  on("seekto", (d) => {
    if (!isFinite(audio.duration)) return;
    if (d.fastSeek && "fastSeek" in audio && jam.role !== "guest") { audio.fastSeek(d.seekTime); syncPos(); }
    else seekTo(d.seekTime);
  });
  // No 10-second skip handlers on purpose: when they exist, iPhones show "10s" buttons on the
  // lock screen instead of previous / next song. Clearing them gives whole-song skipping.
  on("seekforward", null);
  on("seekbackward", null);
}
function syncPos() {
  const ms = navigator.mediaSession;
  if (!ms || !ms.setPositionState) return;
  const d = audio.duration;
  if (!isFinite(d) || d <= 0) return;
  try { ms.setPositionState({ duration: d, playbackRate: audio.playbackRate || 1, position: Math.min(audio.currentTime, d) }); } catch (e) {}
}
initMediaSession();

/* ---------- resume after AirPods come back ----------
   iPhone Safari pauses web audio by itself when an AirPod comes out (or Bluetooth drops, or a call
   comes in), and doesn't always send "play" back when it goes in again. So: remember pauses the
   person didn't ask for, and resume when the phone reports its audio device or session is back. */
let userPause = false, resumeHint = null, lastPos = 0;
const RESUME_WINDOW = 20 * 60 * 1000; // a rest between sets
function pauseByUser() { resumeHint = null; if (audio.paused) return; userPause = true; audio.pause(); }
function resumePlay() {
  if (nowId == null) return;
  const t = curTrack();
  // Safari sometimes drops the track while paused in the background: load it again at the same spot
  if (t && (audio.error || audio.readyState === 0 || !audio.getAttribute("src") || audio.currentSrc.startsWith("data:"))) {
    audio.src = urlFor(t);
    audio.addEventListener("loadedmetadata", () => { try { audio.currentTime = Math.min(lastPos, audio.duration || lastPos); } catch (e) {} }, { once: true });
  }
  audio.play().catch(() => setTimeout(() => { if (audio.paused) audio.play().catch(() => {}); }, 300));
}
function tryAutoResume() {
  if (!resumeHint || !audio.paused || nowId == null || jam.role === "guest") return;
  if (Date.now() - resumeHint > RESUME_WINDOW) { resumeHint = null; return; }
  resumeHint = null;
  resumePlay();
}
try { navigator.mediaDevices && navigator.mediaDevices.addEventListener("devicechange", () => setTimeout(tryAutoResume, 400)); } catch (e) {}
try {
  if (navigator.audioSession && "onstatechange" in navigator.audioSession) {
    navigator.audioSession.addEventListener("statechange", () => { if (navigator.audioSession.state !== "interrupted") setTimeout(tryAutoResume, 400); });
  }
} catch (e) {}

audio.onplay = () => {
  publishActivity();
  resumeHint = null;
  paintPlayBtn();
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
  markNow(); syncPos(); jamPush();
};
audio.onpause = () => {
  publishActivity();
  // a pause nobody asked for (AirPod out, Bluetooth drop, call): remember to pick it back up
  if (!userPause && nowId != null && !audio.ended) resumeHint = Date.now();
  userPause = false;
  paintPlayBtn();
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
  markNow(); jamPush();
};
audio.onended = () => {
  if (jam.role === "guest") return; // the host decides what's next
  if (sleep.endOfSong) { setSleep(null); toast("Sleep timer: stopped after this song"); paintPlayBtn(); return; }
  if (repeatMode === "one" && nowId != null) { // play the same song again (counts as another listen)
    newSession();
    audio.currentTime = 0; audio.play().catch(() => {}); return;
  }
  if (!advance() && "mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
};
audio.onloadedmetadata = () => { syncPos(); const t = curTrack(); if (t && isFinite(audio.duration) && !audio.currentSrc.startsWith("data:")) rememberDur(t, audio.duration); };
audio.onseeked = () => { lastT = audio.currentTime; syncPos(); jamPush(); };

const fmt = (s) => (isFinite(s) ? Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0") : "0:00");
audio.ontimeupdate = () => {
  const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
  $("fill").style.width = pct + "%";
  $("bar").setAttribute("aria-valuenow", Math.round(pct));
  $("fFill").style.width = pct + "%";
  $("fBar").setAttribute("aria-valuenow", Math.round(pct));
  $("fCur").textContent = fmt(audio.currentTime);
  $("fDur").textContent = fmt(audio.duration);
  const cur = curTrack();
  $("tCur").textContent = fmt(audio.currentTime);
  $("tDur").textContent = fmt(audio.duration);
  // listen counter: count real playback time, so skipping around can't fake it
  const ct = audio.currentTime, dt = ct - lastT;
  if (ct > 0) lastPos = ct;
  if (dt > 0 && dt < 4 && !audio.paused) { listened += dt; pendingSec += dt; }
  lastT = ct;
  if (pendingSec >= 60) flushListen(); // save long listens as they go
  if (!counted && nowId != null) {
    const need = isFinite(audio.duration) && audio.duration > 0 ? Math.min(30, audio.duration * 0.5) : 30;
    if (listened >= need) { counted = true; countListen(nowId); }
  }
  syncPos();
};

/* ---------- volume ---------- */
// iPhones/iPads ignore audio.volume (hardware buttons only), so the slider only shows where it works
const volOK = (() => {
  try {
    const iOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const a = new Audio(); a.volume = 0.5;
    return !iOS && Math.abs(a.volume - 0.5) < 0.01;
  } catch (e) { return false; }
})();
let vol = 0.8, muted = false;
try { const v = parseFloat(localStorage.getItem("jukebox_vol")); if (v >= 0 && v <= 1) vol = v; muted = localStorage.getItem("jukebox_muted") === "1"; } catch (e) {}
function applyVol(save) {
  if (!volOK) return;
  audio.volume = vol; audio.muted = muted || vol === 0;
  const shownV = audio.muted ? 0 : Math.round(vol * 100);
  $("volR").value = shownV;
  $("volR").style.setProperty("--v", shownV + "%");
  $("volR").setAttribute("aria-valuetext", shownV + "%");
  $("volIco").setAttribute("href", audio.muted ? "#ic-mute" : "#ic-vol");
  $("muteBtn").setAttribute("aria-label", audio.muted ? "Unmute" : "Mute");
  $("muteBtn").title = (audio.muted ? "Unmute" : "Mute") + " (M)";
  if (save) { try { localStorage.setItem("jukebox_vol", String(vol)); localStorage.setItem("jukebox_muted", muted ? "1" : "0"); } catch (e) {} }
}
$("volR").addEventListener("input", () => { vol = $("volR").value / 100; muted = false; applyVol(true); });
$("muteBtn").onclick = () => { if (muted || vol === 0) { muted = false; if (vol === 0) vol = 0.5; } else muted = true; applyVol(true); };
document.addEventListener("keydown", (e) => {
  if (!volOK || !me || e.metaKey || e.ctrlKey || e.altKey || e.target.closest("input, textarea") || document.querySelector(".overlay:not(.hide)")) return;
  if (e.key === "m" || e.key === "M") $("muteBtn").click();
});
document.documentElement.classList.toggle("vol-ok", volOK);
applyVol(false);

/* experience bar scrubbing (tap or drag) */
function attachSeek(el) {
  let drag = false;
  const at = (e) => {
    const r = el.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    if (isFinite(audio.duration)) seekTo(p * audio.duration);
  };
  el.addEventListener("pointerdown", (e) => { drag = true; el.setPointerCapture(e.pointerId); at(e); });
  el.addEventListener("pointermove", (e) => { if (drag) at(e); });
  el.addEventListener("pointerup", () => { drag = false; });
  el.addEventListener("pointercancel", () => { drag = false; });
  el.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { seekBy(5); e.preventDefault(); }
    if (e.key === "ArrowLeft") { seekBy(-5); e.preventDefault(); }
  });
}
attachSeek($("bar")); attachSeek($("fBar"));

/* ---------- full-screen Now Playing (phones) ---------- */
const isPhoneLayout = () => matchMedia("(max-width: 1023px)").matches;
let ctxName = "Library";
const fullOpen = () => !$("full").classList.contains("hide");
function openFull() {
  if (!isPhoneLayout() || !me || fullOpen()) return;
  renderFull();
  const f = $("full");
  f.style.transform = ""; f.scrollTop = 0;
  f.classList.remove("hide", "settle"); f.classList.add("opening");
  setTimeout(() => f.classList.remove("opening"), 300);
  document.body.classList.add("full-open");
  try { history.pushState({ full: 1 }, ""); } catch (e) {} // phone back gesture closes it
  $("fDown").focus({ preventScroll: true });
}
function closeFull(fromHistory) {
  if (!fullOpen()) return;
  $("full").classList.add("hide");
  $("full").style.transform = "";
  document.body.classList.remove("full-open");
  if (!fromHistory && history.state && history.state.full) { try { history.back(); } catch (e) {} }
}
addEventListener("popstate", () => { if (fullOpen()) closeFull(true); });
$("mini").addEventListener("click", () => { if (curTrack()) openFull(); });
$("mini").addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && curTrack()) { e.preventDefault(); openFull(); } });
$("fDown").onclick = () => closeFull();
$("fPlay").onclick = () => $("play").click();
$("fPrev").onclick = () => step(-1);
$("fNext").onclick = () => step(1);
$("fQueue").onclick = () => { renderQueue(); openOv("qModal"); };
$("fAdd").onclick = () => openPicker(curTrack());
$("fJam").onclick = openJam;
$("fEdit").onclick = () => { const t = curTrack(); if (t) openEdit(t); };

function renderFull() {
  if (!me) return;
  const t = curTrack();
  $("fFrom").textContent = jam.role === "guest" ? (jam.last?.host || "a friend") + "'s Jam" : ctxName;
  $("fArt").innerHTML = t ? (artUrl(t) ? `<span class="cover"><img src="${artUrl(t)}" alt="Album cover"></span>` : discHTML(t)) : discHTML({ id: "idle" });
  $("fTitle").textContent = t ? t.title : "Nothing playing";
  $("fBy").textContent = t ? artistOf(t) : "";
  $("fBy").classList.toggle("alinkish", !!(t && hasArtist(t)));
  $("fAdd").classList.toggle("hide", !t);
  $("fLyrics").textContent = t ? (t.lyrics && t.lyrics.trim() ? t.lyrics : "No lyrics yet.") : "Play a song to see its lyrics.";
  $("fEdit").classList.toggle("hide", !(t && t.user_id === me.id));
  const ab = t ? addedBy(t) : "";
  $("fAbout").innerHTML = t
    ? `${esc(artistOf(t))}${artistInfo.get(artistOf(t)) ? " \u2713" : ""}<br>▶ ${t.plays || 0} listen${(t.plays || 0) === 1 ? "" : "s"}` + (ab ? `<br><span class="ab">${esc(ab)}</span>` : "") +
      (artistInfo.get(artistOf(t))?.bio ? `<br><br>${esc(artistInfo.get(artistOf(t)).bio)}` : "")
    : "";
  $("fJamTag").textContent = $("jamTag").textContent;
  $("fJam").classList.toggle("go", !!jam.role);
}

// swipe down from the top of the full view to close it
(() => {
  const f = $("full");
  let y0 = null, dy = 0;
  f.addEventListener("touchstart", (e) => {
    y0 = f.scrollTop <= 0 && !e.target.closest("#fBar") ? e.touches[0].clientY : null; dy = 0;
    f.classList.remove("settle");
  }, { passive: true });
  f.addEventListener("touchmove", (e) => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    if (dy > 0 && f.scrollTop <= 0) { e.preventDefault(); f.style.transform = `translateY(${dy}px)`; }
    else { y0 = null; dy = 0; f.style.transform = ""; }
  }, { passive: false });
  const end = () => {
    if (y0 == null) return;
    y0 = null;
    if (dy > 110) { closeFull(); return; }
    f.classList.add("settle"); f.style.transform = "";
  };
  f.addEventListener("touchend", end);
  f.addEventListener("touchcancel", end);
})();
addEventListener("resize", () => { if (fullOpen() && !isPhoneLayout()) closeFull(); });

function paintPlayBtn() {
  const playing = !audio.paused && nowId != null;
  $("playTxt").textContent = playing ? "PAUSE" : "PLAY";
  $("playIco").setAttribute("href", playing ? "#ic-pause" : "#ic-play");
  $("play").setAttribute("aria-label", playing ? "Pause" : "Play");
  $("fPlayIco").setAttribute("href", playing ? "#ic-pause" : "#ic-play");
  $("fPlay").setAttribute("aria-label", playing ? "Pause" : "Play");
}

/* ---------- upload / delete ---------- */
// "Artist - Title.mp3" fills in the artist automatically
function parseName(fileName) {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/_/g, " ").trim();
  const m = base.match(/^(.+?)\s+-\s+(.+)$/);
  return m ? { title: m[2].trim(), artist: m[1].trim() } : { title: base, artist: null };
}
const missingArtistCol = (error) => error && /artist/i.test(error.message || "");

// how long is an audio file? (seconds, or null if the browser can't tell)
function fileDuration(file) {
  return new Promise((res) => {
    const a = new Audio(), u = URL.createObjectURL(file);
    const done = (v) => { URL.revokeObjectURL(u); res(v); };
    a.preload = "metadata";
    a.onloadedmetadata = () => done(isFinite(a.duration) && a.duration > 0 ? Math.round(a.duration) : null);
    a.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    a.src = u;
  });
}
const BIG_MB = 15;
const mb = (n) => (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + " MB";
$("file").onchange = async (e) => {
  const files = [...e.target.files]; e.target.value = "";
  const added = await uploadSongs(files, {});
  if (added === null) return;
  if (added.length) { say(""); toast(added.length === 1 ? "Uploaded!" : `Uploaded ${added.length} songs!`); sfxDing(); }
  loadAll();
};
// upload audio files as songs; returns the new rows (null if you cancelled the big-file warning)
async function uploadSongs(files, { artist, onStatus } = {}) {
  const status = onStatus || say;
  // big files use up the free storage and every play uses bandwidth: warn first
  const big = files.filter((f) => f.size > BIG_MB * 1048576);
  if (big.length) {
    const list = big.slice(0, 4).map((f) => `\u2022 ${f.name} (${mb(f.size)})`).join("\n") + (big.length > 4 ? `\n\u2022 and ${big.length - 4} more` : "");
    const goOn = confirm(`Heads up: ${big.length === 1 ? "this file is" : "these files are"} large:\n\n${list}\n\nBig files fill up your free storage fast, and every play uses bandwidth. MP3s at 128\u2013256 kbps are usually 3\u20138 MB per song.\n\nUpload anyway?`);
    if (!goOn) return null;
  }
  const added = []; let n = 0;
  for (const f of files) {
    n++;
    status(`Uploading ${files.length > 1 ? n + " of " + files.length + ": " : ""}${f.name}...`);
    const dur = await fileDuration(f);
    const safe = f.name.replace(/[^\w.\-]+/g, "_");
    const path = `${me.id}/${Date.now()}_${safe}`;
    const up = await sb.storage.from("music").upload(path, f, { contentType: f.type || "audio/mpeg" });
    if (up.error) { status("Upload failed: " + up.error.message); continue; }
    const meta = parseName(f.name);
    const row = { title: meta.title, path, user_id: me.id, uploader: myName() };
    if (artist) row.artist = artist; else if (meta.artist) row.artist = meta.artist;
    if (dur) row.duration = dur;
    const ins = () => sb.from("tracks").insert(row).select().single();
    let { data, error } = await ins();
    if (error && /duration/i.test(error.message || "") && row.duration) { // duration column not added yet
      delete row.duration; ({ data, error } = await ins());
    }
    if (missingArtistCol(error)) { // artist column not added yet: save without it
      delete row.artist; row.title = f.name.replace(/\.[^.]+$/, "");
      ({ data, error } = await ins());
    }
    if (error) { sb.storage.from("music").remove([path]); status(error.message); continue; }
    added.push(data && data.id ? data : { ...row, id: "tmp" + Date.now() });
  }
  return added;
}

async function removeTrack(t) {
  if (!t || !confirm("Delete " + t.title + "?")) return;
  // FIX: delete the row first. Removing the file first left an unplayable row if the delete was refused.
  const { error } = await sb.from("tracks").delete().eq("id", t.id);
  if (error) { say(error.message); return; }
  await sb.storage.from("music").remove([t.path]);
  if (t.cover_path) sb.storage.from("music").remove([t.cover_path]);
  sfxDrop();
  queue = queue.filter((x) => x.id !== t.id);
  if (queueOrig) queueOrig = queueOrig.filter((x) => x.id !== t.id);
  userQueue = userQueue.filter((x) => x.id !== t.id);
  if (ctxId === t.id) ctxId = null;
  if (t.id === nowId) { audio.pause(); audio.removeAttribute("src"); nowId = null; }
  all = all.filter((x) => x.id !== t.id);
  updateQBtn(); setNow();
  loadAll();
}

/* ---------- Jam: listen together (Supabase Realtime, no tables needed) ----------
   The host's phone is the source of truth: it broadcasts what's playing every few seconds
   and on every change. Guests follow along and send requests (play, skip, add to queue). */
const jam = { role: null, code: "", ch: null, last: null, sig: "", people: [], blocked: false, findT: 0, goneT: 0 };
const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
let pendingJam = (() => { try { return (new URLSearchParams(location.search).get("jam") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6); } catch (e) { return ""; } })();
const jamNorm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
function jamNewCode() { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let c = ""; for (let i = 0; i < 5; i++) c += A[Math.floor(Math.random() * A.length)]; return c; }
function jamSend(event, payload) { if (jam.ch) return jam.ch.send({ type: "broadcast", event, payload }); }
function jamCmd(p) { jamSend("cmd", { ...p, by: myName() }); }
let jamSeekT = 0, jamSeekV = 0;
function jamSeek(t) { jamSeekV = t; clearTimeout(jamSeekT); jamSeekT = setTimeout(() => jamCmd({ cmd: "seek", t: jamSeekV }), 200); }

// host: what everyone should be hearing right now
function jamState() {
  const ci = queue.findIndex((x) => x.id === ctxId);
  return {
    trackId: nowId, t: audio.currentTime || 0, playing: nowId != null && !audio.paused, at: Date.now(),
    up: userQueue.map((x) => x.id), next: (ci >= 0 ? queue.slice(ci + 1, ci + 31) : []).map((x) => x.id), host: myName(),
  };
}
let jamPushT = 0;
function jamPush() {
  if (jam.role !== "host") return;
  clearTimeout(jamPushT);
  jamPushT = setTimeout(() => jamSend("state", jamState()), 120);
}
setInterval(() => { if (jam.role === "host") jamSend("state", jamState()); }, 4000); // heartbeat keeps everyone in sync

// host: requests from guests
function jamHandle(p) {
  const find = (id) => all.find((x) => x.id === id);
  const t = p.id != null ? find(p.id) : null;
  if (p.id != null && !t && !p.retried) { loadAll().then(() => jamHandle({ ...p, retried: true })); return; } // a song uploaded mid-Jam
  switch (p.cmd) {
    case "play": if (nowId == null) { if (all.length) playTrack(all[0], all); } else audio.play().catch(() => {}); break;
    case "pause": pauseByUser(); break;
    case "next": step(1); break;
    case "prev": step(-1); break;
    case "seek": if (isFinite(audio.duration)) audio.currentTime = Math.max(0, Math.min(audio.duration, +p.t || 0)); break;
    case "add":
      if (t) { p.next ? userQueue.unshift(t) : userQueue.push(t); updateQBtn(); if (isOpen("qModal")) renderQueue(); toast((p.by || "Someone") + " added " + t.title); }
      break;
    case "list": {
      const list = (p.ids || []).map(find).filter(Boolean);
      if (list.length) { playTrack(list[0], list); toast((p.by || "Someone") + " started a list"); }
      break;
    }
  }
  jamPush();
}

// guest: follow the host
const jamWant = () => { const s = jam.last; return !s ? 0 : s.t + (s.playing ? Math.max(0, (Date.now() - s.at) / 1000) : 0); };
function jamPlay() {
  if (jam.blocked) return;
  audio.play().catch(() => { jam.blocked = true; toast("Tap PLAY to hear the Jam"); });
}
function jamApply(s) {
  const first = !jam.last;
  jam.last = s;
  clearTimeout(jam.findT);
  if (first) { $("jamMsg").textContent = ""; toast("Joined " + (s.host || "the") + "'s Jam"); sfxDing(); paintJam(); }
  const byId = (id) => all.find((x) => x.id === id);
  const t = s.trackId != null ? byId(s.trackId) : null;
  if (s.trackId != null && !t) { if (!jam.reloading) { jam.reloading = true; loadAll().finally(() => (jam.reloading = false)); } return; }
  userQueue = (s.up || []).map(byId).filter(Boolean);
  queue = t ? [t, ...(s.next || []).map(byId).filter(Boolean)] : [];
  ctxId = t ? t.id : null;
  const sig = JSON.stringify([s.trackId, s.up, s.next]);
  const changed = sig !== jam.sig; jam.sig = sig;
  if (!t) { if (!audio.paused) pauseByUser(); if (nowId != null) { nowId = null; setNow(); } if (changed) { updateQBtn(); if (isOpen("qModal")) renderQueue(); } return; }
  if (nowId !== t.id) {
    nowId = t.id; newSession();
    audio.src = urlFor(t);
    audio.addEventListener("loadedmetadata", () => {
      if (jam.role !== "guest" || nowId !== t.id) return;
      audio.currentTime = Math.min(jamWant(), audio.duration || jamWant());
      if (jam.last.playing) jamPlay();
    }, { once: true });
    setNow(); updateQBtn(); setMeta(t);
    return;
  }
  if (isFinite(audio.duration) && Math.abs(audio.currentTime - jamWant()) > 2) audio.currentTime = Math.min(jamWant(), audio.duration);
  if (s.playing && audio.paused) jamPlay();
  else if (!s.playing && !audio.paused) pauseByUser();
  if (changed) { updateQBtn(); if (isOpen("qModal")) renderQueue(); }
}

function jamPresence() {
  if (!jam.ch) return;
  jam.people = Object.values(jam.ch.presenceState() || {}).flat();
  if (jam.role === "guest") {
    clearTimeout(jam.goneT);
    if (jam.last && !jam.people.some((p) => p.host)) {
      jam.goneT = setTimeout(() => { if (jam.role === "guest") { toast("The host left the Jam"); jamLeave(true); } }, 8000);
    }
  }
  paintJam();
}

function jamOpen(code, role) {
  const ch = sb.channel("jukebox-jam-" + code, { config: { broadcast: { self: false }, presence: { key: me.id + ":" + Math.random().toString(36).slice(2, 7) } } });
  Object.assign(jam, { role, code, ch, last: null, sig: "", people: [], blocked: false });
  ch.on("broadcast", { event: "state" }, ({ payload }) => { if (jam.ch === ch && jam.role === "guest") jamApply(payload); })
    .on("broadcast", { event: "hello" }, () => { if (jam.ch === ch && jam.role === "host") jamSend("state", jamState()); })
    .on("broadcast", { event: "cmd" }, ({ payload }) => { if (jam.ch === ch && jam.role === "host") jamHandle(payload); })
    .on("broadcast", { event: "end" }, () => { if (jam.ch === ch && jam.role === "guest") { toast("The Jam ended"); jamLeave(true); } })
    .on("presence", { event: "sync" }, () => { if (jam.ch === ch) jamPresence(); });
  ch.subscribe(async (status) => {
    if (jam.ch !== ch) return;
    if (status === "SUBSCRIBED") {
      try { await ch.track({ name: myName(), host: role === "host" }); } catch (e) {}
      if (role === "guest") jamSend("hello", {});
      else { jamSend("state", jamState()); $("jamMsg").textContent = "Share the code or link so friends can join."; }
      paintJam();
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      $("jamMsg").textContent = "Couldn't connect to the Jam. Check your connection and try again.";
      jamLeave(true);
    }
  });
  if (role === "guest") {
    jam.findT = setTimeout(() => {
      if (jam.ch === ch && !jam.last) { $("jamMsg").textContent = "No Jam found with code " + code + "."; jamLeave(true); }
    }, 7000);
  }
  paintJam();
}

async function jamLeave(quiet) {
  const ch = jam.ch, wasHost = jam.role === "host";
  clearTimeout(jam.findT); clearTimeout(jam.goneT);
  Object.assign(jam, { role: null, code: "", ch: null, last: null, sig: "", people: [], blocked: false });
  if (ch) {
    if (wasHost) { try { await ch.send({ type: "broadcast", event: "end", payload: {} }); } catch (e) {} }
    try { await sb.removeChannel(ch); } catch (e) {}
  }
  if (!quiet) toast(wasHost ? "Jam ended" : "Left the Jam");
  paintJam(); updateQBtn();
  if (isOpen("qModal")) renderQueue();
}

function paintJam() {
  const on = !!jam.role, n = jam.people.length;
  setTimeout(() => { if (fullOpen()) renderFull(); }, 0);
  $("jamN").textContent = on && n > 1 ? n : "";
  $("jamBtn").classList.toggle("on", on);
  $("jamTag").classList.toggle("hide", !on);
  $("jamTag").textContent = !on ? "" : jam.role === "host"
    ? "Hosting Jam " + jam.code + (n > 1 ? " · " + (n - 1) + " listening" : "")
    : "In " + (jam.last?.host || "a") + "'s Jam" + (jam.last ? "" : " (connecting...)");
  $("jamOff").classList.toggle("hide", on);
  $("jamOn").classList.toggle("hide", !on);
  $("jamCodeShow").textContent = jam.code;
  $("jamRole").textContent = jam.role === "host" ? "You're the host. Friends join with this code:" : "You're listening along. Jam code:";
  $("jamShare").classList.toggle("hide", jam.role !== "host");
  $("jamLeave").textContent = jam.role === "host" ? "End Jam" : "Leave Jam";
  $("jamPeople").innerHTML = n
    ? jam.people.map((p) => `<div class="person">${p.host ? "★ " : "· "}${esc(p.name || "Player")}${p.host ? " (host)" : ""}</div>`).join("")
    : '<div class="sub">Connecting...</div>';
}

function openJam() { if (!jam.role) $("jamMsg").textContent = ""; paintJam(); openOv("jamModal"); }
$("jamBtn").onclick = openJam;
$("jamClose").onclick = () => closeOv("jamModal");
$("jamStart").onclick = () => { if (!jam.role) jamOpen(jamNewCode(), "host"); };
$("jamCode").oninput = () => { const v = jamNorm($("jamCode").value); if (v !== $("jamCode").value) $("jamCode").value = v; };
$("jamCode").onkeydown = (e) => { if (e.key === "Enter") $("jamJoin").click(); };
$("jamJoin").onclick = async () => {
  const code = jamNorm($("jamCode").value);
  if (code.length < 4) { $("jamMsg").textContent = "Enter the Jam code from your friend."; return; }
  if (jam.role) await jamLeave(true);
  // play a silent clip inside this tap so phones allow the Jam's music to start later
  audio.pause(); nowId = null; userQueue = [];
  audio.src = SILENT; audio.play().catch(() => {});
  $("jamMsg").textContent = "Joining " + code + "...";
  jamOpen(code, "guest");
};
$("jamLeave").onclick = () => jamLeave(false);
$("jamShare").onclick = async () => {
  const url = location.origin + location.pathname + "?jam=" + jam.code;
  const text = "Join my Jam on Budsbox! Code: " + jam.code;
  try {
    if (navigator.share) { await navigator.share({ title: "Budsbox Jam", text, url }); return; }
  } catch (e) { if (e && e.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(url); toast("Invite link copied"); }
  catch (e) { $("jamMsg").textContent = "Invite link: " + url; }
};
paintJam();

/* ---------- queue panel ---------- */
function renderQueue() {
  if (!me) return;
  const cur = curTrack();
  const row = (t, attrs, btns) => `<div class="track" ${attrs}>${thumbHTML(t)}<span class="meta"><span class="t">${esc(t.title)}</span><span class="by">${esc(artistOf(t))}</span></span>${btns}</div>`;
  let h = "<h3>Now playing</h3>";
  h += cur ? row(cur, 'style="cursor:default" data-now="1"', "").replace('class="track"', 'class="track on"') : '<div class="empty">Nothing playing.</div>';
  h += "<h3>Up next (queued)</h3>";
  h += userQueue.length
    ? userQueue.map((t, i) => row(t, `tabindex="0" data-qplay="${i}"`,
        `<button class="add" data-qup="${i}" aria-label="Move up">^</button><button class="del" data-qrm="${i}" aria-label="Remove from queue">X</button>`)).join("")
    : `<div class="empty">Nothing queued. ${isTouch ? "Swipe right on a song, or tap +" : "Click + on a song"}, then Add to queue.</div>`;
  const ci = queue.findIndex((x) => x.id === ctxId);
  const rest = ci >= 0 ? queue.slice(ci + 1) : [];
  h += "<h3>Next from list</h3>";
  h += rest.length
    ? rest.slice(0, 30).map((t, k) => row(t, `tabindex="0" data-cplay="${ci + 1 + k}"`, "")).join("") + (rest.length > 30 ? `<div class="sub">+${rest.length - 30} more</div>` : "")
    : '<div class="empty">End of the list.</div>';
  $("qBody").innerHTML = h;
}
$("qBtn").onclick = () => { renderQueue(); openOv("qModal"); };
$("qClose").onclick = () => closeOv("qModal");
$("qClear").onclick = () => {
  if (jam.role === "guest") { toast("Only the Jam host can clear the queue"); return; }
  if (userQueue.length) sfxDrop(); userQueue = []; updateQBtn(); renderQueue();
};
$("qBody").onclick = (e) => {
  if (jam.role === "guest") { if (e.target.closest("button, [data-qplay], [data-cplay]")) toast("Only the Jam host can change the queue"); return; }
  const b = e.target.closest("button");
  if (b) {
    if (b.dataset.qup !== undefined) {
      const i = +b.dataset.qup;
      if (i > 0) { [userQueue[i - 1], userQueue[i]] = [userQueue[i], userQueue[i - 1]]; renderQueue(); jamPush(); }
      return;
    }
    if (b.dataset.qrm !== undefined) { userQueue.splice(+b.dataset.qrm, 1); sfxDrop(); updateQBtn(); renderQueue(); return; }
  }
  const u = e.target.closest("[data-qplay]");
  if (u) { const t = userQueue.splice(+u.dataset.qplay, 1)[0]; playTrack(t, null, true); return; }
  const c = e.target.closest("[data-cplay]");
  if (c) playTrack(queue[+c.dataset.cplay]);
};

/* ---------- now playing: lyrics modal (mobile) + side panel (desktop) ---------- */
function paintPlayCount(t) {
  const s = t ? "▶ " + (t.plays || 0) + " listen" + ((t.plays || 0) === 1 ? "" : "s") : "";
  $("lyPlays").textContent = s;
}
function renderLyrics() {
  if (!me) return;
  const t = curTrack();
  const by = t ? artistOf(t) : "";
  const ab = t ? addedBy(t) : "";
  const lyr = t ? (t.lyrics && t.lyrics.trim() ? t.lyrics : "No lyrics yet.") : "Play a song to see its lyrics.";
  const canEdit = !!(t && t.user_id === me.id);
  // modal
  $("lyTitle").textContent = t ? t.title : "Nothing playing";
  $("lyBy").textContent = by;
  $("lyAdded").textContent = ab; $("lyAdded").classList.toggle("hide", !ab);
  $("lyArt").classList.toggle("hide", !artUrl(t));
  $("lyArt").innerHTML = artUrl(t) ? `<img src="${artUrl(t)}" alt="">` : "";
  $("lyText").textContent = lyr;
  $("lyEdit").classList.toggle("hide", !canEdit);
  // desktop Now Playing panel
  $("npCtx").textContent = jam.role === "guest" ? (jam.last?.host || "a friend") + "'s Jam" : (t ? ctxName : "Now playing");
  $("npArt").innerHTML = t ? (artUrl(t) ? `<span class="cover"><img src="${artUrl(t)}" alt="Album cover"></span>` : discHTML(t)) : discHTML({ id: "idle" });
  $("npTitle").textContent = t ? t.title : "Nothing playing";
  $("npBy").textContent = by;
  $("npAdd").classList.toggle("invis", !t);
  const hasLyr = !!(t && t.lyrics && t.lyrics.trim());
  $("npLyrics").textContent = hasLyr ? t.lyrics.trim() : t ? (canEdit ? "No lyrics yet. Tap the pencil to add them." : "No lyrics yet.") : "Play a song to see its lyrics.";
  $("npLyrics").classList.toggle("none", !hasLyr);
  $("npLyrCard").classList.remove("full");
  $("npMore").classList.toggle("hide", !hasLyr || t.lyrics.trim().split("\n").length <= 5);
  $("npMore").textContent = "Show all";
  $("npEdit").classList.toggle("hide", !canEdit);
  // about the artist: how much of their music is in Budsbox
  const art = t ? artistOf(t) : "";
  const theirs = t && t.artist ? all.filter((x) => artistOf(x) === art) : [];
  $("npArtist").textContent = t ? art : "";
  $("npArtistStats").textContent = !t ? "" : t.artist
    ? `${theirs.length} song${theirs.length === 1 ? "" : "s"} in Budsbox \u00B7 ${theirs.reduce((n, x) => n + (x.plays || 0), 0)} listens`
    : "No artist set for this song yet.";
  const ainfo = t && hasArtist(t) ? artistInfo.get(art) : null;
  $("npArtist").textContent = t ? art + (ainfo ? " \u2713" : "") : "";
  $("npArtistBio").textContent = ainfo && ainfo.bio ? ainfo.bio : "";
  $("npArtistMore").classList.toggle("hide", !(t && hasArtist(t)));
  $("npBy").classList.toggle("alinkish", !!(t && hasArtist(t)));
  // credits (the uploader only shows if you turned on "Song credits" in settings)
  $("npCredits").innerHTML = !t ? '<div class="sub">Nothing playing.</div>'
    : `<div class="credit"><b>${esc(art)}</b><span>Main artist</span></div>` +
      (ab ? `<div class="credit"><b>${esc(t.uploader || "someone")}</b><span>Added to Budsbox</span></div>` : "") +
      `<div class="credit"><b>\u25B6 ${t.plays || 0}</b><span>Listen${(t.plays || 0) === 1 ? "" : "s"}</span></div>`;
  paintNpNext();
  paintPlayCount(t);
}
// desktop: show/hide the Now Playing + lyrics panel (like Spotify's lyrics button); phones: lyrics pop-up
let npOff = false;
try { npOff = localStorage.getItem("jukebox_np") === "off"; } catch (e) {}
function paintNp() { document.body.classList.toggle("np-off", npOff); $("lyrBtn").classList.toggle("on", !npOff); }
$("lyrBtn").onclick = () => {
  if (isPhoneLayout()) { renderLyrics(); openOv("lyrModal"); return; }
  npOff = !npOff;
  try { localStorage.setItem("jukebox_np", npOff ? "off" : "on"); } catch (e) {}
  paintNp();
};
paintNp();
$("pAdd").onclick = () => { const t = curTrack(); if (t) openPicker(t); };
$("lyClose").onclick = () => closeOv("lyrModal");
$("lyEdit").onclick = () => { const t = curTrack(); closeOv("lyrModal"); if (t) openEdit(t); };
$("npEdit").onclick = () => { const t = curTrack(); if (t) openEdit(t); };
$("npAdd").onclick = () => { const t = curTrack(); if (t) openPicker(t); };
$("npClose").onclick = () => $("lyrBtn").click();
$("npMore").onclick = () => { const c = $("npLyrCard"); c.classList.toggle("full"); $("npMore").textContent = c.classList.contains("full") ? "Show less" : "Show all"; };
$("npArtistMore").onclick = () => { const t = curTrack(); if (t && hasArtist(t)) goArtist(artistOf(t)); };
$("npBy").onclick = () => { const t = curTrack(); if (t && hasArtist(t)) goArtist(artistOf(t)); };
$("fBy").onclick = () => { const t = curTrack(); if (t && hasArtist(t)) goArtist(artistOf(t)); };
$("npOpenQ").onclick = () => { renderQueue(); openOv("qModal"); };
// "Next in queue": your queued songs first, then the rest of the list
function nextUp() {
  if (userQueue.length) return { t: userQueue[0], from: "q" };
  const i = queue.findIndex((x) => x.id === ctxId);
  if (i >= 0 && queue[i + 1]) return { t: queue[i + 1], from: "l", idx: i + 1 };
  if (repeatMode === "all" && queue.length) return { t: queue[0], from: "l", idx: 0 };
  return null;
}
function paintNpNext() {
  const n = me && nowId != null ? nextUp() : null;
  $("npNext").innerHTML = n
    ? `<div class="nextrow" id="npNextRow" role="button" tabindex="0" title="Play next song">${thumbHTML(n.t)}<span class="meta"><span class="t">${esc(n.t.title)}</span><span class="by">${esc(artistOf(n.t))}</span></span></div>`
    : '<div class="sub">Nothing up next.</div>';
}
$("npNext").addEventListener("click", (e) => { if (e.target.closest("#npNextRow")) step(1); });
$("npNext").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "npNextRow") step(1); });

/* ---------- edit song: title, artist, cover, lyrics, delete ---------- */
let editTrack = null, pendingCover = null, dropCover = false, pendingUrl = null;

function resizeImage(file, size = 320) {
  return new Promise((res, rej) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(img.width, img.height), c = document.createElement("canvas");
      c.width = c.height = Math.min(size, s);
      c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      c.toBlob((b) => (b ? res(b) : rej(new Error("Could not read that image"))), "image/jpeg", 0.88);
    };
    img.onerror = () => { URL.revokeObjectURL(u); rej(new Error("That file isn't an image")); };
    img.src = u;
  });
}

function paintEditPreview(src) {
  $("edPrev").innerHTML = src ? `<img src="${src}" alt="">` : '<span class="sub" style="display:flex;height:100%;align-items:center;justify-content:center">none</span>';
}

function openEdit(t) {
  if (!t || t.user_id !== me.id) return;
  editTrack = t; pendingCover = null; dropCover = false;
  if (pendingUrl) { URL.revokeObjectURL(pendingUrl); pendingUrl = null; }
  $("edTitle").value = t.title;
  $("edArtist").value = t.artist || "";
  $("edLyrics").value = t.lyrics || "";
  $("edMsg").textContent = "";
  $("edSave").disabled = false;
  paintEditPreview(t.cover_path ? coverUrl(t) : null);
  openOv("editModal");
}

$("edImg").onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try {
    pendingCover = await resizeImage(f);
    dropCover = false;
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    pendingUrl = URL.createObjectURL(pendingCover);
    paintEditPreview(pendingUrl);
    $("edMsg").textContent = "";
  } catch (err) { $("edMsg").textContent = err.message; }
};
$("edNoCover").onclick = () => { pendingCover = null; dropCover = true; paintEditPreview(null); };
$("edCancel").onclick = () => closeOv("editModal");
$("edDelete").onclick = () => { const t = editTrack; closeOv("editModal"); if (t) removeTrack(t); };

$("edSave").onclick = async () => {
  const t = editTrack;
  if (!t) return;
  const title = $("edTitle").value.trim();
  if (!title) { $("edMsg").textContent = "Title can't be empty."; return; }
  const patch = { title, artist: $("edArtist").value.trim() || null, lyrics: $("edLyrics").value };
  $("edSave").disabled = true; $("edMsg").textContent = "Saving...";
  let newPath = null;
  if (pendingCover) {
    newPath = `${me.id}/cover_${Date.now()}.jpg`;
    const up = await sb.storage.from("music").upload(newPath, pendingCover, { contentType: "image/jpeg" });
    if (up.error) { $("edMsg").textContent = "Cover upload failed: " + up.error.message; $("edSave").disabled = false; return; }
    patch.cover_path = newPath;
  } else if (dropCover) patch.cover_path = null;
  let { error } = await sb.from("tracks").update(patch).eq("id", t.id);
  let note = "";
  if (missingArtistCol(error)) { // save everything else, explain the artist field
    delete patch.artist;
    ({ error } = await sb.from("tracks").update(patch).eq("id", t.id));
    note = "Saved, but artist needs the SQL in the script comment.";
  }
  if (error) {
    if (newPath) sb.storage.from("music").remove([newPath]);
    $("edMsg").textContent = /schema cache|does not exist/i.test(error.message)
      ? "Your database is missing a column (" + error.message.replace(/^.*?'([^']+)'.*$/, "$1") + "). Run the setup SQL in Supabase > SQL Editor, then try again."
      : error.message;
    $("edSave").disabled = false;
    return;
  }
  if ((newPath || dropCover) && t.cover_path) sb.storage.from("music").remove([t.cover_path]);
  Object.assign(t, patch);
  closeOv("editModal");
  sfxDing();
  if (note) toast(note);
  drawLists(); setNow();
};

syncSizes();
