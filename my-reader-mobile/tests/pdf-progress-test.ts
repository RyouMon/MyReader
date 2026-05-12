import { pdfEqualPageProgressPercent } from "@/src/features/reader/components/reader/native-pdf/pdfProgress";

describe("pdfEqualPageProgressPercent", () => {
  test("returns 0 when total page count is invalid", () => {
    expect(pdfEqualPageProgressPercent(0, 0)).toBe(0);
    expect(pdfEqualPageProgressPercent(5, -1)).toBe(0);
  });

  test("clamps current page into valid range and returns expected percent", () => {
    expect(pdfEqualPageProgressPercent(-1, 5)).toBe(20);
    expect(pdfEqualPageProgressPercent(2, 5)).toBe(60);
    expect(pdfEqualPageProgressPercent(99, 5)).toBe(100);
  });

  test("returns 100 for single-page document", () => {
    expect(pdfEqualPageProgressPercent(0, 1)).toBe(100);
  });
});
