import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomPassword(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);
    const callerId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const orgId = typeof body.orgId === "string" ? body.orgId : "";
    const targetUserId = typeof body.userId === "string" ? body.userId : "";
    const newPassword = typeof body.password === "string" ? body.password : "";
    if (!/^[0-9a-f-]{36}$/i.test(orgId) || !/^[0-9a-f-]{36}$/i.test(targetUserId)) {
      return json({ error: "A valid workspace and member are required" }, 400);
    }
    if (newPassword && (newPassword.length < 6 || newPassword.length > 72)) {
      return json({ error: "Password must be 6–72 characters" }, 400);
    }

    // Caller must be an active admin/owner of this workspace.
    const { data: callerMembership } = await admin
      .from("team_members")
      .select("role, status")
      .eq("user_id", callerId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!callerMembership || callerMembership.status !== "active" ||
        !["owner", "admin"].includes(callerMembership.role)) {
      return json({ error: "Only workspace admins can change passwords" }, 403);
    }

    // Target must be an active member of the same workspace, not the owner.
    const { data: targetMember } = await admin
      .from("team_members")
      .select("role, status, user_id")
      .eq("user_id", targetUserId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!targetMember || targetMember.status !== "active") {
      return json({ error: "That member is not in this workspace" }, 404);
    }
    if (targetMember.role === "owner") {
      return json({ error: "The workspace owner's password cannot be changed here" }, 403);
    }

    const password = newPassword || randomPassword(10);
    const { error: updateError } = await admin.auth.admin.updateUserById(targetUserId, { password });
    if (updateError) return json({ error: updateError.message }, 502);

    return json({ ok: true, password });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Could not change the password" },
      500,
    );
  }
});
