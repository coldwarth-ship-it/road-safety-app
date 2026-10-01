// Server-side only. Cron supplies a secret API key from Supabase Vault.
// The wrapper rejects publishable keys and user JWTs before any deletion.
import { withSupabase } from 'npm:@supabase/server@1';

export async function cleanupChat(admin, now = () => Date.now()) {
  const started = now();
  let messages = 0;
  let images = 0;
  let complete = false;
  // Bound each invocation. Unfinished batches are retried at the next hourly run.
  for (let batch = 0; batch < 20 && now() - started < 40000; batch++) {
    const result = await admin.rpc('chat_cleanup_candidates', { batch_size: 100 });
    if (result.error) throw new Error('Database cleanup failed');
    const row = result.data?.[0];
    if (!row || !Number.isInteger(row.removed_messages) || !Array.isArray(row.image_paths)) {
      throw new Error('Unexpected cleanup response');
    }
    messages += row.removed_messages;
    const paths = [...new Set(row.image_paths)];
    if (paths.length) {
      const removed = await admin.storage.from('chat-images').remove(paths);
      if (removed.error) {
        // SQL already removed expired messages, but retained Storage metadata.
        // Orphaned files remain discoverable by the RPC and retry next run.
        throw new Error('Storage cleanup failed; files will retry next run');
      }
      images += paths.length;
    }
    if (row.removed_messages === 0 && paths.length === 0) {
      complete = true;
      break;
    }
  }
  return { ok: true, retention_days: 30, messages_deleted: messages, images_deleted: images, complete };
}

Deno.serve(withSupabase({ auth: 'secret' }, async (req, ctx) => {
  if (req.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 });
  try {
    const result = await cleanupChat(ctx.supabaseAdmin);
    console.log(JSON.stringify(result));
    return Response.json(result);
  } catch (error) {
    console.error(error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}));
