import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as getAvatar } from "@/app/api/profile/avatar/[id]/route";
import { POST as postAvatar } from "@/app/api/profile/avatar/route";
import { DELETE as deleteRoute, PATCH as renameRoute } from "@/app/api/music/loops/[id]/route";
import { GET as listRoute, POST as saveRoute } from "@/app/api/music/loops/route";
import { setTestVerifier } from "../server/auth";
import { setExecutorForTests } from "../server/db";
import { setStorageForTests } from "../server/storage";
import type { VibeProfile } from "../vibe/profile";
import { ctx, MemStorage, req, testDatabase, testVerifier } from "./helpers";

const profile: VibeProfile = {
  summary: "Warm Hindi indie", moods: ["romantic"], tempoBpm: 84, key: "D", mode: "minor",
  progression: [1, 6, 4, 5], drumFeel: "lofi", palette: ["rhodes"], energy: 0.4, warmth: 0.7, swing: 0.3,
};

let database: Awaited<ReturnType<typeof testDatabase>>;
let storage: MemStorage;
beforeAll(async () => {
  database = await testDatabase();
  setTestVerifier(testVerifier);
});
afterAll(async () => {
  setTestVerifier(null);
  setExecutorForTests(null);
  await database.close();
});
beforeEach(async () => {
  await database.reset();
  storage = new MemStorage();
  setStorageForTests(storage);
});
afterEach(() => setStorageForTests(null));

const save = (body: object, user = "user-a") => saveRoute(req("POST", "/x", { user, body: JSON.stringify(body) }), undefined);
const list = async (user = "user-a") => (await (await listRoute(req("GET", "/x", { user }), undefined)).json()).loops;

describe("Your Loops API", () => {
  it("saves, lists newest first, renames and removes", async () => {
    const a = await save({ name: "Romantic Lo-fi Groove", playlistName: "💏", profile });
    expect(a.status).toBe(201);
    const first = (await a.json()).loop;
    await save({ name: "Second", playlistName: null, profile: { ...profile, tempoBpm: 90 } });
    expect((await list()).map((l: { name: string }) => l.name)).toEqual(["Second", "Romantic Lo-fi Groove"]);
    expect((await list())[1]).toMatchObject({ playlistName: "💏", profile });

    const renamed = await renameRoute(req("PATCH", "/x", { user: "user-a", body: JSON.stringify({ name: "  Late night  " }) }), ctx({ id: first.id }));
    expect((await renamed.json()).loop.name).toBe("Late night");

    expect((await deleteRoute(req("DELETE", "/x", { user: "user-a" }), ctx({ id: first.id }))).status).toBe(204);
    expect(await list()).toHaveLength(1);
  });

  it("only accepts real vibe profiles", async () => {
    const bad = await save({ name: "X", profile: { ...profile, tempoBpm: 999 } });
    expect(bad.status).toBe(400);
    expect((await save({ name: "", profile })).status).toBe(201); // empty name → a default
    expect((await list())[0].name).toBe("My Loop");
  });

  it("keeps everyone's Loops to themselves", async () => {
    const mine = (await (await save({ name: "Mine", profile })).json()).loop;
    expect(await list("user-b")).toEqual([]);
    expect((await renameRoute(req("PATCH", "/x", { user: "user-b", body: JSON.stringify({ name: "Stolen" }) }), ctx({ id: mine.id }))).status).toBe(404);
    expect((await deleteRoute(req("DELETE", "/x", { user: "user-b" }), ctx({ id: mine.id }))).status).toBe(404);
    expect((await list())[0].name).toBe("Mine");
    expect((await listRoute(req("GET", "/x"), undefined)).status).toBe(401);
  });
});

describe("profile photo", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(500).fill(7)]);

  it("stores a JPEG and serves it back", async () => {
    const res = await postAvatar(req("POST", "/x", { user: "user-a", body: jpeg, headers: { "content-type": "image/jpeg" } }), undefined);
    expect(res.status).toBe(200);
    const { url } = await res.json();
    expect(url).toMatch(/^\/api\/profile\/avatar\/[a-f0-9]{32}\?v=\d+$/);
    const id = url.split("/").pop().split("?")[0];
    const img = await getAvatar(req("GET", url), ctx({ id }));
    expect(img.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(jpeg);
  });

  it("rejects non-images, huge files and strangers", async () => {
    const png = await postAvatar(req("POST", "/x", { user: "user-a", body: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) }), undefined);
    expect(png.status).toBe(415);
    const big = await postAvatar(req("POST", "/x", { user: "user-a", body: new Uint8Array(600 * 1024).fill(0xff) }), undefined);
    expect(big.status).toBe(413);
    expect((await postAvatar(req("POST", "/x", { body: jpeg }), undefined)).status).toBe(401);
    expect((await getAvatar(req("GET", "/x"), ctx({ id: "../../etc" }))).status).toBe(404);
  });
});
