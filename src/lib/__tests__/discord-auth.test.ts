import { describe, expect, it } from "vitest";
import { LINK_TTL_MS, signLinkToken, verifyLinkToken } from "../link-token";
import { pickUsername } from "../discord-account";

const KEY = "test-secret";

describe("link token", () => {
  it("round-trips a user id within its lifetime", async () => {
    const t = await signLinkToken("user-1", 1000, KEY);
    expect(await verifyLinkToken(t, 1000 + LINK_TTL_MS - 1, KEY)).toBe("user-1");
  });

  it("rejects an expired token", async () => {
    const t = await signLinkToken("user-1", 1000, KEY);
    expect(await verifyLinkToken(t, 1000 + LINK_TTL_MS + 1, KEY)).toBeNull();
  });

  it("rejects a token whose user id was swapped", async () => {
    const t = await signLinkToken("user-1", 1000, KEY);
    const [, exp, sig] = t.split(".");
    expect(await verifyLinkToken(`user-2.${exp}.${sig}`, 1000, KEY)).toBeNull();
  });

  it("rejects a token signed with another secret, garbage, and absence", async () => {
    const t = await signLinkToken("user-1", 1000, "other");
    expect(await verifyLinkToken(t, 1000, KEY)).toBeNull();
    expect(await verifyLinkToken("nope", 1000, KEY)).toBeNull();
    expect(await verifyLinkToken(undefined, 1000, KEY)).toBeNull();
  });
});

describe("pickUsername", () => {
  const taken = (names: string[]) => async (n: string) => names.includes(n);

  it("prefers the Discord display name", async () => {
    expect(await pickUsername("Soryn", "soryn_1234", "123456789", taken([]))).toBe("Soryn");
  });

  it("falls back to the handle, then adds a suffix on collision", async () => {
    expect(await pickUsername(null, "soryn_1234", "123456789", taken([]))).toBe("soryn_1234");
    expect(await pickUsername("Soryn", "x", "123456789", taken(["Soryn"]))).toBe("Soryn-6789");
  });

  it("never hands out a seeded admin name", async () => {
    expect(await pickUsername("lyralei", "x", "123456789", taken([]))).toBe("lyralei-6789");
  });

  it("strips control characters and caps the length", async () => {
    const long = "a".repeat(50);
    const got = await pickUsername(`bad\nname`, long, "123456789", taken([]));
    expect(got).toBe("badname");
    expect((await pickUsername(null, long, "123456789", taken([]))).length).toBeLessThanOrEqual(30);
  });
});

import { DiscordLinkError, resolveDiscordUser, type DbUser, type DiscordUserStore } from "../discord-account";

function fakeStore(rows: Array<DbUser & { discordId: string | null }>) {
  let n = 0;
  const store: DiscordUserStore & { rows: typeof rows } = {
    rows,
    async findByDiscordId(d) {
      const r = rows.find((x) => x.discordId === d);
      return r ? { id: r.id, username: r.username, role: r.role } : null;
    },
    async linkIfUnlinked(id, d) {
      const r = rows.find((x) => x.id === id && x.discordId === null);
      if (!r) return null;
      r.discordId = d;
      return { id: r.id, username: r.username, role: r.role };
    },
    async isUsernameTaken(u) {
      return rows.some((x) => x.username === u);
    },
    async create(username, discordId) {
      const r = { id: `new-${++n}`, username, role: "user" as const, discordId };
      rows.push(r);
      return { id: r.id, username: r.username, role: r.role };
    },
  };
  return store;
}

const base = { globalName: "Soryn", username: "soryn_1", discordId: "d-1" };

describe("resolveDiscordUser", () => {
  it("returns the already-linked account", async () => {
    const s = fakeStore([{ id: "a", username: "alice", role: "user", discordId: "d-1" }]);
    const got = await resolveDiscordUser({ ...base, linkUserId: null, sessionUserId: null }, s);
    expect(got.id).toBe("a");
  });

  it("creates a password-less account for a new Discord user", async () => {
    const s = fakeStore([]);
    const got = await resolveDiscordUser({ ...base, linkUserId: null, sessionUserId: null }, s);
    expect(got.username).toBe("Soryn");
    expect(s.rows[0].discordId).toBe("d-1");
  });

  it("links when the link cookie and the live session name the same user", async () => {
    const s = fakeStore([{ id: "a", username: "alice", role: "user", discordId: null }]);
    const got = await resolveDiscordUser({ ...base, linkUserId: "a", sessionUserId: "a" }, s);
    expect(got.id).toBe("a");
    expect(s.rows[0].discordId).toBe("d-1");
  });

  it("ignores a leftover link cookie when nobody (or someone else) is signed in", async () => {
    for (const sessionUserId of [null, "b"]) {
      const s = fakeStore([{ id: "a", username: "admin1", role: "admin", discordId: null }]);
      const got = await resolveDiscordUser({ ...base, linkUserId: "a", sessionUserId }, s);
      expect(got.id).not.toBe("a");
      expect(s.rows[0].discordId).toBeNull();
    }
  });

  it("refuses to switch accounts when linking a Discord that is bound elsewhere", async () => {
    const s = fakeStore([
      { id: "a", username: "alice", role: "user", discordId: null },
      { id: "x", username: "stray", role: "user", discordId: "d-1" },
    ]);
    await expect(
      resolveDiscordUser({ ...base, linkUserId: "a", sessionUserId: "a" }, s)
    ).rejects.toBeInstanceOf(DiscordLinkError);
    expect(s.rows[0].discordId).toBeNull();
  });

  it("never overwrites an existing link", async () => {
    const s = fakeStore([{ id: "a", username: "alice", role: "user", discordId: "d-old" }]);
    await expect(
      resolveDiscordUser({ ...base, linkUserId: "a", sessionUserId: "a" }, s)
    ).rejects.toBeInstanceOf(DiscordLinkError);
    expect(s.rows[0].discordId).toBe("d-old");
  });

  it("recovers when a concurrent first sign-in won the insert", async () => {
    const s = fakeStore([]);
    const realCreate = s.create;
    s.create = async (u, d) => {
      await realCreate(u, d); // the other request's row
      throw new Error("duplicate key value violates unique constraint");
    };
    const got = await resolveDiscordUser({ ...base, linkUserId: null, sessionUserId: null }, s);
    expect(got.id).toBe("new-1");
  });
});

import { displayName, isAdmitted, validateCharacterName } from "../approval";

describe("admission", () => {
  it("admits approved users and every admin", () => {
    expect(isAdmitted({ approved: false, role: "user" })).toBe(false);
    expect(isAdmitted({ approved: true, role: "user" })).toBe(true);
    expect(isAdmitted({ approved: false, role: "admin" })).toBe(true);
  });

  it("shows the character name when set, else the login name", () => {
    expect(displayName({ username: "mlev-5138", characterName: null })).toBe("mlev-5138");
    expect(displayName({ username: "mlev-5138", characterName: "  " })).toBe("mlev-5138");
    expect(displayName({ username: "mlev-5138", characterName: "Soryn" })).toBe("Soryn");
  });

  it("accepts a plain character name and collapses whitespace", () => {
    expect(validateCharacterName("  Soryn   of No House ")).toEqual({ name: "Soryn of No House" });
  });

  it("rejects bad names", () => {
    expect(validateCharacterName("S").error).toMatch(/2-30/);
    expect(validateCharacterName("x".repeat(31)).error).toMatch(/2-30/);
    expect(validateCharacterName('Sor"yn').error).toMatch(/characters/);
    expect(validateCharacterName("Lyralei").error).toMatch(/reserved/);
    expect(validateCharacterName(42).error).toMatch(/required/);
  });
});
