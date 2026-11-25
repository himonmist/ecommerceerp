import { beforeAll, describe, expect, it } from "vitest";
import { enabledModules, setModuleEnabled, variantOptions } from "@/server/services/modules";
import { createProduct } from "@/server/services/catalog";
import { makeStore, resetDb } from "./helpers";

beforeAll(resetDb);

describe("modules & ERP pickers", () => {
  it("enables ERP for new stores and lets owners toggle it", async () => {
    const s = await makeStore();
    expect((await enabledModules(s.ctx)).has("erp")).toBe(true);
    await setModuleEnabled(s.ctx, "erp", false);
    expect((await enabledModules(s.ctx)).has("erp")).toBe(false);
    await expect(setModuleEnabled(s.ctx, "nope", true)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(setModuleEnabled({ ...s.ctx, permissions: ["sales.view"] }, "erp", true)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lists variants with sale price, cost and availability", async () => {
    const s = await makeStore();
    await createProduct(s.ctx, { name: "Bowl", variants: [{ title: "Blue", onlinePrice: "200", offlinePrice: "180", costPrice: "90", stock: 4 }] });
    expect(await variantOptions(s.ctx)).toEqual([expect.objectContaining({ label: "Bowl · Blue", salePrice: "180", cost: "90", available: 4 })]);
    await expect(variantOptions({ ...s.ctx, permissions: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
