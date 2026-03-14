import { describe, expect, test } from "bun:test";
import { getContextNote, getContextNotes } from "../../../src/core/license/context-notes.js";

describe("getContextNote", () => {
  test("returns note for GPL-3.0", () => {
    const note = getContextNote("GPL-3.0");
    expect(note).not.toBeNull();
    expect(note).toContain("source disclosure");
  });

  test("returns note for AGPL-3.0", () => {
    const note = getContextNote("AGPL-3.0");
    expect(note).not.toBeNull();
    expect(note).toContain("Network use");
  });

  test("returns note for LGPL-2.1", () => {
    const note = getContextNote("LGPL-2.1");
    expect(note).not.toBeNull();
    expect(note).toContain("Dynamic linking");
  });

  test("returns null for MIT", () => {
    expect(getContextNote("MIT")).toBeNull();
  });

  test("returns null for ISC", () => {
    expect(getContextNote("ISC")).toBeNull();
  });
});

describe("getContextNotes", () => {
  test("returns notes for copyleft licenses", () => {
    const notes = getContextNotes(["MIT", "GPL-3.0", "Apache-2.0"]);
    expect(notes).toHaveLength(1);
    expect(notes[0].license).toBe("GPL-3.0");
  });

  test("deduplicates licenses", () => {
    const notes = getContextNotes(["GPL-3.0", "GPL-3.0", "GPL-3.0"]);
    expect(notes).toHaveLength(1);
  });

  test("handles compound expressions", () => {
    const notes = getContextNotes(["MIT OR GPL-3.0"]);
    expect(notes).toHaveLength(1);
    expect(notes[0].license).toBe("GPL-3.0");
  });

  test("handles nested expressions", () => {
    const notes = getContextNotes(["MIT OR (GPL-3.0 AND LGPL-2.1)"]);
    expect(notes.map((note) => note.license)).toEqual(["GPL-3.0", "LGPL-2.1"]);
  });

  test("returns empty for permissive-only", () => {
    const notes = getContextNotes(["MIT", "ISC", "Apache-2.0"]);
    expect(notes).toHaveLength(0);
  });
});
