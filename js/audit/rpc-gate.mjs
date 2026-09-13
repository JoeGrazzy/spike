if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log('RPC gate skipped: Supabase CI secrets are not configured.');
  process.exit(0);
}
console.log('RPC gate requires project-specific integration cases; credentials detected.');
