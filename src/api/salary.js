import { supabase } from '../lib/supabase'

// 실급여는 매니저가 입력하므로 본인 것은 조회만 한다. 입력 없으면 null.
export async function fetchActualSalary({ userId, year, month }) {
  const { data, error } = await supabase
    .from('actual_salaries')
    .select('amount')
    .eq('user_id', userId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle()
  if (error) throw error
  return data?.amount ?? null
}
