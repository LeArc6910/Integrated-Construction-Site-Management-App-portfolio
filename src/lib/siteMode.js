// 현장 이름에 CRC가 들어가면 작업 체크 방식이 달라진다.
//
// 일반 현장: 경량·합지를 따로 체크하고, 둘 다 되어야 완료 세대.
// CRC 현장: "CRC" 하나만 체크하고, 그 하나로 완료 세대가 된다.
//
// CRC 체크는 새 컬럼을 만들지 않고 기존 light(경량) 컬럼에 그대로 저장한다. CRC 현장은
// 이미 경량 칸만 칠해서 쓰고 있어서(합지는 한 칸도 없다) 데이터를 옮길 필요가 없다.
// 화면·이미지·작업보고에서 이름만 "CRC"로 바꿔 보여주고, 칸은 반쪽이 아니라 전체를 칠한다.

export function isCrcSite(siteName) {
  return /crc/i.test(siteName ?? '')
}

// 세대표를 공유하는 현장은 동이 원본 현장에 달려 있어 체크도 함께 쓴다.
// 그래서 CRC 여부도 원본 현장 이름으로 판단해야 공유하는 현장끼리 같은 방식이 된다.
export function isCrcOwner({ ownerName, siteName }) {
  return isCrcSite(ownerName ?? siteName)
}

// 완료 세대 판정. CRC 현장은 light 하나, 그 외는 light·laminate 둘 다.
export function isUnitDone(check, crc) {
  if (!check) return false
  return crc ? Boolean(check.light) : Boolean(check.light && check.laminate)
}
