// ============================================================================
// lib/tutorials.js — video tutorials for staff and patients (panel review,
// Oct 2026). See db/migrations/2026-10-13-tutorial-videos.js.
//
// The videos live on YouTube (unlisted is fine) or Google Drive; this keeps
// only a title and a link. A YouTube or Drive link plays right on the page;
// any other https link is shown as a button that opens it. Nothing is
// uploaded to this server, which has neither the space nor the bandwidth for
// video on its free plan.
// ============================================================================
const db = require("../db");

const AUDIENCES = ["staff", "patient"];

// The player address for a link, or null when it is not one we can embed.
// Only https, and only the two hosts below: the result goes into an <iframe>,
// so it is built from the video's ID rather than passed through as typed.
function embedOf(url) {
  let u;
  try { u = new URL(String(url || "")); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^(www|m)\./, "");
  let id = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/);
      if (m) id = m[1];
    }
  }
  if (id && /^[A-Za-z0-9_-]{6,20}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
  if (host === "drive.google.com") {
    const m = u.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]{10,80})/);
    if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
  }
  return null;
}

// What is wrong with a submitted video, or null.
function problem({ audience, title, url }) {
  if (!AUDIENCES.includes(audience)) return "Choose who the video is for.";
  if (!title || title.length > 120) return "Give the video a title (up to 120 characters).";
  let u;
  try { u = new URL(url); } catch { return "Paste the video's full link, starting with https://"; }
  if (u.protocol !== "https:" || url.length > 300) return "Paste the video's full link, starting with https://";
  return null;
}

// Never throws: the manual and the portal still open, without videos, if this
// one small query fails (or the table has not been created yet).
async function list(audience) {
  try {
    const { rows } = await db.query(
      `SELECT video_id, audience, title, url, created_at FROM tutorial_videos
        ${audience ? "WHERE audience = $1" : ""}
        ORDER BY audience, created_at, video_id`,
      audience ? [audience] : []
    );
    return rows.map((r) => ({ ...r, embed: embedOf(r.url) }));
  } catch (e) {
    console.error("[tutorials]", e.message);
    return [];
  }
}

async function add({ audience, title, url, userId }) {
  await db.query(
    "INSERT INTO tutorial_videos (audience, title, url, created_by) VALUES ($1, $2, $3, $4)",
    [audience, title, url, userId || null]
  );
}

async function remove(videoId) {
  const { rows } = await db.query("DELETE FROM tutorial_videos WHERE video_id = $1 RETURNING title", [videoId]);
  return rows[0] || null;
}

module.exports = { AUDIENCES, embedOf, problem, list, add, remove };
