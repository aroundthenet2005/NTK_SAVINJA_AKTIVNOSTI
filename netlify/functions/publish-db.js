export async function handler(event) {
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,x-publish-key", "access-control-allow-methods": "POST,OPTIONS" };
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" };
  }

  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    const publishKey = event.headers["x-publish-key"] || event.headers["X-Publish-Key"] || "";
    const expectedKey = process.env.PUBLISH_KEY || "";
    if (!expectedKey) {
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: "Missing PUBLISH_KEY env var" }) };
    }
    if (publishKey !== expectedKey) {
      return { statusCode: 401, headers: cors, body: JSON.stringify({ error: "Unauthorized" }) };
    }

    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";
    const path = process.env.GITHUB_FILE_PATH || "data/db.json";
    const token = process.env.GITHUB_TOKEN;

    if (!owner || !repo || !token) {
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: "Missing GitHub env vars (GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN)" }) };
    }

    let payload;
    try { payload = JSON.parse(event.body || "{}"); } catch { payload = {}; }
    const db = payload.db;
    if (!db || typeof db !== "object") {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Body must be JSON: { db: {...} }" }) };
    }

    const jsonText = JSON.stringify(db, null, 2) + "\n";
    const contentB64 = Buffer.from(jsonText, "utf8").toString("base64");

    const apiBase = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;

    const headers = {
      "accept": "application/vnd.github+json",
      "authorization": `Bearer ${token}`,
      "user-agent": "netlify-function-publish-db"
    };

    // Get current SHA (if file exists)
    let sha = undefined;
    const getUrl = `${apiBase}?ref=${encodeURIComponent(branch)}`;
    const getRes = await fetch(getUrl, { headers });
    if (getRes.ok) {
      const cur = await getRes.json();
      sha = cur.sha;
    } else if (getRes.status !== 404) {
      const txt = await getRes.text();
      return { statusCode: 502, headers: cors, body: JSON.stringify({ error: "GitHub GET failed", details: txt }) };
    }

    const putBody = {
      message: `Update ${path} via admin`,
      content: contentB64,
      branch
    };
    if (sha) putBody.sha = sha;

    const putRes = await fetch(apiBase, {
      method: "PUT",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(putBody)
    });

    const out = await putRes.json().catch(()=>null);
    if (!putRes.ok) {
      return { statusCode: 502, headers: cors, body: JSON.stringify({ error: "GitHub PUT failed", details: out || null }) };
    }

    const commitUrl = out?.commit?.html_url || null;
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, commitUrl }) };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e?.message || String(e) }) };
  }
}
