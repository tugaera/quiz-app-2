"use client";

import { QRCodeSVG } from "qrcode.react";

export default function QRCodeDisplay({ url }: { url: string }) {
  return (
    <div className="bg-white p-4 rounded-xl">
      <QRCodeSVG value={url} size={300} level="M" />
    </div>
  );
}
