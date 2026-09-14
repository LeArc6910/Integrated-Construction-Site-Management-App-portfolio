import { supabase } from '../lib/supabase'

export async function fetchChecklist({ siteId }) {
  const { data, error } = await supabase
    .from('site_checklist_items')
    .select('id, content, checked, checked_by, checked_at, created_at')
    .eq('site_id', siteId)
    .order('created_at')
  if (error) throw error
  return data
}

export async function addChecklistItem({ siteId, userId }) {
  const { data, error } = await supabase
    .from('site_checklist_items')
    .insert({ site_id: siteId, content: '', created_by: userId })
    .select('id, content, checked, checked_by, checked_at, created_at')
    .single()
  if (error) throw error
  return data
}

export async function updateChecklistContent({ id, content }) {
  const { error } = await supabase.from('site_checklist_items').update({ content }).eq('id', id)
  if (error) throw error
}

export async function setChecklistChecked({ id, checked, userId }) {
  const { error } = await supabase
    .from('site_checklist_items')
    .update({
      checked,
      checked_by: checked ? userId : null,
      checked_at: checked ? new Date().toISOString() : null,
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteChecklistItem({ id }) {
  const { error } = await supabase.from('site_checklist_items').delete().eq('id', id)
  if (error) throw error
}
