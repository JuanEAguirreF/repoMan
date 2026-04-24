import test from "node:test";
import assert from "node:assert/strict";
import { containsSuspiciousExecutableMarker, validateCoverMagic, validateMainFileMagic } from "./file-signature.js";

test("validateCoverMagic accepts png signature for .png", () => {
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]);
  assert.equal(validateCoverMagic(pngBytes, ".png"), true);
});

test("validateCoverMagic rejects mismatch", () => {
  const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
  assert.equal(validateCoverMagic(jpegBytes, ".png"), false);
});

test("validateMainFileMagic accepts PDF signature", () => {
  const pdfBytes = Buffer.from("%PDF-1.7 sample");
  assert.equal(validateMainFileMagic(pdfBytes, ".pdf"), true);
});

test("validateMainFileMagic rejects invalid .cbr signature", () => {
  const fake = Buffer.from("not-a-rar-file");
  assert.equal(validateMainFileMagic(fake, ".cbr"), false);
});

test("containsSuspiciousExecutableMarker detects MZ", () => {
  const mz = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
  assert.equal(containsSuspiciousExecutableMarker(mz), true);
});
