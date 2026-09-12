import { checkIn } from '../api/attendance'
import { addExpense, uploadReceipt } from '../api/expense'
import { addDefect, addUnitLog, clearUnitCheck, defectSummary, deleteDefect, resolveDefect, setUnitCheck } from '../api/unitSheet'
import { idbDelete, idbGetAll, idbPut, STORES } from './idb'

// 큐에 쌓인 기록을 실제로 Supabase에 저장하는 방법. attendance/expense/defect API는
// client_id로 upsert하므로, 같은 항목이 두 번 전송돼도 서버에 중복 저장되지 않는다.
// unit_checks는 (building_id, line_no, floor, sheet) upsert라서 원래부터 멱등이다.
const HANDLERS = {
  attendance: (payload) => checkIn(payload),
  expense: async (payload) => {
    const receiptPath = payload.receiptFile
      ? await uploadReceipt({ userId: payload.userId, file: payload.receiptFile })
      : null
    await addExpense({ ...payload, receiptPath })
  },
  unitCheck: async (payload) => {
    if (payload.mode === 'clear') {
      await clearUnitCheck({ buildingId: payload.buildingId, lineNo: payload.lineNo, floor: payload.floor, sheet: payload.sheet })
    } else {
      await setUnitCheck({
        buildingId: payload.buildingId,
        lineNo: payload.lineNo,
        floor: payload.floor,
        sheet: payload.sheet,
        field: payload.field,
        value: payload.value,
        userId: payload.userId,
      })
    }
    await addUnitLog({
      buildingId: payload.buildingId,
      lineNo: payload.lineNo,
      floor: payload.floor,
      sheet: payload.sheet,
      action: payload.action,
      detail: payload.detail,
      userId: payload.userId,
    })
  },
  defectAdd: async (payload) => {
    const defect = await addDefect(payload)
    if (!defect) return // 이미 등록된 요청(재시도)이면 로그도 다시 남기지 않는다
    await addUnitLog({
      buildingId: payload.buildingId,
      lineNo: payload.lineNo,
      floor: payload.floor,
      sheet: 'main',
      action: '미타공 등록',
      detail: defectSummary(defect),
      userId: payload.userId,
    })
  },
  defectResolve: async (payload) => {
    await resolveDefect({ id: payload.id, userId: payload.userId })
    await addUnitLog({
      buildingId: payload.buildingId,
      lineNo: payload.lineNo,
      floor: payload.floor,
      sheet: 'main',
      action: '미타공 처리 완료',
      detail: payload.detail,
      userId: payload.userId,
    })
  },
  defectDelete: async (payload) => {
    await deleteDefect({ id: payload.id })
    await addUnitLog({
      buildingId: payload.buildingId,
      lineNo: payload.lineNo,
      floor: payload.floor,
      sheet: 'main',
      action: '미타공 체크 취소',
      detail: payload.detail,
      userId: payload.userId,
    })
  },
}

export async function enqueueWrite(kind, payload) {
  await idbPut(STORES.outbox, { clientId: payload.clientId, kind, payload, createdAt: new Date().toISOString() })
}

let flushing = false

// 큐는 기록된 순서를 지키기 위해 한 번에 하나씩 순차적으로 보낸다. 중간에 실패하면 거기서
// 멈추고, 다음 online 이벤트 때 이어서 재시도한다(뒤에 있는 기록이 먼저 저장되지 않도록).
export async function flushQueue() {
  if (flushing || !navigator.onLine) return
  flushing = true
  let syncedAny = false
  try {
    const items = (await idbGetAll(STORES.outbox)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    for (const item of items) {
      await HANDLERS[item.kind](item.payload)
      await idbDelete(STORES.outbox, item.clientId)
      syncedAny = true
    }
  } finally {
    flushing = false
    if (syncedAny) window.dispatchEvent(new Event('offline-queue-flushed'))
  }
}

window.addEventListener('online', () => {
  flushQueue().catch(() => {
    // 실패한 항목은 큐에 그대로 남아 다음 online 이벤트 때 다시 시도된다
  })
})
