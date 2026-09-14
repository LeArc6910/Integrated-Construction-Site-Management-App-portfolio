import { supabase } from '../lib/supabase'

const TEST_SITE_NAME = '[테스트] 확인용 현장'

// is_test_data=true인 현장만 대상으로 삼아서, 실제 현장이 잘못 지워지는 일이 없게 한다.
// (DB에서도 "테스트 현장 삭제" 정책이 같은 조건으로 한 번 더 막아준다)
export async function resetTestData() {
  const { error } = await supabase.from('sites').delete().eq('is_test_data', true)
  if (error) throw error
}

// 세대표·미타공까지 있는 현장 하나를 만든다. 항상 같은 이름으로 새로 만들기 위해
// 먼저 기존 테스트 현장을 지운 뒤 다시 생성한다.
export async function generateTestData() {
  await resetTestData()

  const { data: site, error: siteError } = await supabase
    .from('sites')
    .insert({ name: TEST_SITE_NAME, is_test_data: true })
    .select('id')
    .single()
  if (siteError) throw siteError

  const { data: building, error: buildingError } = await supabase
    .from('buildings')
    .insert({ site_id: site.id, name: '101동' })
    .select('id')
    .single()
  if (buildingError) throw buildingError

  // 2호는 2층부터 시작하게 두어 시작 층·타입 표시를 같이 확인할 수 있게 한다
  const { error: linesError } = await supabase.from('building_lines').insert([
    { building_id: building.id, line_no: 1, min_floor: 1, max_floor: 5, unit_type: '84A' },
    { building_id: building.id, line_no: 2, min_floor: 2, max_floor: 5, unit_type: '59B' },
  ])
  if (linesError) throw linesError

  // 1호는 일부만 완료된 상태로, 2호는 미완료 상태로 남겨 진행중/완료 표시를 모두 볼 수 있게 한다
  const checks = []
  for (let floor = 1; floor <= 5; floor++) {
    checks.push({ building_id: building.id, line_no: 1, floor, sheet: 'main', light: true, laminate: floor <= 3 })
  }
  const { error: checksError } = await supabase.from('unit_checks').insert(checks)
  if (checksError) throw checksError

  const { error: defectError } = await supabase.from('defects').insert({
    building_id: building.id,
    line_no: 2,
    floor: 3,
    locations: ['거실'],
    content: '테스트용 미타공 샘플',
  })
  if (defectError) throw defectError

  return site.id
}
