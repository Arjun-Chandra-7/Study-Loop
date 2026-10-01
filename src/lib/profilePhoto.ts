"use client";

import { getFirebaseAuth } from "./firebase";

const SIZE = 256;

/** Center-crop and shrink any image the browser can open to a 256 px JPEG. */
async function toSquareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.88));
}

/** Upload a new profile photo; returns its absolute URL for the Firebase profile. */
export async function uploadProfilePhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Pick an image — a JPG or PNG works great.");
  let jpeg: Blob;
  try {
    jpeg = await toSquareJpeg(file);
  } catch {
    throw new Error("That image couldn't be opened. Try a JPG or PNG.");
  }
  const token = await getFirebaseAuth()?.currentUser?.getIdToken();
  if (!token) throw new Error("Sign in again to change your photo.");
  const res = await fetch("/api/profile/avatar", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" }, body: jpeg });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message ?? "Couldn't save your photo. Try again.");
  return new URL(body.url, location.origin).toString();
}
