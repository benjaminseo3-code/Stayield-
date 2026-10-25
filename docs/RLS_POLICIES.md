# Row-level security

Every table in the `stayield` schema has RLS **enabled with no policies** (`drizzle/0001_enable_rls.sql`).
The app connects as the table-owning role `stayield_app`, which bypasses RLS, and enforces access in
`src/lib/policies.ts`. RLS is defence in depth: if the Supabase Data API or any `anon`/`authenticated`
key were ever pointed at this schema, they would read nothing (fail closed). The Data API is also disabled
on the project and the schema is not exposed.

If you later expose some data through Supabase clients, write explicit policies. The intended rules, with
`auth.uid()` the user id and `is_admin()` checking `users.role = 'admin'`:

```sql
-- properties: live listings are listed (the locked shape is built server-side, never from this table);
-- owner/admin see their own regardless of status
create policy properties_read on properties for select
  using (status = 'live' or owner_id = auth.uid() or is_admin());

-- reservations, data_submissions, monthly_aggregates: owner/admin, or (aggregates only) an investor
-- with an approved access request
create policy aggregates_read on monthly_aggregates for select using (
  is_admin()
  or exists (select 1 from properties p where p.id = property_id and p.owner_id = auth.uid())
  or exists (select 1 from access_requests r where r.property_id = monthly_aggregates.property_id
             and r.investor_id = auth.uid() and r.status = 'approved'));
create policy reservations_read on reservations for select using (
  is_admin() or exists (select 1 from properties p where p.id = property_id and p.owner_id = auth.uid()));
create policy submissions_admin on data_submissions for select using (is_admin());

-- investor_profiles: the investor, admins, and an owner who holds a request from that investor
create policy profile_read on investor_profiles for select using (
  user_id = auth.uid() or is_admin()
  or exists (select 1 from access_requests r join properties p on p.id = r.property_id
             where r.investor_id = investor_profiles.user_id and p.owner_id = auth.uid()));

-- access_requests / request_messages: the two parties and admins
create policy requests_parties on access_requests for select using (
  investor_id = auth.uid() or is_admin()
  or exists (select 1 from properties p where p.id = property_id and p.owner_id = auth.uid()));
```

Writes always go through the server. Anything not listed stays denied.
