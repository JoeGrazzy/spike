import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../../../profile.html", import.meta.url), "utf8");

test("profile QR generation uses the SPIKE connect payload and pinned generator", () => {
  assert.match(html, /qrcode-generator@1\.4\.4\/qrcode\.min\.js/);
  assert.match(html, /function spikeQrPayload\(\)\{return `spike:\/\/connect\?uid=\$\{encodeURIComponent\(state\.uid\)\}`;\}/);
  assert.match(html, /qr\.addData\(spikeQrPayload\(\)\)/);
  assert.match(html, /qr\.make\(\)/);
  assert.match(html, /qr\.createImgTag\(6,0\)/);
});

test("profile QR scanner has native detection plus JS fallback and gallery support", () => {
  assert.match(html, /jsqr@1\.4\.0\/dist\/jsQR\.js/);
  assert.match(html, /"BarcodeDetector" in window/);
  assert.match(html, /loadJsQr\(\)/);
  assert.match(html, /window\.jsQR\(/);
  assert.match(html, /getUserMedia\(/);
  assert.match(html, /id="galleryQr"/);
  assert.match(html, /id="qrFile"/);
});

test("scanner rejects foreign URLs and prefers valid SPIKE QR payloads", () => {
  assert.match(html, /Accept only SPIKE's explicit scheme, or same-origin profile links/);
  assert.match(html, /u\.origin===location\.origin/);
  assert.match(html, /for\(const code of codes\|\|\[\]\)\{if\(handleQrValue\(code\.rawValue\)\)break\}/);
});

test("scanner has permission, secure-context, camera, loading, and duplicate-frame protections", () => {
  assert.match(html, /Camera scanning requires a secure HTTPS connection/);
  assert.match(html, /Camera access was blocked/);
  assert.match(html, /No camera was found/);
  assert.match(html, /The camera is busy or unavailable/);
  assert.match(html, /qrScanBusy/);
  assert.match(html, /setScannerStatus\("Starting camera…","loading"\)/);
});
