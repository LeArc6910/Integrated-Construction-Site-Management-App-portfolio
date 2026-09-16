import { checkKey } from '../api/unitSheet'
import {
  buildingSummary,
  coreGroups,
  hasCoreInfo,
  inLine,
  lineUnitCount,
  sharedFloorsOf,
} from './unitSheetLayout'

// 세대표를 한 장짜리 가로 이미지로 그린다. 화면 표(DOM)를 캡처하지 않고 Canvas에 직접 그리는
// 이유: 화면에는 확대/축소(transform)·미타공·석고 표시가 섞여 있고, 공유용 이미지는 경량·합지만
// 칠한 별도 레이아웃이 필요해서 DOM 캡처가 오히려 복잡하다.

const COLORS = {
  background: '#ffffff',
  text: '#1c2321',
  sub: '#6b6b66',
  grid: '#c9c8c1',
  head: '#efefec',
  hatchBase: '#f3f3f0',
  hatchLine: '#c9c8c1',
  unitNo: '#8a8a84',
  // 카카오톡으로 보내면 압축되면서 옅은 색이 날아가서, 화면보다 조금 진한 색을 쓴다
  light: '#f5b77a',
  laminate: '#7fd3b8',
  highlight: '#e02424',
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Pretendard', 'Malgun Gothic', sans-serif"

const PAD = 28
const HEADER_H = 96
const BUILDING_GAP = 32
const NAME_H = 26
const FLOOR_W = 44
const CELL_W = 46
const CELL_H = 24
const LINE_HEAD_H = 34
const SUMMARY_H = 22
const TOTAL_H = 24
const MIN_WIDTH = 560

// iOS Safari는 캔버스 면적이 약 1,670만 화소를 넘으면 그리지 못하고, 브라우저 공통으로 한 변
// 16,384px 제한이 있다. 큰 현장은 해상도 배율을 낮춰 한도 안에 들어오게 한다.
const MAX_PIXELS = 16_000_000
const MAX_SIDE = 16_000

function pad2(n) {
  return String(n).padStart(2, '0')
}

export function todayString(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

// 세대 번호: 17층 1호 → 1701
function unitNumber(floor, lineNo) {
  return `${floor}${pad2(lineNo)}`
}

// 완료 세대 = 메인 세대표에서 경량·합지가 둘 다 체크된 세대 (현장관리 목록의 완료 기준과 같다)
export function countCompletion(buildings, checks) {
  let total = 0
  let completed = 0
  buildings.forEach((building) => {
    building.lines.forEach((line) => {
      total += lineUnitCount(line)
      for (let floor = line.min_floor ?? 1; floor <= line.max_floor; floor++) {
        const check = checks[checkKey(building.id, line.line_no, floor, 'main')]
        if (check?.light && check?.laminate) completed += 1
      }
    })
  })
  return { total, completed }
}

function drawHatch(ctx, x, y, w, h) {
  ctx.fillStyle = COLORS.hatchBase
  ctx.fillRect(x, y, w, h)
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.strokeStyle = COLORS.hatchLine
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let offset = -h; offset < w; offset += 7) {
    ctx.moveTo(x + offset, y + h)
    ctx.lineTo(x + offset + h, y)
  }
  ctx.stroke()
  ctx.restore()
}

function strokeCell(ctx, x, y, w, h) {
  ctx.strokeStyle = COLORS.grid
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w, h)
}

function centerText(ctx, text, x, y, w, h, { size = 11, weight = 400, color = COLORS.text } = {}) {
  ctx.fillStyle = color
  ctx.font = `${weight} ${size}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + w / 2, y + h / 2, Math.max(4, w - 4))
}

function drawLegend(ctx, rightX, y, withHighlight) {
  const items = [
    { label: '경량', draw: (x, sy) => fillSwatch(ctx, x, sy, COLORS.light) },
    { label: '합지', draw: (x, sy) => fillSwatch(ctx, x, sy, COLORS.laminate) },
  ]
  if (withHighlight) {
    items.push({
      label: '금일 작업',
      draw: (x, sy) => {
        ctx.fillStyle = '#fff'
        ctx.fillRect(x, sy, 18, 14)
        ctx.strokeStyle = COLORS.highlight
        ctx.lineWidth = 2.5
        ctx.strokeRect(x + 1.25, sy + 1.25, 15.5, 11.5)
      },
    })
  }

  ctx.font = `500 13px ${FONT}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  const widths = items.map((item) => 18 + 6 + ctx.measureText(item.label).width)
  const totalWidth = widths.reduce((sum, w) => sum + w, 0) + (items.length - 1) * 16
  let x = rightX - totalWidth
  items.forEach((item, index) => {
    item.draw(x, y)
    ctx.fillStyle = COLORS.text
    ctx.font = `500 13px ${FONT}`
    ctx.textAlign = 'left'
    ctx.fillText(item.label, x + 24, y + 7)
    x += widths[index] + 16
  })
}

function fillSwatch(ctx, x, y, color) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, 18, 14)
  ctx.strokeStyle = COLORS.grid
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, 17, 13)
}

// buildings: 세대표 동 목록, checks: loadSiteSheet가 돌려주는 체크 맵
// highlightKeys: 빨간 테두리로 강조할 세대 cellKey(building-line-floor) 집합 (작업보고 미리보기용)
export function renderUnitSheetImage({ title, buildings, checks, highlightKeys = null, date = new Date() }) {
  const drawable = buildings.filter((building) => building.lines.length > 0)
  const floors = sharedFloorsOf(drawable)
  const withCore = drawable.some(hasCoreInfo)
  const { total, completed } = countCompletion(drawable, checks)

  const widths = drawable.map((building) => FLOOR_W + building.lines.length * CELL_W)
  const contentWidth = widths.reduce((sum, w) => sum + w, 0) + Math.max(0, drawable.length - 1) * BUILDING_GAP
  const tableHeight =
    NAME_H + LINE_HEAD_H + floors.length * CELL_H + SUMMARY_H + (withCore ? SUMMARY_H : 0) + TOTAL_H
  const width = Math.max(MIN_WIDTH, PAD * 2 + contentWidth)
  const height = PAD + HEADER_H + (drawable.length ? tableHeight : 40) + PAD

  const scale = Math.min(2, Math.sqrt(MAX_PIXELS / (width * height)), MAX_SIDE / width, MAX_SIDE / height)

  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(width * scale)
  canvas.height = Math.floor(height * scale)
  // 화면에 미리보기로 띄울 때 실제 글자 크기로 보이도록 배율 적용 전 폭을 같이 넘긴다
  canvas.logicalWidth = width
  const ctx = canvas.getContext('2d')
  ctx.scale(scale, scale)

  ctx.fillStyle = COLORS.background
  ctx.fillRect(0, 0, width, height)

  // 상단: 현장 이름, 전체 세대 대비 완료 세대, 우측 상단 범례
  ctx.fillStyle = COLORS.text
  ctx.font = `700 24px ${FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(title, PAD, PAD + 24, width - PAD * 2 - 260)

  const percent = total > 0 ? Math.round((completed / total) * 100) : 0
  ctx.font = `600 16px ${FONT}`
  ctx.fillText(`완료 ${completed} / 전체 ${total}세대 (${percent}%)`, PAD, PAD + 54)
  ctx.fillStyle = COLORS.sub
  ctx.font = `400 12px ${FONT}`
  ctx.fillText(`${todayString(date)} 기준 · 완료 = 경량·합지 모두 체크된 세대`, PAD, PAD + 76)

  drawLegend(ctx, width - PAD, PAD + 8, Boolean(highlightKeys))

  if (drawable.length === 0) {
    ctx.fillStyle = COLORS.sub
    ctx.font = `400 14px ${FONT}`
    ctx.fillText('등록된 동이 없습니다.', PAD, PAD + HEADER_H + 20)
    return canvas
  }

  let x = PAD
  const top = PAD + HEADER_H

  drawable.forEach((building, index) => {
    const lines = building.lines
    const tableWidth = widths[index]

    ctx.fillStyle = COLORS.text
    ctx.font = `700 15px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(building.name, x, top + 17, tableWidth)

    let y = top + NAME_H

    // 호·타입 머리행
    ctx.fillStyle = COLORS.head
    ctx.fillRect(x, y, tableWidth, LINE_HEAD_H)
    strokeCell(ctx, x, y, FLOOR_W, LINE_HEAD_H)
    lines.forEach((line, i) => {
      const cx = x + FLOOR_W + i * CELL_W
      strokeCell(ctx, cx, y, CELL_W, LINE_HEAD_H)
      if (line.unit_type) {
        centerText(ctx, `${line.line_no}호`, cx, y + 2, CELL_W, LINE_HEAD_H / 2, { size: 11, weight: 600 })
        centerText(ctx, line.unit_type, cx, y + LINE_HEAD_H / 2 - 1, CELL_W, LINE_HEAD_H / 2, {
          size: 10,
          color: COLORS.sub,
        })
      } else {
        centerText(ctx, `${line.line_no}호`, cx, y, CELL_W, LINE_HEAD_H, { size: 11, weight: 600 })
      }
    })
    y += LINE_HEAD_H

    // 층별 세대 칸
    const highlighted = []
    floors.forEach((floor) => {
      ctx.fillStyle = COLORS.head
      ctx.fillRect(x, y, FLOOR_W, CELL_H)
      strokeCell(ctx, x, y, FLOOR_W, CELL_H)
      centerText(ctx, `${floor}F`, x, y, FLOOR_W, CELL_H, { size: 11, weight: 600 })

      lines.forEach((line, i) => {
        const cx = x + FLOOR_W + i * CELL_W
        if (!inLine(line, floor)) {
          drawHatch(ctx, cx, y, CELL_W, CELL_H)
          strokeCell(ctx, cx, y, CELL_W, CELL_H)
          return
        }

        ctx.fillStyle = '#fff'
        ctx.fillRect(cx, y, CELL_W, CELL_H)
        const check = checks[checkKey(building.id, line.line_no, floor, 'main')]
        if (check?.light) {
          ctx.fillStyle = COLORS.light
          ctx.fillRect(cx, y, CELL_W / 2, CELL_H)
        }
        if (check?.laminate) {
          ctx.fillStyle = COLORS.laminate
          ctx.fillRect(cx + CELL_W / 2, y, CELL_W / 2, CELL_H)
        }
        strokeCell(ctx, cx, y, CELL_W, CELL_H)
        const colored = check?.light || check?.laminate
        centerText(ctx, unitNumber(floor, line.line_no), cx, y, CELL_W, CELL_H, {
          size: 10,
          color: colored ? COLORS.text : COLORS.unitNo,
        })

        if (highlightKeys?.has(`${building.id}-${line.line_no}-${floor}`)) highlighted.push({ cx, cy: y })
      })
      y += CELL_H
    })

    // 테두리는 옆 칸의 격자선에 덮이지 않도록 칸을 다 그린 뒤 마지막에 올린다
    highlighted.forEach(({ cx, cy }) => {
      ctx.strokeStyle = COLORS.highlight
      ctx.lineWidth = 3
      ctx.strokeRect(cx + 1.5, cy + 1.5, CELL_W - 3, CELL_H - 3)
    })

    // 하단 요약: 호수 → 코어(연속 병합) → 동 이름·총 세대수·최고층
    ctx.fillStyle = COLORS.head
    ctx.fillRect(x, y, tableWidth, SUMMARY_H)
    strokeCell(ctx, x, y, FLOOR_W, SUMMARY_H)
    lines.forEach((line, i) => {
      const cx = x + FLOOR_W + i * CELL_W
      strokeCell(ctx, cx, y, CELL_W, SUMMARY_H)
      centerText(ctx, `${line.line_no}호`, cx, y, CELL_W, SUMMARY_H, { size: 11, weight: 600 })
    })
    y += SUMMARY_H

    if (withCore) {
      ctx.fillStyle = COLORS.head
      ctx.fillRect(x, y, FLOOR_W, SUMMARY_H)
      strokeCell(ctx, x, y, FLOOR_W, SUMMARY_H)
      centerText(ctx, '코어', x, y, FLOOR_W, SUMMARY_H, { size: 10, color: COLORS.sub })
      let cx = x + FLOOR_W
      coreGroups(lines).forEach((group) => {
        const w = group.span * CELL_W
        ctx.fillStyle = '#fff'
        ctx.fillRect(cx, y, w, SUMMARY_H)
        strokeCell(ctx, cx, y, w, SUMMARY_H)
        if (group.label) centerText(ctx, group.label, cx, y, w, SUMMARY_H, { size: 11 })
        cx += w
      })
      y += SUMMARY_H
    }

    const { total: buildingTotal, maxFloor } = buildingSummary(building)
    ctx.fillStyle = COLORS.head
    ctx.fillRect(x, y, tableWidth, TOTAL_H)
    strokeCell(ctx, x, y, tableWidth, TOTAL_H)
    centerText(ctx, `${building.name} · ${buildingTotal}세대 · ${maxFloor}F`, x, y, tableWidth, TOTAL_H, {
      size: 11,
      weight: 600,
    })

    x += tableWidth + BUILDING_GAP
  })

  return canvas
}

function safeFileName(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_')
}

export function sheetImageFileName(title, date = new Date()) {
  return `${safeFileName(title)}_세대표_${todayString(date)}.png`
}

// toBlob은 비동기라 기다리는 사이 iOS가 "사용자가 누른 직후" 상태를 잃어 공유 창을 막는다.
// toDataURL로 같은 흐름 안에서 바로 파일을 만들어, 버튼을 누른 이벤트 안에서 공유를 호출한다.
export function canvasToFile(canvas, fileName) {
  const dataUrl = canvas.toDataURL('image/png')
  const binary = atob(dataUrl.split(',')[1])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], fileName, { type: 'image/png' })
}

function isTouchDevice() {
  return window.matchMedia?.('(pointer: coarse)').matches ?? false
}

export function canShareFile(file) {
  return Boolean(navigator.canShare?.({ files: [file] }))
}

// 휴대폰에서는 공유 창의 "이미지 저장"으로 사진첩에 바로 저장하게 한다. 홈 화면에 추가한
// iOS 앱에서는 다운로드 링크를 누르면 앱 안에 이미지가 열려 되돌아올 방법이 없어서다.
// PC 브라우저는 일반 파일 다운로드로 받는다.
export async function saveImageFile(file) {
  if (isTouchDevice() && canShareFile(file)) {
    try {
      await navigator.share({ files: [file] })
      return 'shared'
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled'
      // 공유가 막힌 환경이면 아래 다운로드로 넘어간다
    }
  }

  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}
