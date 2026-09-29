import { supabase } from '../lib/supabase'

// 팀 공지는 팀마다 하나. 지금 보는 팀(current_team_id)의 공지만 RLS로 보인다.
// 게시·내리기는 팀장·개발자만 할 수 있고, 게시 시각과 게시자는 DB 함수가 찍는다.

export async function fetchTeamNotice() {
  const { data, error } = await supabase
    .from('team_notices')
    .select('team_id, body, updated_by, updated_at')
    .maybeSingle()
  if (error) throw error
  return data
}

export async function saveTeamNotice({ body }) {
  const { error } = await supabase.rpc('set_team_notice', { notice_body: body })
  if (error) throw error
}

export async function clearTeamNotice() {
  const { error } = await supabase.rpc('clear_team_notice')
  if (error) throw error
}

// 공지를 바꾼 화면이 알리면 상단 공지가 바로 다시 받아온다(NoticeBanner)
export const NOTICE_CHANGED_EVENT = 'team-notice-changed'

export function notifyNoticeChanged() {
  window.dispatchEvent(new Event(NOTICE_CHANGED_EVENT))
}
