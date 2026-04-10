/**
 * React Native Image / expo-image often handle blob: URLs inconsistently.
 * Converts blob/data/http(s) into a data: URI when needed for reliable display.
 */
export async function resolveImageUriForNative(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith("data:")) {
    return imageUrl;
  }
  if (imageUrl.startsWith("blob:")) {
    const res = await fetch(imageUrl);
    const blob = await res.blob();
    return await blobToDataUri(blob);
  }
  return imageUrl;
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const r = reader.result;
      if (typeof r === "string") resolve(r);
      else reject(new Error("FileReader did not return data URL"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}
