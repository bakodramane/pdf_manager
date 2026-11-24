import { describe, expect, it } from "vitest";
import { DICTIONARIES, translate } from "./index";
import { en } from "./en";

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe("i18n", () => {
  it("every locale defines exactly the English keys", () => {
    const keys = Object.keys(en).sort();
    for (const dict of Object.values(DICTIONARIES)) {
      expect(Object.keys(dict).sort()).toEqual(keys);
    }
  });

  it("every translation keeps the same placeholders", () => {
    for (const [lang, dict] of Object.entries(DICTIONARIES)) {
      for (const [key, value] of Object.entries(dict)) {
        expect(
          placeholders(value),
          `${lang}:${key}`,
        ).toEqual(placeholders(en[key as keyof typeof en]));
      }
    }
  });

  it("fills placeholders and leaves unknown ones intact", () => {
    expect(translate("en", "toolbar.pages", { count: 4 })).toBe("4 pages");
    expect(translate("fr", "busy.toWordPage", { done: 2, total: 9 })).toBe(
      "Conversion en Word… page 2 sur 9",
    );
    expect(translate("en", "toolbar.pages")).toBe("{count} pages");
  });
});
