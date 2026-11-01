import { describe, expect, it } from "vitest";
import {
  buildingTypeLabel,
  chunkValues,
  matchesNowMasterSearch,
  sortNowMasterRows,
  toCenterMasterViewRow,
  toClientMasterViewRow
} from "@/lib/masters/now-master";

describe("now row conversion", () => {
  it("converts a now.client row for the client master table", () => {
    expect(
      toClientMasterViewRow({
        id: "c1",
        client_code: " A001 ",
        client_name: "동아화주 ",
        erp_code: "E1",
        labor_code: null,
        pl_code: " ",
        rep_client_code: "R1",
        rep_client_name: "대표화주",
        is_active: false,
        sort_order: 1,
        note: null
      })
    ).toEqual({
      id: "c1",
      clientCode: "A001",
      clientName: "동아화주",
      erpCode: "E1",
      laborCode: "-",
      plCode: "-",
      representativeClient: "R1 대표화주",
      isActive: false,
      note: "-"
    });
  });

  it("converts a now.center row and labels building types", () => {
    expect(
      toCenterMasterViewRow({
        id: "ct1",
        center_name: "이천센터",
        lease_type: "임차센터",
        building_type: "gable",
        address: "경기 이천",
        is_active: true,
        sort_order: 0,
        note: "비고"
      })
    ).toEqual({
      id: "ct1",
      centerName: "이천센터",
      leaseType: "임차센터",
      buildingType: "박공지붕",
      address: "경기 이천",
      isActive: true,
      note: "비고"
    });
    expect(buildingTypeLabel("flat")).toBe("평지붕");
    expect(buildingTypeLabel("rampup")).toBe("램프업 복층");
    expect(buildingTypeLabel("unknown")).toBe("unknown");
    expect(buildingTypeLabel(null)).toBe("-");
  });

  it("sorts active rows first, then sort order, then name", () => {
    const rows = [
      { name: "다", is_active: false, sort_order: 0 },
      { name: "나", is_active: true, sort_order: 2 },
      { name: "가", is_active: true, sort_order: 2 },
      { name: "라", is_active: true, sort_order: 1 }
    ];
    expect(sortNowMasterRows(rows, (row) => row.name).map((row) => row.name)).toEqual(["라", "가", "나", "다"]);
  });
});

describe("display helpers", () => {
  it("matches search text across fields", () => {
    expect(matchesNowMasterSearch("", ["a"])).toBe(true);
    expect(matchesNowMasterSearch("abc", ["xABCx", null])).toBe(true);
    expect(matchesNowMasterSearch("이천", ["평택", undefined])).toBe(false);
  });
});

describe("chunkValues", () => {
  it("splits ids into fixed-size chunks", () => {
    expect(chunkValues([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkValues([], 100)).toEqual([]);
    expect(() => chunkValues([1], 0)).toThrow();
  });
});
