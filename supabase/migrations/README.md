# Remote migration history

The connected Supabase project records these migrations. They were applied directly through the Supabase management connection; the source archive had no migration files, so this folder is a manifest rather than a replayable SQL history.

| Version | Migration |
|---|---|
| 20261118182458 | `spike_application_foundation_v1` |
| 20261118182603 | `spike_security_hardening_v1_1` |
| 20261118182628 | `spike_api_access_corrections_v1_2` |
| 20261118182902 | `spike_policy_and_message_fixes_v1_3` |
| 20261118183107 | `spike_social_compatibility_api_v1_4` |
| 20261118183158 | `spike_presence_privacy_fix_v1_5` |
| 20261118183405 | `spike_api_invoker_hardening_v1_6` |
| 20261118183414 | `spike_follow_request_upsert_fix_v1_7` |
| 20261118183706 | `spike_rooms_compatibility_and_dm_v1_8` |
| 20261118183728 | `spike_room_rpc_grants_v1_9` |
| 20261118183749 | `spike_room_start_rpc_v1_10` |
| 20261118183944 | `spike_room_fk_indexes_v1_11` |
| 20261118184329 | `spike_room_capacity_and_chat_guards_v1_12` |
| 20261118184342 | `spike_room_realtime_authorization_v1_13` |
| 20261118184507 | `spike_room_rpc_acl_hardening_v1_14` |
| 20261118205843 | `spike_room_leave_host_handoff_v1_15` |
| 20261118205959 | `spike_opt_in_mfa_rls_and_dml_enforcement_v1_16` |
| 20261118211133 | `spike_single_owner_admin_access` |

The two latest remediation migrations are included as SQL files in this folder. The first 15 historical migration bodies are still unavailable in this archive; only their remote version/name records are known. The Supabase CLI is not installed in the current editing environment, so the canonical baseline export must be completed from an authenticated developer machine. Do not reset or replay this partial folder against production.

To create the canonical local SQL snapshot, authenticate the Supabase CLI and run:

```bash
supabase link --project-ref veagqanfilmbchlvlpcc
supabase db pull
```

Review the generated SQL before committing it. See `../../SUPABASE_SETUP.md` for the applied schema inventory, security boundaries, browser configuration, and remaining production integration work.
