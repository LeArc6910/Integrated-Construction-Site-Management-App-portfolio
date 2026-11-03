// 휴대폰 사진(수 MB)을 그대로 올리면 약한 신호에서 오래 걸리고 저장 공간도 많이 차지한다.
// 긴 변을 maxSide 픽셀로 줄여 JPEG로 다시 저장한다. 미타공 위치 확인용이라 이 정도면 충분하다.
// 이미지를 못 읽는 형식(일부 HEIC 등)이면 원본을 그대로 돌려준다.
export async function shrinkImage(file, { maxSide = 1600, quality = 0.8 } = {}) {
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  // iOS가 메모리를 바로 돌려주도록 캔버스를 비운다
  canvas.width = 0
  canvas.height = 0
  if (!blob) return file
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
}
