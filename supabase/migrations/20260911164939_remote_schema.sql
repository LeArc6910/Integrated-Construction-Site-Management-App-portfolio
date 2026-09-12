


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."sheet_type" AS ENUM (
    'main',
    'plaster'
);


ALTER TYPE "public"."sheet_type" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    '팀원',
    '팀장',
    '개발자'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1))
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_dev"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ select my_role() = '개발자' $$;


ALTER FUNCTION "public"."is_dev"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_manager"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ select my_role() in ('팀장','개발자') $$;


ALTER FUNCTION "public"."is_manager"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_role"() RETURNS "public"."user_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ select role from profiles where id = auth.uid() $$;


ALTER FUNCTION "public"."my_role"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."actual_salaries" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "year" integer NOT NULL,
    "month" integer NOT NULL,
    "amount" bigint DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."actual_salaries" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."actual_salaries_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."actual_salaries_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."actual_salaries_id_seq" OWNED BY "public"."actual_salaries"."id";



CREATE TABLE IF NOT EXISTS "public"."attendances" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "work_date" "date" NOT NULL,
    "site_id" bigint NOT NULL,
    "hours" numeric(2,1) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."attendances" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."attendances_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."attendances_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."attendances_id_seq" OWNED BY "public"."attendances"."id";



CREATE TABLE IF NOT EXISTS "public"."building_lines" (
    "id" bigint NOT NULL,
    "building_id" bigint NOT NULL,
    "line_no" integer NOT NULL,
    "max_floor" integer NOT NULL
);


ALTER TABLE "public"."building_lines" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."building_lines_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."building_lines_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."building_lines_id_seq" OWNED BY "public"."building_lines"."id";



CREATE TABLE IF NOT EXISTS "public"."buildings" (
    "id" bigint NOT NULL,
    "site_id" bigint NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."buildings" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."buildings_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."buildings_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."buildings_id_seq" OWNED BY "public"."buildings"."id";



CREATE TABLE IF NOT EXISTS "public"."defects" (
    "id" bigint NOT NULL,
    "building_id" bigint NOT NULL,
    "line_no" integer NOT NULL,
    "floor" integer NOT NULL,
    "locations" "text"[] NOT NULL,
    "content" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "resolved" boolean DEFAULT false,
    "resolved_by" "uuid",
    "resolved_at" timestamp with time zone
);


ALTER TABLE "public"."defects" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."defects_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."defects_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."defects_id_seq" OWNED BY "public"."defects"."id";



CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "spent_on" "date" NOT NULL,
    "place" "text",
    "content" "text",
    "amount" integer DEFAULT 0 NOT NULL,
    "receipt_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."expenses_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."expenses_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."expenses_id_seq" OWNED BY "public"."expenses"."id";



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "role" "public"."user_role" DEFAULT '팀원'::"public"."user_role" NOT NULL,
    "rate" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_favorites" (
    "user_id" "uuid" NOT NULL,
    "site_id" bigint NOT NULL
);


ALTER TABLE "public"."site_favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_members" (
    "site_id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."site_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_receipts" (
    "id" bigint NOT NULL,
    "site_id" bigint NOT NULL,
    "year" integer NOT NULL,
    "month" integer NOT NULL,
    "amount" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."site_receipts" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."site_receipts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."site_receipts_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."site_receipts_id_seq" OWNED BY "public"."site_receipts"."id";



CREATE TABLE IF NOT EXISTS "public"."sites" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "contract_amount" bigint DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sites" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."sites_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."sites_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."sites_id_seq" OWNED BY "public"."sites"."id";



CREATE TABLE IF NOT EXISTS "public"."unit_checks" (
    "id" bigint NOT NULL,
    "building_id" bigint NOT NULL,
    "line_no" integer NOT NULL,
    "floor" integer NOT NULL,
    "sheet" "public"."sheet_type" DEFAULT 'main'::"public"."sheet_type" NOT NULL,
    "light" boolean DEFAULT false,
    "light_by" "uuid",
    "light_at" timestamp with time zone,
    "laminate" boolean DEFAULT false,
    "laminate_by" "uuid",
    "laminate_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."unit_checks" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."unit_checks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."unit_checks_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."unit_checks_id_seq" OWNED BY "public"."unit_checks"."id";



CREATE TABLE IF NOT EXISTS "public"."upcoming_sites" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "location" "text",
    "phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."upcoming_sites" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."upcoming_sites_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."upcoming_sites_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."upcoming_sites_id_seq" OWNED BY "public"."upcoming_sites"."id";



CREATE TABLE IF NOT EXISTS "public"."upcoming_visits" (
    "id" bigint NOT NULL,
    "upcoming_site_id" bigint NOT NULL,
    "visit_date" "date" NOT NULL,
    "alarm_enabled" boolean DEFAULT false
);


ALTER TABLE "public"."upcoming_visits" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."upcoming_visits_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."upcoming_visits_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."upcoming_visits_id_seq" OWNED BY "public"."upcoming_visits"."id";



ALTER TABLE ONLY "public"."actual_salaries" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."actual_salaries_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."attendances" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."attendances_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."building_lines" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."building_lines_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."buildings" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."buildings_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."defects" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."defects_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."expenses" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."expenses_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."site_receipts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."site_receipts_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."sites" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."sites_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."unit_checks" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."unit_checks_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."upcoming_sites" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."upcoming_sites_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."upcoming_visits" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."upcoming_visits_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."actual_salaries"
    ADD CONSTRAINT "actual_salaries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."actual_salaries"
    ADD CONSTRAINT "actual_salaries_user_id_year_month_key" UNIQUE ("user_id", "year", "month");



ALTER TABLE ONLY "public"."attendances"
    ADD CONSTRAINT "attendances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendances"
    ADD CONSTRAINT "attendances_user_id_work_date_key" UNIQUE ("user_id", "work_date");



ALTER TABLE ONLY "public"."building_lines"
    ADD CONSTRAINT "building_lines_building_id_line_no_key" UNIQUE ("building_id", "line_no");



ALTER TABLE ONLY "public"."building_lines"
    ADD CONSTRAINT "building_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."buildings"
    ADD CONSTRAINT "buildings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."buildings"
    ADD CONSTRAINT "buildings_site_id_name_key" UNIQUE ("site_id", "name");



ALTER TABLE ONLY "public"."defects"
    ADD CONSTRAINT "defects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_favorites"
    ADD CONSTRAINT "site_favorites_pkey" PRIMARY KEY ("user_id", "site_id");



ALTER TABLE ONLY "public"."site_members"
    ADD CONSTRAINT "site_members_pkey" PRIMARY KEY ("site_id", "user_id");



ALTER TABLE ONLY "public"."site_receipts"
    ADD CONSTRAINT "site_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sites"
    ADD CONSTRAINT "sites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."unit_checks"
    ADD CONSTRAINT "unit_checks_building_id_line_no_floor_sheet_key" UNIQUE ("building_id", "line_no", "floor", "sheet");



ALTER TABLE ONLY "public"."unit_checks"
    ADD CONSTRAINT "unit_checks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."upcoming_sites"
    ADD CONSTRAINT "upcoming_sites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."upcoming_visits"
    ADD CONSTRAINT "upcoming_visits_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_attendances_user_date" ON "public"."attendances" USING "btree" ("user_id", "work_date");



CREATE INDEX "idx_defects_building" ON "public"."defects" USING "btree" ("building_id");



CREATE INDEX "idx_expenses_user_date" ON "public"."expenses" USING "btree" ("user_id", "spent_on");



CREATE INDEX "idx_site_receipts_site" ON "public"."site_receipts" USING "btree" ("site_id", "year", "month");



CREATE INDEX "idx_unit_checks_building" ON "public"."unit_checks" USING "btree" ("building_id", "sheet");



CREATE UNIQUE INDEX "sites_name_key" ON "public"."sites" USING "btree" ("name");



ALTER TABLE ONLY "public"."actual_salaries"
    ADD CONSTRAINT "actual_salaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendances"
    ADD CONSTRAINT "attendances_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendances"
    ADD CONSTRAINT "attendances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."building_lines"
    ADD CONSTRAINT "building_lines_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."buildings"
    ADD CONSTRAINT "buildings_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."defects"
    ADD CONSTRAINT "defects_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."defects"
    ADD CONSTRAINT "defects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."defects"
    ADD CONSTRAINT "defects_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."site_favorites"
    ADD CONSTRAINT "site_favorites_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."site_favorites"
    ADD CONSTRAINT "site_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."site_members"
    ADD CONSTRAINT "site_members_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."site_members"
    ADD CONSTRAINT "site_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."site_receipts"
    ADD CONSTRAINT "site_receipts_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."unit_checks"
    ADD CONSTRAINT "unit_checks_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."unit_checks"
    ADD CONSTRAINT "unit_checks_laminate_by_fkey" FOREIGN KEY ("laminate_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."unit_checks"
    ADD CONSTRAINT "unit_checks_light_by_fkey" FOREIGN KEY ("light_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."upcoming_visits"
    ADD CONSTRAINT "upcoming_visits_upcoming_site_id_fkey" FOREIGN KEY ("upcoming_site_id") REFERENCES "public"."upcoming_sites"("id") ON DELETE CASCADE;



ALTER TABLE "public"."actual_salaries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attendances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."building_lines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."buildings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."defects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."unit_checks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."upcoming_sites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."upcoming_visits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "개발자 프로필 관리" ON "public"."profiles" FOR UPDATE USING ("public"."is_dev"());



CREATE POLICY "동 관리" ON "public"."buildings" USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "동 조회" ON "public"."buildings" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "라인 관리" ON "public"."building_lines" USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "라인 조회" ON "public"."building_lines" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "미타공 등록" ON "public"."defects" USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "미타공 조회" ON "public"."defects" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "방문일정 관리" ON "public"."upcoming_visits" USING ("public"."is_manager"());



CREATE POLICY "본인 지출 기록" ON "public"."expenses" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "본인 출근 기록" ON "public"."attendances" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "본인 프로필 수정" ON "public"."profiles" FOR UPDATE USING (("id" = "auth"."uid"()));



CREATE POLICY "본인 프로필 조회" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "세대표 조회" ON "public"."unit_checks" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "세대표 체크" ON "public"."unit_checks" USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "수령금액 관리" ON "public"."site_receipts" USING ("public"."is_manager"());



CREATE POLICY "실급여 수정" ON "public"."actual_salaries" FOR UPDATE USING ("public"."is_manager"());



CREATE POLICY "실급여 입력" ON "public"."actual_salaries" FOR INSERT WITH CHECK ("public"."is_manager"());



CREATE POLICY "실급여 조회" ON "public"."actual_salaries" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."is_manager"()));



CREATE POLICY "예정현장 관리" ON "public"."upcoming_sites" USING ("public"."is_manager"());



CREATE POLICY "즐겨찾기 관리" ON "public"."site_favorites" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "지출 조회" ON "public"."expenses" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."is_manager"()));



CREATE POLICY "출근 조회" ON "public"."attendances" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."is_manager"()));



CREATE POLICY "투입인원 관리" ON "public"."site_members" USING ("public"."is_manager"());



CREATE POLICY "프로필 조회" ON "public"."profiles" FOR SELECT USING ((("id" = "auth"."uid"()) OR "public"."is_manager"()));



CREATE POLICY "현장 등록" ON "public"."sites" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "현장 수정" ON "public"."sites" FOR UPDATE USING ("public"."is_manager"());



CREATE POLICY "현장 조회" ON "public"."sites" FOR SELECT USING (("auth"."uid"() IS NOT NULL));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_dev"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_dev"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_dev"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_manager"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_manager"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_manager"() TO "service_role";



GRANT ALL ON FUNCTION "public"."my_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."my_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_role"() TO "service_role";


















GRANT ALL ON TABLE "public"."actual_salaries" TO "anon";
GRANT ALL ON TABLE "public"."actual_salaries" TO "authenticated";
GRANT ALL ON TABLE "public"."actual_salaries" TO "service_role";



GRANT ALL ON SEQUENCE "public"."actual_salaries_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."actual_salaries_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."actual_salaries_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."attendances" TO "anon";
GRANT ALL ON TABLE "public"."attendances" TO "authenticated";
GRANT ALL ON TABLE "public"."attendances" TO "service_role";



GRANT ALL ON SEQUENCE "public"."attendances_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."attendances_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."attendances_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."building_lines" TO "anon";
GRANT ALL ON TABLE "public"."building_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."building_lines" TO "service_role";



GRANT ALL ON SEQUENCE "public"."building_lines_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."building_lines_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."building_lines_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."buildings" TO "anon";
GRANT ALL ON TABLE "public"."buildings" TO "authenticated";
GRANT ALL ON TABLE "public"."buildings" TO "service_role";



GRANT ALL ON SEQUENCE "public"."buildings_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."buildings_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."buildings_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."defects" TO "anon";
GRANT ALL ON TABLE "public"."defects" TO "authenticated";
GRANT ALL ON TABLE "public"."defects" TO "service_role";



GRANT ALL ON SEQUENCE "public"."defects_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."defects_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."defects_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON SEQUENCE "public"."expenses_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."expenses_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."expenses_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."site_favorites" TO "anon";
GRANT ALL ON TABLE "public"."site_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."site_favorites" TO "service_role";



GRANT ALL ON TABLE "public"."site_members" TO "anon";
GRANT ALL ON TABLE "public"."site_members" TO "authenticated";
GRANT ALL ON TABLE "public"."site_members" TO "service_role";



GRANT ALL ON TABLE "public"."site_receipts" TO "anon";
GRANT ALL ON TABLE "public"."site_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."site_receipts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."site_receipts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."site_receipts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."site_receipts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."sites" TO "anon";
GRANT ALL ON TABLE "public"."sites" TO "authenticated";
GRANT ALL ON TABLE "public"."sites" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sites_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sites_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sites_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."unit_checks" TO "anon";
GRANT ALL ON TABLE "public"."unit_checks" TO "authenticated";
GRANT ALL ON TABLE "public"."unit_checks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."unit_checks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."unit_checks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."unit_checks_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."upcoming_sites" TO "anon";
GRANT ALL ON TABLE "public"."upcoming_sites" TO "authenticated";
GRANT ALL ON TABLE "public"."upcoming_sites" TO "service_role";



GRANT ALL ON SEQUENCE "public"."upcoming_sites_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."upcoming_sites_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."upcoming_sites_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."upcoming_visits" TO "anon";
GRANT ALL ON TABLE "public"."upcoming_visits" TO "authenticated";
GRANT ALL ON TABLE "public"."upcoming_visits" TO "service_role";



GRANT ALL ON SEQUENCE "public"."upcoming_visits_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."upcoming_visits_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."upcoming_visits_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


  create policy "영수증 업로드"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'receipts'::text) AND (auth.uid() IS NOT NULL)));



  create policy "영수증 조회"
  on "storage"."objects"
  as permissive
  for select
  to public
using (((bucket_id = 'receipts'::text) AND (auth.uid() IS NOT NULL)));



