set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.prevent_self_role_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_dev() and new.role is distinct from old.role then
    new.role := old.role;
  end if;
  return new;
end;
$function$
;


